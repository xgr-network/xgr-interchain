// Read-only chain inspection; NEVER treats code existence as a deployed XITA contract audit.
import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {selector} from "../../apps/web/keccak.mjs";

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const TX=/^0x[0-9a-fA-F]{64}$/;
const STEP_IDS=new Set(["verifier_base","registry_xgr","registry_base","iln_xgr","iln_base","ism_xgr","ism_base","router_xgr","router_base","gateway_xgr","gateway_base"]);
export const validAddress=s=>typeof s==="string"&&ADDRESS.test(s)&&!/^0x0{40}$/i.test(s);
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const clean=s=>s?.toLowerCase();
const word=s=>typeof s==="string"&&/^0x[0-9a-fA-F]{64}$/.test(s);
function decode(data,type){
 if(!word(data))throw Error("Invalid read-only ABI return");
 if(type==="address")return "0x"+data.slice(-40).toLowerCase();
 if(type==="bytes32")return data.toLowerCase();
 return BigInt(data).toString();
}
// One generic read-only RPC failover for every configured EVM chain.
// Endpoint membership and expected chain IDs come ONLY from approved
// config/chains/<name>/chain.json. New chains need no JavaScript special-case.
// Wallet signing/broadcasts are NOT allowed through this RPC client.
const CONFIG_DIR=resolve(dirname(fileURLToPath(import.meta.url)),"../../config/chains");
const READ_METHOD=/^(?:eth_(?:chainId|blockNumber|gasPrice|getTransactionByHash|getTransactionReceipt|getBlockByNumber|getTransactionCount|getBalance|getCode|getLogs|call|estimateGas|feeHistory|syncing)|net_version)$/;
function configuredNetworks(){
 const networks=[],seen=new Map();
 for(const dir of readdirSync(CONFIG_DIR,{withFileTypes:true})){
  if(!dir.isDirectory()||!/^[a-z][a-z0-9-]*$/.test(dir.name))continue;
  const c=JSON.parse(readFileSync(join(CONFIG_DIR,dir.name,"chain.json"),"utf8"));
  if(c.name!==dir.name||!Number.isSafeInteger(c.chainId)||c.chainId<1||
     !Array.isArray(c.rpcUrls)||c.rpcUrls.length<1||c.rpcUrls.length>12)
   throw Error("Invalid configured RPC policy: "+dir.name);
  const endpoints=[];
  for(const url of c.rpcUrls){
   if(typeof url!=="string"||!/^https:\/\//.test(url))
    throw Error("Unsafe configured RPC URL: "+dir.name);
   const parsed=new URL(url);
   if(parsed.username||parsed.password||parsed.hash||parsed.protocol!=="https:")
    throw Error("Unsafe configured RPC authority: "+dir.name);
   if(seen.has(url)&&seen.get(url)!==c.chainId)
    throw Error("RPC endpoint belongs to conflicting chain IDs");
   seen.set(url,c.chainId);
   if(!endpoints.includes(url))endpoints.push(url);
  }
  networks.push({chainId:BigInt(c.chainId),name:dir.name,endpoints});
 }
 return networks;
}
function configuredNetwork(url){
 return configuredNetworks().find(n=>n.endpoints.includes(url))||null;
}
async function rpcOnce(url,method,params){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
 try{
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:controller.signal});
  if(!response.ok){
   const error=new Error("RPC status "+response.status);
   error.rpcHttpStatus=response.status;
   throw error;
  }
  const payload=await response.json();
  if(payload.error){
   const error=new Error("RPC error: "+String(payload.error.message||"unknown").slice(0,120));
   error.rpcErrorCode=payload.error.code;
   error.rpcRateLimit=payload.error.code===-32005||
    /(?:rate.?limit|too many requests|429|quota exceeded|request limit)/i.test(error.message);
   throw error;
  }
  return payload.result;
 }finally{clearTimeout(timer)}
}
export async function rpcCall(url,method,params=[],options={}){
 if(typeof url!=="string"||!/^https:\/\//.test(url))throw Error("RPC URL must use HTTPS");
 if(!READ_METHOD.test(method||""))throw Error("Only approved read-only EVM RPC methods are available");
 if(options==null||typeof options!=="object"||Array.isArray(options)||
    Object.keys(options).some(k=>k!=="noFailover")||
    options.noFailover!=null&&typeof options.noFailover!=="boolean")
  throw Error("Invalid read-only RPC options");
 const network=configuredNetwork(url);
 const endpoints=network&&!options.noFailover?
  [url,...network.endpoints.filter(e=>e!==url)]:[url];
 const finalizedQuery=method==="eth_getBlockByNumber"&&params[0]==="finalized";
 let last;
 for(const endpoint of endpoints){
  try{
   // Verify every endpoint, INCLUDING the primary, before accepting data.
   // A misconfigured provider on another chain is never a fallback.
   let identity=null;
   if(network){
    identity=await rpcOnce(endpoint,"eth_chainId",[]);
    if(BigInt(identity)!==network.chainId)
     throw Error(endpoint===url?"Unexpected configured RPC chain ID":"Unexpected fallback chain ID");
   }
   const value=method==="eth_chainId"&&network?identity:
    await rpcOnce(endpoint,method,params);
   if(network&&method==="eth_chainId"&&BigInt(value)!==network.chainId)
    throw Error("Unexpected configured RPC chain ID");
   if(finalizedQuery&&(value==null||value===false)){
    const error=new Error("RPC finalized head unavailable");
    error.rpcUnsupportedFinalized=true;
    throw error;
   }
   return value;
  }catch(e){
   if(/Unexpected (?:configured RPC|fallback) chain ID/.test(String(e.message)))
    throw e;
   const code=e.rpcHttpStatus;
   const transient=code===401||code===403||code===404||code===408||
    code===429||code>=500||e.rpcRateLimit===true||
    e.name==="AbortError"||e instanceof TypeError;
   // Only a FINALIZED block query may retry on unsupported RPC semantics.
   // Never downgrade to "latest", "safe" or arbitrary confirmation counts.
   const unsupportedFinalized=finalizedQuery&&
    (e.rpcUnsupportedFinalized===true||e.rpcErrorCode===-32601||
     e.rpcErrorCode===-32602||
     /(?:finalized|unsupported block|not supported)/i.test(String(e.message)));
   if((!transient&&!unsupportedFinalized)||!network||options.noFailover)
    throw e;
   last=e;
  }
 }
 throw Error("Chain "+String(network?.chainId||"unknown")+
  " RPC unavailable on all approved read-only endpoints: "+
  String(last?.message||"unknown"));
}
export async function probeChain(catalog,chainName,rpc=rpcCall){
 const chain=catalog.chains[chainName],infra=catalog.infrastructure[chainName];
 if(!chain||!infra)throw Error("Missing supported chain");
 const url=chain.rpcUrls?.[0];
 const status={chain:chainName,chainId:chain.chainId,domainId:chain.domainId,
  ok:false,rpc:false,mailbox:false,dispatchHook:false,head:null,checkedAt:new Date().toISOString()};
 try{
  const [id,head]=await Promise.all([rpc(url,"eth_chainId"),rpc(url,"eth_blockNumber")]);
  if(BigInt(id)!==BigInt(chain.chainId))throw Error("RPC chain ID mismatch");
  status.rpc=true;status.head=Number(BigInt(head));
  const [mailbox,hook]=await Promise.all([
   rpc(url,"eth_getCode",[infra.hyperlaneCore?.mailbox||"0x"+"0".repeat(40),"latest"]),
   rpc(url,"eth_getCode",[infra.hyperlaneCore?.dispatchHook||"0x"+"0".repeat(40),"latest"])
  ]);
  status.mailbox=typeof mailbox==="string"&&/^0x[0-9a-f]+$/i.test(mailbox)&&mailbox.length>2;
  status.dispatchHook=typeof hook==="string"&&/^0x[0-9a-f]+$/i.test(hook)&&hook.length>2;
  status.ok=status.mailbox&&status.dispatchHook;
 }catch(e){status.error=String(e.message).slice(0,160)}
 return status;
}
function kindOf(step){
 const names={verifier_base:"verifier",registry_xgr:"validatorRegistry",registry_base:"validatorRegistry",
 iln_xgr:"sourceRegistry",iln_base:"sourceRegistry",ism_xgr:"ism",ism_base:"ism",
 router_xgr:"router",router_base:"router",gateway_xgr:"gateway",gateway_base:"gateway"};
 return names[step.id]||null;
}
function configuredExpected(known,id){return validAddress(known?.[id]?.address)?clean(known[id].address):null}
export async function inspectContract({catalog,step,address,txHash=null,known={},rpc=rpcCall}){
 if(!step||!STEP_IDS.has(step.id)||step.kind!=="deploy"||!["xgrchain","base"].includes(step.chain))
  throw Error("Unsupported contract component");
 if(!validAddress(address))throw Error("Enter a valid nonzero EVM address");
 if(txHash!==null&&(!TX.test(txHash)))throw Error("Invalid deployment transaction hash");
 const chain=catalog.chains[step.chain],infra=catalog.infrastructure[step.chain];
 const url=chain.rpcUrls?.[0],addr=clean(address);
 const [id,code,height]=await Promise.all([
  rpc(url,"eth_chainId"),rpc(url,"eth_getCode",[addr,"latest"]),rpc(url,"eth_blockNumber")
 ]);
 if(BigInt(id)!==BigInt(chain.chainId))throw Error("Incorrect RPC network");
 if(typeof code!=="string"||!/^0x(?:[0-9a-f]{2})+$/i.test(code))
  throw Error("No contract bytecode at this address");
 const checks=[],reads={};
 async function getter(label,signature,type,expected=null){
  let value;
  try{
   const data=await rpc(url,"eth_call",[{to:addr,data:selector(signature)},"latest"]);
   value=decode(data,type);
  }catch(e){checks.push({label,ok:false,expected:expected||"contract getter",actual:"call failed"});return}
  reads[label]=value;
  checks.push({label,ok:expected===null||eq(value,expected),expected,actual:value});
 }
 const kind=kindOf(step),domain=String(chain.domainId),chainId=String(chain.chainId);
 if(kind==="validatorRegistry"){
  await getter("Destination domain","destinationDomain()","uint",domain);
  await getter("BLS verifier","verifier()","address");
 }else if(kind==="sourceRegistry"){
  await getter("Source chain","sourceChainId()","uint",chainId);
  await getter("Source domain","sourceDomain()","uint",domain);
  await getter("Governance registry","governanceRegistry()","address",configuredExpected(known,"registry_"+(step.chain==="base"?"base":"xgr")));
 }else if(kind==="ism"){
  await getter("Destination domain","destinationDomain()","uint",domain);
  await getter("Validator registry","registry()","address",configuredExpected(known,"registry_"+(step.chain==="base"?"base":"xgr")));
 }else if(kind==="router"){
  await getter("Hyperlane Mailbox","mailbox()","address",clean(infra.hyperlaneCore?.mailbox||"0x"+"0".repeat(40)));
  await getter("DispatchHook","hook()","address",clean(infra.hyperlaneCore?.dispatchHook||"0x"+"0".repeat(40)));
  await getter("ILN source registry","xetaRegistry()","address",configuredExpected(known,"iln_"+(step.chain==="base"?"base":"xgr")));
 }else if(kind==="gateway"){
  const other=step.chain==="base"?"xgrchain":"base";
  await getter("Destination domain","destinationDomain()","uint",String(catalog.chains[other].domainId));
  await getter("ILN source registry","ilnRegistry()","address",configuredExpected(known,"iln_"+(step.chain==="base"?"base":"xgr")));
  await getter("Warp router","warpRouter()","address",configuredExpected(known,"router_"+(step.chain==="base"?"base":"xgr")));
  await getter("FeeVault","feeVault()","address");
  await getter("Route ID","routeId()","bytes32");
  // A non-empty returned FeeVault is not by itself proof of fee custody correctness.
  const vault=reads["FeeVault"];
  if(validAddress(vault)){
   try{
    const vaultCode=await rpc(url,"eth_getCode",[vault,"latest"]);
    checks.push({label:"FeeVault bytecode",ok:typeof vaultCode==="string"&&vaultCode.length>2,
      expected:"contract",actual:typeof vaultCode==="string"&&vaultCode.length>2?"code observed":"not found"});
   }catch{checks.push({label:"FeeVault bytecode",ok:false,expected:"contract",actual:"RPC failure"})}
  }
 }
 let receipt={provided:Boolean(txHash),confirmed:false,finalized:false,confirmations:0};
 if(txHash){
  const raw=await rpc(url,"eth_getTransactionReceipt",[txHash.toLowerCase()]);
  const successful=raw?.status==="0x1"||raw?.status===1;
  const matches=eq(raw?.contractAddress,addr);
  const confirmations=raw?.blockNumber?Math.max(0,Number(BigInt(height)-BigInt(raw.blockNumber)+1n)):0;
  receipt={provided:true,confirmed:successful&&matches,finalized:successful&&matches&&
    confirmations>=chain.confirmations,confirmations,txHash:txHash.toLowerCase(),
    reason:!raw?"Receipt not found":!successful?"Failed deployment transaction":!matches?
      "Receipt does not deploy this address":confirmations<chain.confirmations?"Awaiting chain confirmations":null};
 }
 const bindingsOk=checks.length>0&&checks.every(check=>check.ok);
 const inspected={
  id:step.id,chain:step.chain,address:addr,kind,codeBytes:(code.length-2)/2,
  bytecodeSha256:"0x"+createHash("sha256").update(Buffer.from(code.slice(2),"hex")).digest("hex"),
  checks,bindingsOk,receipt,observedAt:new Date().toISOString(),
  status:bindingsOk&&receipt.finalized?"onchain-observed":"needs-review",
  warning:"Observation only. Bytecode, validator proof-of-possession, signer authority, route governance and full E2E security are not audited by this check."
 };
 if(kind==="verifier")inspected.warning="EIP-2537 verifier identity and positive/negative BLS proof vectors still require independent tests; deployment receipt alone cannot verify cryptographic correctness.";
 return inspected;
}
