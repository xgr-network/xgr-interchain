#!/usr/bin/env node
// Isolated loopback-only GmbH quote signer. Never expose the signing key,
// use this process as a protocol oracle, or load it into the public indexer.
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Wallet,Contract,Interface,JsonRpcProvider,zeroPadValue,keccak256} from "ethers";
import {buildManagedQuote,MANAGED_QUOTE_TYPES} from "./quote-service.mjs";
import {usdPrice12} from "./fee-quote.mjs";
import {readCachedGasPrices} from "./price-cache.mjs";
import {globallySponsoredChains,sponsorPoliciesForCatalog} from "./sponsor-policy.mjs";
import {requiredCommittedSponsorChains} from "../../apps/web/sponsor-route-readiness.js";
import {sponsorFundingCovered} from "./sponsor-funding.mjs";
import {verifiedClientIP,lookupIpCountry,quoteEvidence,saveQuoteEvidence} from "./tax-evidence.mjs";

const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const CATALOG_PATH=resolve(root,"apps/web/catalog.json");
// The canonical deployment catalog advances while long-running fee workers stay
// online. Read one consistent snapshot for EVERY request, not at process boot.
export function loadCatalogSnapshot(path=CATALOG_PATH){
 const catalog=JSON.parse(readFileSync(path,"utf8"));
 if(catalog?.schemaVersion!==1||!catalog.chains||!catalog.infrastructure||
    !catalog.assets||typeof catalog.chains!=="object"||
    typeof catalog.infrastructure!=="object"||typeof catalog.assets!=="object"||
    Array.isArray(catalog.chains)||Array.isArray(catalog.infrastructure)||
    Array.isArray(catalog.assets))
  throw Error("Invalid generated deployment catalog");
 return catalog;
}
const EXECUTION_ABI=[
 "function relayerOwner() view returns (address)",
 "function sourceRegistry() view returns (address)",
 "function interchainFeeRecipient() view returns (address)",
 "function serviceWallet() view returns (address)",
 "function quoteLifetimeSeconds() view returns (uint64)",
 "function MAX_QUOTE_LIFETIME() view returns (uint256)",
 "function execute((address payer,address gateway,bytes32 routeId,uint32 destinationDomain,bytes32 recipient,uint32 finalDestinationDomain,bytes32 finalRecipient,bytes32 onwardRouteId,uint256 amount,uint256 bridgeValueWei,uint256 interchainFeeWei,uint256 nonce,uint64 issuedAt),bytes signature) payable returns (bytes32)"
];
const BRIDGE_ABI=[
 "function quoteILN(uint32,bytes32,uint256) view returns (uint256,uint256,uint256,uint256)"
];
const PREVIEW_ONLY=process.env.XITA_INTERCHAIN_PREVIEW_ONLY==="1";
const configuredServiceAddress=PREVIEW_ONLY?"":String(process.env.XITA_INTERCHAIN_FEE_ADDRESS||"").trim();
if(configuredServiceAddress&&!/^0x[0-9a-f]{40}$/i.test(configuredServiceAddress))
 throw Error("Invalid public service wallet");
// Read-only estimates must run before the operator installs a signing key.
const signingKey=PREVIEW_ONLY?"":String(process.env.XITA_INTERCHAIN_FEE_PRIVATE_KEY||"").trim();
const signer=signingKey?new Wallet(signingKey):null;
if(signer&&configuredServiceAddress&&signer.address.toLowerCase()!==configuredServiceAddress.toLowerCase())
 throw Error("One GmbH service wallet must sign quotes, receive fees and sponsor gas");
