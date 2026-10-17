#!/usr/bin/env node
// Isolated loopback-only GmbH quote signer. Never expose the signing key,
// use this process as a protocol oracle, or load it into the public indexer.
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Wallet,Contract,Interface,JsonRpcProvider,zeroPadValue,keccak256} from "ethers";
import {buildManagedQuote,MANAGED_QUOTE_TYPES} from "./quote-service.mjs";

const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const CATALOG=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
const EXECUTION_ABI=[
 "function relayerOwner() view returns (address)",
 "function sourceRegistry() view returns (address)",
 "function interchainFeeRecipient() view returns (address)",
 "function quoteLifetimeSeconds() view returns (uint64)",
 "function MAX_QUOTE_LIFETIME() view returns (uint256)",
 "function execute((address payer,address gateway,bytes32 routeId,uint32 destinationDomain,bytes32 recipient,uint32 finalDestinationDomain,bytes32 finalRecipient,bytes32 onwardRouteId,uint256 amount,uint256 bridgeValueWei,uint256 interchainFeeWei,uint256 nonce,uint64 issuedAt),bytes signature) payable returns (bytes32)"
];
const BRIDGE_ABI=[
 "function quoteILN(uint32,bytes32,uint256) view returns (uint256,uint256,uint256,uint256)"
];
const required=k=>{const v=(process.env[k]||"").trim();if(!v)throw Error("Missing "+k);return v};
const signer=new Wallet(required("XITA_INTERCHAIN_QUOTE_PRIVATE_KEY"));
const sourceAddresses=Object.fromEntries(
 ["xgrchain","base","polygon","arbitrum"].map(name=>[
  name,String(process.env["XITA_INTERCHAIN_"+name.toUpperCase()+"_ADAPTER"]||
   process.env["XITA_MANAGED_"+name.toUpperCase()+"_EXECUTION_ADDRESS"]||"").trim()
 ])
);
const providers=new Map();
async function chain(name){
 const cfg=CATALOG.chains[name];
 if(!cfg?.rpcUrls?.[0])throw Error("Unsupported chain");
 if(!providers.has(name))providers.set(name,new JsonRpcProvider(cfg.rpcUrls[0]));
 const provider=providers.get(name);
 const network=await provider.getNetwork();
 if(network.chainId!==BigInt(cfg.chainId))throw Error("Chain RPC identity mismatch");
 return provider;
}
const quoteIface=new Interface(EXECUTION_ABI);
let lastPriceSnapshot=null,lastPriceAt=0,inflightPriceFetch=null;
async function getSnapshot(){
 if(lastPriceSnapshot&&Date.now()-lastPriceAt<20000)
  return lastPriceSnapshot;
 if(inflightPriceFetch)return inflightPriceFetch;
 inflightPriceFetch=fetchUncachedPrices();
 try{return await inflightPriceFetch;}
 finally{inflightPriceFetch=null;}
}
async function fetchUncachedPrices(){
 const ids=[...new Set(Object.values((await import("./fee-quote.mjs")).COINGECKO_GAS_COIN_IDS))].join(",");
 const url="https://api.coingecko.com/api/v3/simple/price?ids="+ids+
  "&vs_currencies=usd&include_last_updated_at=true";
 const headers={accept:"application/json"};
 if(process.env.XITA_COINGECKO_API_KEY)
  headers["x-cg-demo-api-key"]=process.env.XITA_COINGECKO_API_KEY;
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error("CoinGecko temporarily unavailable");
 const value=await response.json();
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw Error("CoinGecko invalid data");
 lastPriceSnapshot=value;lastPriceAt=Date.now();
 return value;
}
async function createQuote(request){
 const source=request?.source,destination=request?.destination;
 if(!CATALOG.chains[source]||!CATALOG.chains[destination]||source===destination)
  throw Error("Unsupported source/destination");
 const executionAddress=sourceAddresses[source];
 if(!/^0x[0-9a-f]{40}$/i.test(executionAddress||""))
  throw Error("Interchain Fee execution contract not deployed");
 const documented=CATALOG.infrastructure?.[source]?.xitaV315?.components?.executionGateway;
 if(!documented?.address||String(documented.address).toLowerCase()!==
    String(executionAddress).toLowerCase()||
    !/^0x[0-9a-f]{64}$/i.test(documented.runtimeCodeKeccak256||""))
  throw Error("Fee gateway is not backed by the deployed GitHub receipt");
 const sourceProvider=await chain(source);
 await chain(destination);
 const runtime=await sourceProvider.getCode(executionAddress);
 if(!/^0x[0-9a-f]+$/i.test(runtime)||runtime==="0x"||
    keccak256(runtime).toLowerCase()!==String(documented.runtimeCodeKeccak256).toLowerCase())
  throw Error("Source Interchain Fee contract runtime differs from verified deployment receipt");
 const result=await buildManagedQuote({
  catalog:CATALOG,request,executionAddress,signer,
  readExecutionOwner:async()=> {
   const c=new Contract(executionAddress,EXECUTION_ABI,await chain(source));
   const [owner,registry,beneficiary]=await Promise.all([
    c.relayerOwner(),c.sourceRegistry(),c.interchainFeeRecipient()]);
   if(String(beneficiary).toLowerCase()!==String(
     process.env.XITA_INTERCHAIN_FEE_ADDRESS||"").toLowerCase())
    throw Error("Immutable fee recipient differs from configured GmbH address");
   const expected=CATALOG.infrastructure[source]?.xitaV315?.components?.sourceRegistry?.address;
   if(String(registry).toLowerCase()!==String(expected||"").toLowerCase())
    throw Error("Managed relay does not bind canonical source ILN Registry");
   return owner;
  },
  readQuoteLifetime:async()=>{
   const c=new Contract(executionAddress,EXECUTION_ABI,await chain(source));
   const [lifetime,maximum]=await Promise.all([c.quoteLifetimeSeconds(),c.MAX_QUOTE_LIFETIME()]);
   if(BigInt(maximum)!==90n)throw Error("Unexpected managed quote validity ceiling");
   return lifetime;
  },
  readGatewayQuote:async({source:gatewaySource,route,destinationDomain,recipient,amount})=>{
    const gateway=new Contract(route.gateway,BRIDGE_ABI,await chain(gatewaySource));
   const result=await gateway.quoteILN(destinationDomain,recipient,amount);
   return {validatorFeeWei:result[0],bridgeNativeWei:result[2],tokenAmount:result[3]};
  },
  getDestinationGasQuote:async({destination:gasChain})=>{
    const client=await chain(gasChain),fee=await client.getFeeData();
    // Fee quote must not be gated on optional sponsor-wallet reserves.
    const address=String(process.env.XITA_INTERCHAIN_FEE_ADDRESS||"");
    const availableWei=/^0x[0-9a-f]{40}$/i.test(address)?
     await client.getBalance(address):0n;
    return {gasPriceWei:fee.maxFeePerGas||fee.gasPrice||0n,availableWei};
   },
  getCoinGeckoSnapshot:getSnapshot
 });
 const data=quoteIface.encodeFunctionData("execute",[result.quote,result.signature]);
 return {...result,transaction:{from:result.quote.payer,to:result.executionAddress,
  chainId:result.sourceChainId,value:"0x"+BigInt(result.sourceValueWei).toString(16),
  data}};
}
function publicError(err){
 const text=String(err?.message||err||"unknown");
 // Never log env/private key, raw external responses, or headers.
 if(/Missing XITA_INTERCHAIN_QUOTE|private key/i.test(text))return "Interchain Fee signer not configured";
 return text.slice(0,170);
}
let sponsorPool=null;
async function readSponsorAvailability(){
 const feeAddress=String(process.env.XITA_INTERCHAIN_FEE_ADDRESS||"").toLowerCase();
 const url=String(process.env.XITA_SPONSOR_STATUS_DATABASE_URL||"").trim();
 if(process.env.XITA_INTERCHAIN_SPONSOR_ENABLED!=="true"||
   !/^0x[0-9a-f]{40}$/.test(feeAddress)||!url)
  return {available:false,chains:{},reason:"sponsor-not-enabled"};
 try{
  if(!sponsorPool){
   const {Pool}=await import("pg");
   sponsorPool=new Pool({connectionString:url,max:2,
    connectionTimeoutMillis:1800,statement_timeout:2000});
  }
  const data=await sponsorPool.query(
   "SELECT chain_name,sponsor_address,gas_ready,checked_at "+
   "FROM xita_sponsor_monitor_state");
  const chains={};
  for(const row of data.rows){
   if(!CATALOG.chains?.[row.chain_name])continue;
   const last=new Date(row.checked_at).getTime();
   chains[row.chain_name]=String(row.sponsor_address).toLowerCase()===feeAddress&&
     row.gas_ready===true&&Number.isFinite(last)&&
     last<=Date.now()&&Date.now()-last<600000;
  }
  const available=Object.values(chains).some(Boolean);
  return {available,chains,reason:available?"native-grants-operator-ready":
    "sponsor-reserves-or-worker-not-ready"};
 }catch{
  return {available:false,chains:{},reason:"sponsor-readiness-unavailable"};
 }
}
async function handler(req,res){
 const send=(status,obj)=>{
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store",
   "x-content-type-options":"nosniff"});
  res.end(JSON.stringify(obj));
 };
 if(req.method==="GET"&&req.url==="/api/xita/v1/managed/health")
  return send(200,{ok:true,service:"xita-source-native-fee-quote",
   enabledChains:Object.entries(sourceAddresses).filter(x=>
    /^0x[0-9a-f]{40}$/i.test(x[1])).map(x=>x[0]),
   sponsorship:await readSponsorAvailability()});
 if(req.method!=="POST"||req.url!=="/api/xita/v1/managed/quote")
  return send(404,{ok:false,error:"Unknown endpoint"});
 let body="";
 try{
  for await(const chunk of req){
   body+=chunk.toString("utf8");
   if(body.length>4096)throw Error("Quote request too large");
  }
  const parsed=JSON.parse(body);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||
   Object.keys(parsed).some(k=>!["asset","source","destination","payer","recipient","amountRaw"].includes(k)))
   throw Error("Invalid request");
  const reply=await createQuote(parsed);
  return send(200,{ok:true,...reply});
 }catch(e){
  const message=publicError(e);
  return send(503,{ok:false,error:message});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.XITA_MANAGED_QUOTE_PORT||4092);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error("Invalid listen port");
 createServer((req,res)=>{void handler(req,res)}).listen(port,"127.0.0.1",()=>{
  console.log("XITA managed relay quote signer listening on loopback "+port);
 });
}
export {createQuote,handler};