export function sourceExecutionAddressesFromCatalog(catalog,{
 env=process.env,previewOnly=PREVIEW_ONLY
}={}){
 // All chains/routes are discovered via the CURRENT verified deployment
 // catalog; no hardcoded chain list or manual adapter address per new route.
 return Object.fromEntries(Object.keys(catalog?.chains||{}).filter(name=>
  /^[a-z][a-z0-9-]{0,50}$/.test(name)).map(name=>{
  const configured=String(env["XITA_INTERCHAIN_"+name.toUpperCase()+"_ADAPTER"]||
   env["XITA_MANAGED_"+name.toUpperCase()+"_EXECUTION_ADDRESS"]||"").trim();
  const documented=String(catalog.infrastructure?.[name]?.xitaV315?.components?.executionGateway?.address||"");
  return [name,previewOnly?documented:configured||documented];
 }));
}
const providers=new Map();
async function chain(name,catalog){
 const cfg=catalog.chains[name];
 if(!cfg?.rpcUrls?.[0])throw Error("Unsupported chain");
 // Refresh the provider when an approved catalog changes an RPC endpoint.
 const previous=providers.get(name);
 if(!previous||previous.url!==cfg.rpcUrls[0]||
    previous.chainId!==cfg.chainId)
  providers.set(name,{url:cfg.rpcUrls[0],chainId:cfg.chainId,
   provider:new JsonRpcProvider(cfg.rpcUrls[0])});
 const provider=providers.get(name).provider;
 const network=await provider.getNetwork();
 if(network.chainId!==BigInt(cfg.chainId))throw Error("Chain RPC identity mismatch");
 return provider;
}
const quoteIface=new Interface(EXECUTION_ABI);
// Both quote/preview processes consume the SAME persisted backend cache.
// External CoinGecko requests are exclusively performed by price-refresh.mjs.
const getSnapshot=()=>readCachedGasPrices();
const previewMemo=new Map();
async function createQuote(request,{preview=false,catalog=loadCatalogSnapshot()}={}){
 const previewKey=null; // Fresh signer health and wallet balance must not be masked by preview caching.
 const cached=previewKey?previewMemo.get(previewKey):null;
 if(cached&&Date.now()-cached.at<60000)return cached.value;
 const sourceAddresses=sourceExecutionAddressesFromCatalog(catalog);
 const source=request?.source,destination=request?.destination;
 if(!preview&&(PREVIEW_ONLY||!signer))throw Error("GmbH service wallet not configured");
 if(!catalog.chains[source]||!catalog.chains[destination]||source===destination)
  throw Error("Unsupported source/destination");
 const executionAddress=sourceAddresses[source];
 if(!/^0x[0-9a-f]{40}$/i.test(executionAddress||""))
  throw Error("Interchain Fee execution contract not deployed");
 const documented=catalog.infrastructure?.[source]?.xitaV315?.components?.executionGateway;
 if(!documented?.address||String(documented.address).toLowerCase()!==
    String(executionAddress).toLowerCase()||
    !/^0x[0-9a-f]{64}$/i.test(documented.runtimeCodeKeccak256||""))
  throw Error("Fee gateway is not backed by the deployed GitHub receipt");
 // The keyless public preview reads the LOCAL signed-quote service's health.
 // Do not duplicate a fee/sponsor mode setting or pass signer secrets to 4093.
 let walletAwareEnabled=process.env.XITA_INTERCHAIN_SPONSOR_ENABLED==="true";
 if(preview&&PREVIEW_ONLY){
  let status;
  try{
   const reply=await fetch("http://127.0.0.1:4092/api/xita/v1/managed/health",{
    signal:AbortSignal.timeout(2000),headers:{accept:"application/json"}});
   if(!reply.ok)throw Error("Signing service health unavailable");
   status=await reply.json();
   if(status?.ok!==true||typeof status.sponsorship?.enabled!=="boolean")
    throw Error("Invalid managed sponsor health");
  }catch{
   // Never claim a wallet-specific sponsored discount when signing cannot be
   // reached. A keyless, pre-deployment fee preview can still show old pricing.
   status={sponsorship:{enabled:false,available:false}};
  }
  walletAwareEnabled=status.sponsorship.enabled===true;

 }
 if(walletAwareEnabled&&(!/^0x[0-9a-f]{40}$/i.test(request?.payer||"")||
   !/^0x[0-9a-f]{40}$/i.test(request?.recipient||"")||
   String(request.payer).toLowerCase()!==String(request.recipient).toLowerCase()))
  throw Error("Wallet-specific quote requires explicit wallet identity");
 const sourceProvider=await chain(source,catalog);
 await chain(destination,catalog);
 // Allow public estimates before any secrets or signer environment exist.
 // Bind the operator identity to the verified live adapter itself.
 const liveAdapter=new Contract(executionAddress,EXECUTION_ABI,sourceProvider);
 const serviceAddress=preview?await liveAdapter.serviceWallet():configuredServiceAddress;
 if(!/^0x[0-9a-f]{40}$/i.test(serviceAddress))throw Error("Public GmbH service wallet unavailable");
 if(!preview&&(!signer||signer.address.toLowerCase()!==serviceAddress.toLowerCase()))
  throw Error("GmbH signer is not configured for the live adapter");
 const runtime=await sourceProvider.getCode(executionAddress);
 if(!/^0x[0-9a-f]+$/i.test(runtime)||runtime==="0x"||
    keccak256(runtime).toLowerCase()!==String(documented.runtimeCodeKeccak256).toLowerCase())
  throw Error("Source Interchain Fee contract runtime differs from verified deployment receipt");
 const previewRequest=preview&&!walletAwareEnabled?{...request,payer:request.payer||serviceAddress,
   recipient:request.recipient||serviceAddress}:request;
 const result=await buildManagedQuote({
  catalog,request:previewRequest,executionAddress,signer:signer||{address:serviceAddress},
  readExecutionOwner:async()=> {
   const c=new Contract(executionAddress,EXECUTION_ABI,await chain(source,catalog));
   const [owner,registry,beneficiary,serviceWallet]=await Promise.all([
    c.relayerOwner(),c.sourceRegistry(),c.interchainFeeRecipient(),c.serviceWallet()]);
   if([owner,beneficiary,serviceWallet].some(x=>String(x).toLowerCase()!==serviceAddress.toLowerCase()))
    throw Error("Single on-chain GmbH service wallet differs from configured signer/beneficiary");
   const expected=catalog.infrastructure[source]?.xitaV315?.components?.sourceRegistry?.address;
   if(String(registry).toLowerCase()!==String(expected||"").toLowerCase())
    throw Error("Managed relay does not bind canonical source ILN Registry");
   return owner;
  },
  readQuoteLifetime:async()=>{
   const c=new Contract(executionAddress,EXECUTION_ABI,await chain(source,catalog));
   const [lifetime,maximum]=await Promise.all([c.quoteLifetimeSeconds(),c.MAX_QUOTE_LIFETIME()]);
   if(BigInt(maximum)!==90n)throw Error("Unexpected managed quote validity ceiling");
   return lifetime;
  },
  readGatewayQuote:async({source:gatewaySource,route,destinationDomain,recipient,amount})=>{
    const gateway=new Contract(route.gateway,BRIDGE_ABI,await chain(gatewaySource,catalog));
   const result=await gateway.quoteILN(destinationDomain,recipient,amount);
   return {validatorFeeWei:result[0],bridgeNativeWei:result[2],tokenAmount:result[3]};
  },
  getDestinationGasQuote:async({destination:gasChain})=>{
    const client=await chain(gasChain,catalog),fee=await client.getFeeData();
    // Fee quote must not be gated on optional sponsor-wallet reserves.
    const address=serviceAddress;
    const availableWei=/^0x[0-9a-f]{40}$/i.test(address)?
     await client.getBalance(address):0n;
    return {gasPriceWei:fee.maxFeePerGas||fee.gasPrice||0n,availableWei};
   },
  readSourceBlockTimestamp:async({source:sourceChain})=>{
    const provider=await chain(sourceChain,catalog);
    const block=await provider.getBlock("latest");
    if(!block||!Number.isSafeInteger(block.timestamp)||block.timestamp<1)
     throw Error("Cannot verify live source-chain block time");
    return block.timestamp;
  },
  getCoinGeckoSnapshot:getSnapshot,preview,
  walletAwareEnabled,
  readWalletNativeBalance:async({chain:chainName,account})=>{
   const provider=await chain(chainName,catalog);
   return provider.getBalance(account,"latest");
  }
 });
 // Read-only estimates never require a recent sponsor-worker heartbeat.
 // Signed quotes remain fail-closed for precisely the positive immutable
 // grants that the quoted wallet actually needs.
 if(!preview&&walletAwareEnabled){
  const required=requiredCommittedSponsorChains(result.pricing.sponsorCommitments);
  if(required.length){
   const policies=sponsorPoliciesForCatalog({catalog,prices:await getSnapshot()});
   for(const target of required){
    const policy=policies[target];
    if(!policy)throw Error("Sponsor policy missing for "+target);
    const provider=await chain(target,catalog);
    const [balance,fees]=await Promise.all([
     provider.getBalance(signer.address,"latest"),provider.getFeeData()]);
    const gasPrice=fees.maxFeePerGas||fees.gasPrice||0n;
    const commitments=result.pricing.sponsorCommitments
     .filter(g=>g.chain===target).map(g=>g.amountWei);
    if(!sponsorFundingCovered({balanceWei:balance,gasPriceWei:gasPrice,
     minReserveWei:policy.minReserveWei,commitments}))
     throw Error("Live sponsor funding insufficient on "+target+
      "; no paid quote signed");
   }
  }
 }

 if(preview){
  // Bridge value for native collateral contains the PRINCIPAL. Exclude that
  // from the fee preview; only native protocol fee + commercial price count.
  const routeFeeWei=BigInt(result.sourceBridgeNativeWei)-
   BigInt(result.sourceTokenPrincipalWei)+BigInt(result.pricing.grossInterchainFeeWei);
  if(routeFeeWei<0n)throw Error("Invalid fee preview amount");
  const usdPrecision=10n**22n; // 18 wei decimals + 12 price decimals - 8 USD decimals
  const usd8=(routeFeeWei*usdPrice12(result.pricing.sourceNativeUsd)+usdPrecision-1n)/usdPrecision;
  const feeUsd=(usd8/100000000n).toString()+"."+
   (usd8%100000000n).toString().padStart(8,"0");
  // No nonce, signature, transaction data, wallet key, or 90-second credential
  // ever leaves this read-only estimate endpoint.
  const resultPreview={status:"UNSIGNED_FEE_PREVIEW",source,destination,asset:request.asset,
   estimatedRouteFeeWei:routeFeeWei.toString(),estimatedRouteFeeUsd:feeUsd,
   estimatedAt:new Date().toISOString(),validatorFeeWei:result.validatorFeeWei,
   sourceBridgeNativeWei:result.sourceBridgeNativeWei,
   sourceTokenPrincipalWei:result.sourceTokenPrincipalWei,
   interchainFeeWei:result.pricing.sourceNativeInterchainFeeWei,
   directGatewayEligible:result.directGatewayEligible,
   pricing:result.pricing,sourceNativeSymbol:catalog.chains[source].nativeCurrency?.symbol||source,
   notes:"Wallet source gas and optional ERC20 approval gas are not included. Estimate only; refresh before wallet confirmation."};
  if(previewKey){
   previewMemo.set(previewKey,{at:Date.now(),value:resultPreview});
   if(previewMemo.size>80)previewMemo.delete(previewMemo.keys().next().value);
  }
  return resultPreview;
 }
 if(walletAwareEnabled){
  const limits=sponsorPoliciesForCatalog({catalog,prices:await getSnapshot()});
  for(const g of result.pricing.sponsorCommitments){
   if(!limits[g.chain]||BigInt(g.amountWei)>BigInt(limits[g.chain].maxGrantWei)||
      BigInt(g.amountWei)>BigInt(limits[g.chain].dailyMaxWei))
    throw Error("Quote sponsor grant exceeds configured native budget");
  }
 }
 if(result.directGatewayEligible)return result;
 const data=quoteIface.encodeFunctionData("execute",[result.quote,result.signature]);
 return {...result,transaction:{from:result.quote.payer,to:result.executionAddress,
  chainId:result.sourceChainId,value:"0x"+BigInt(result.sourceValueWei).toString(16),
  data}};
}
function publicError(err){
 const text=String(err?.message||err||"unknown");
 // Never log env/private key, raw external responses, or headers.
 if(/Missing XITA_INTERCHAIN_FEE|private key/i.test(text))return "GmbH service wallet not configured";
 return text.slice(0,170);
}
let sponsorPool=null;
async function readSponsorAvailability(catalog){
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
   if(!catalog.chains?.[row.chain_name])continue;
   const last=new Date(row.checked_at).getTime();
   chains[row.chain_name]=String(row.sponsor_address).toLowerCase()===feeAddress&&
     row.gas_ready===true&&Number.isFinite(last)&&
     last<=Date.now()&&Date.now()-last<600000;
  }
  const active=globallySponsoredChains(catalog);
  const available=active.length>0&&active.every(chain=>chains[chain]===true);
  return {available,chains,reason:available?"native-grants-operator-ready":
    "sponsor-reserves-or-worker-not-ready"};
 }catch{
  return {available:false,chains:{},reason:"sponsor-readiness-unavailable"};
 }
}
// A grant is verified only when the worker journal says confirmed.
// An absent grant is NOT proof that the wallet had sufficient native gas.
export function publicSponsorshipView(rows){
 if(!Array.isArray(rows)||rows.length===0)
  return {ok:true,status:"unavailable"};
 const grants=rows.filter(row=>row?.grant_key).map(row=>({
  stage:String(row.grant_key).split(":").at(-1),
  status:["reserved","submitted","confirmed","needs-review"].includes(row.status)?
   row.status:"unknown"
 }));
 const aware=rows.some(r=>r.wallet_aware===true);
 const promised=aware?Number(rows[0]?.expected_grants):null;
 if(aware&&(!Number.isInteger(promised)||promised<0||promised>3))
  return {ok:false,status:"unavailable"};
 const promisedStages=aware&&Array.isArray(rows[0]?.promised_stages)?
  rows[0].promised_stages.filter(x=>["first-delivery","hub-onward","final-delivery"].includes(x)):null;
 const status=aware?
  promised===0?"not-required":
  grants.some(g=>g.status==="needs-review")?"needs-review":
  grants.length===promised&&grants.every(g=>g.status==="confirmed")?"confirmed":
  grants.some(g=>g.status==="submitted")?"submitted":
  grants.some(g=>g.status==="reserved")?"reserved":"pending":
  grants.length?"tracked":"pending";
 return {ok:true,status,grants,upfrontRequired:aware&&promised>0,
  ...(aware?{expectedGrants:promised,
  ...(promisedStages!==null?{promisedStages}: {})}: {})};
}
// Public signer request throttling: prevents an unauthenticated caller from
// monopolizing the finite quote-time gas reservations. Not an authorization
// mechanism; on-chain fee matching remains mandatory for grants.
const signedQuoteWindows=new Map();
export function enforceSignedQuoteRate(ip,payer,{now=Date.now()}={}){
 if(typeof ip!=="string"||!/^0x[0-9a-f]{40}$/i.test(payer||""))
  throw Error("Invalid signed quote request identity");
 const limits=[["ip:"+ip,4],["wallet:"+payer.toLowerCase(),2],["global",120]];
 if(signedQuoteWindows.size>50000)
  for(const [key,v] of signedQuoteWindows)
   if(now-v.start>=60000)signedQuoteWindows.delete(key);
 for(const [key,max] of limits){
  const row=signedQuoteWindows.get(key);
  if(row&&now-row.start<60000&&row.count>=max)
   throw Error("Signed quote rate limit exceeded");
 }
 for(const [key] of limits){
  const row=signedQuoteWindows.get(key);
  signedQuoteWindows.set(key,!row||now-row.start>=60000?
   {start:now,count:1}:{start:row.start,count:row.count+1});
 }
}
async function handler(req,res,{loadCatalog=loadCatalogSnapshot}={}){
 const send=(status,obj)=>{
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store",
   "x-content-type-options":"nosniff"});
  res.end(JSON.stringify(obj));
 };
 if(req.method==="GET"&&req.url==="/api/xita/v1/managed/health"){
  try{
   const catalog=loadCatalog();
   return send(200,{ok:true,service:"xita-source-native-fee-quote",
    enabledChains:Object.entries(sourceExecutionAddressesFromCatalog(catalog)).filter(x=>
     /^0x[0-9a-f]{40}$/i.test(x[1])).map(x=>x[0]),
    sponsorship:{enabled:process.env.XITA_INTERCHAIN_SPONSOR_ENABLED==="true",
     walletAware:process.env.XITA_INTERCHAIN_SPONSOR_ENABLED==="true",
     ...await readSponsorAvailability(catalog)}});
  }catch(e){return send(503,{ok:false,error:publicError(e)})}
 }
 if(req.method==="GET"&&req.url?.startsWith("/api/xita/v1/managed/sponsorship?")){
  try{
   const u=new URL(req.url,"http://127.0.0.1");
   const account=String(u.searchParams.get("account")||"").toLowerCase();
   const source=String(u.searchParams.get("source")||"");
   const messageId=String(u.searchParams.get("messageId")||"").toLowerCase();
   if(!/^0x[0-9a-f]{40}$/.test(account)||!/^0x[0-9a-f]{64}$/.test(messageId)||
    !/^[a-z][a-z0-9-]{1,39}$/.test(source))
    return send(400,{ok:false,error:"Invalid transfer identity"});
   if(process.env.XITA_INTERCHAIN_SPONSOR_ENABLED!=="true")
    return send(200,{ok:true,status:"disabled"});
   if(!sponsorPool){
    const {Pool}=await import("pg");
    sponsorPool=new Pool({connectionString:process.env.XITA_SPONSOR_STATUS_DATABASE_URL,
     max:2,connectionTimeoutMillis:1800,statement_timeout:2000});
   }
   // Public status is bound to the verified parent wallet. Never expose
   // reservations, sponsor nonces, payout values or unrelated customer grants.
   // Existing transfers may predate quote commitments. The immutable intent,
 // not a mode ENV, distinguishes the newer commercial pricing.
 const quoteAware=true;
   const q=await sponsorPool.query({text:
    "SELECT g.grant_key,g.status,p.delivered,"+
    (quoteAware?" (i.quote_nonce IS NOT NULL) AS wallet_aware,"+
      " (SELECT COUNT(*) FROM xita_sponsor_quote_commitments c"+
      " WHERE c.source_chain=i.source_chain AND c.execution_adapter=i.execution_adapter"+
      " AND c.payer=i.payer AND c.quote_nonce=i.quote_nonce) AS expected_grants,"+
      " (SELECT COALESCE(array_agg(DISTINCT c.grant_stage ORDER BY c.grant_stage), ARRAY[]::text[])"+
      " FROM xita_sponsor_quote_commitments c"+
      " WHERE c.source_chain=i.source_chain AND c.execution_adapter=i.execution_adapter"+
      " AND c.payer=i.payer AND c.quote_nonce=i.quote_nonce) AS promised_stages ":
      " FALSE AS wallet_aware, NULL::integer AS expected_grants ")+
    "FROM xita_transfer_operations p "+
    "LEFT JOIN xita_sponsor_grants g ON g.grant_key LIKE p.source_chain||':'||p.message_id||':%' "+
    (quoteAware?"LEFT JOIN xita_sponsor_quote_intents i ON"+
      " i.source_chain=p.source_chain AND i.execution_adapter=p.execution_adapter"+
      " AND i.payer=p.account AND i.quote_nonce=p.quote_nonce"+
      " AND i.quote_fee_wei=p.interchain_fee_wei ":"")+
    "WHERE p.account=$1 AND p.source_chain=$2 AND p.message_id=$3 "+
    "AND p.execution_adapter IS NOT NULL AND p.interchain_fee_wei>0 "+
    "ORDER BY g.created_at DESC LIMIT 3",
    values:[account,source,messageId]});
   if(!q.rows.length)return send(200,{ok:true,status:"unavailable"});
   // Return an explicit read-only journal status; no inferred sponsor success.
   return send(200,publicSponsorshipView(q.rows));
  }catch{return send(503,{ok:false,status:"unavailable"})}
 }
 const preview=req.url==="/api/xita/v1/managed/preview";
 if(req.method!=="POST"||(!preview&&req.url!=="/api/xita/v1/managed/quote"))
  return send(404,{ok:false,error:"Unknown endpoint"});
 if(PREVIEW_ONLY&&!preview)return send(403,{ok:false,error:"Signing disabled in read-only preview mode"});
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
   const clientIP=preview?null:verifiedClientIP(req);
   if(!preview&&process.env.XITA_INTERCHAIN_SPONSOR_ENABLED==="true")
    enforceSignedQuoteRate(clientIP,parsed.payer);
   const reply=await createQuote(parsed,{preview,catalog:loadCatalog()});
   if(!preview&&reply.status!=="DIRECT_GATEWAY_NO_SERVICE_FEE"){
    const prices=await getSnapshot();
     const country=await lookupIpCountry(clientIP).catch(()=>({code:null,source:"lookup-unavailable",revision:null}));
    const evidence=quoteEvidence(reply,prices,clientIP,country);
    await saveQuoteEvidence(evidence,{quoteReply:reply,
     grantLimits:reply.pricing?.walletAware?sponsorPoliciesForCatalog({
      catalog:loadCatalog(),prices:await getSnapshot()}):null});
   }
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
  console.log("XITA "+(PREVIEW_ONLY?"read-only unsigned fee preview":"managed quote signer")+" listening on loopback "+port);
 });
}
export {createQuote,handler};
