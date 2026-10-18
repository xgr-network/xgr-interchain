// Read-only chain inspection; NEVER treats code existence as a deployed XITA contract audit.
import {createHash} from "node:crypto";
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
// Read-only Base RPC failover. Confirm the destination chain ID before
// accepting a response from an alternative public endpoint. No wallet write
// or rebroadcast is ever performed by this transport.
const BASE_RPC="https://base-rpc.publicnode.com";
// The approved chain manifest currently selects the public Tenderly endpoint.
// The old Base fallback only recognized PublicNode and silently disabled
// failover for the ACTUAL deployed configuration. All endpoints below are
// known Base RPCs; check chainId 8453 BEFORE any alternative request.
const BASE_CONFIGURED=["https://gateway.tenderly.co/public/base",
 "https://base.gateway.tenderly.co"];
const BASE_ALTERNATES=["https://mainnet.base.org","https://base.llamarpc.com"];
const BASE_APPROVED=new Set([BASE_RPC,...BASE_CONFIGURED,...BASE_ALTERNATES]);
const baseReadEndpoints=url=>[...new Set([url,...BASE_ALTERNATES,
 ...BASE_CONFIGURED,BASE_RPC])];
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
   error.rpcRateLimit=payload.error.code===-32005||
    /(?:rate.?limit|too many requests|429|quota exceeded|request limit)/i.test(error.message);
   throw error;
  }
  return payload.result;
 }finally{clearTimeout(timer)}
}
export async function rpcCall(url,method,params=[]){
 if(typeof url!=="string"||!/^https:\/\//.test(url))throw Error("RPC URL must use HTTPS");
 const baseApproved=BASE_APPROVED.has(url);
 const endpoints=baseApproved?baseReadEndpoints(url):[url];
 let last;
 for(const endpoint of endpoints){
  try{
   // Always re-check the fallback chain before trusting its result, and do
   // not fall back for a valid JSON-RPC execution error.
   if(endpoint!==url){
    const id=await rpcOnce(endpoint,"eth_chainId",[]);
    if(BigInt(id)!==8453n)throw Error("Unexpected Base fallback chain ID");
   }
   const value=await rpcOnce(endpoint,method,params);
   if(method==="eth_chainId"&&endpoint!==url&&BigInt(value)!==8453n)
    throw Error("Unexpected Base fallback chain ID");
   return value;
  }catch(e){
   if(endpoint!==url&&String(e.message).includes("Unexpected Base fallback chain ID"))
    throw e;
   const code=e.rpcHttpStatus;
   const transient=code===403||code===408||code===429||code>=500||
    e.rpcRateLimit===true||e.name==="AbortError"||e instanceof TypeError;
   if(!transient||!baseApproved)throw e;
   last=e;
  }
 }
 throw Error("Base RPC unavailable on all approved read-only endpoints: "+String(last?.message||"unknown"));
}
export async function probeChain(catalog,chainName,rpc=rpcCall){
 const chain=catalog.chains[chainName],infra=catalog.infrastructure[chainName];
 if(!chain||!infra)throw Error("Missing supported chain");
 const url=chain.rpcUrls?.[0];
 const status={chain:chainName,chainId:chain.chainId,domainId:chain.domainId,
  ok:false,rpc:false,mailbox:false,merkleTreeHook:false,head:null,checkedAt:new Date().toISOString()};
 try{
  const [id,head]=await Promise.all([rpc(url,"eth_chainId"),rpc(url,"eth_blockNumber")]);
  if(BigInt(id)!==BigInt(chain.chainId))throw Error("RPC chain ID mismatch");
  status.rpc=true;status.head=Number(BigInt(head));
  const [mailbox,hook]=await Promise.all([
   rpc(url,"eth_getCode",[infra.hyperlaneCore?.mailbox||"0x"+"0".repeat(40),"latest"]),
   rpc(url,"eth_getCode",[infra.hyperlaneCore?.merkleTreeHook||"0x"+"0".repeat(40),"latest"])
  ]);
  status.mailbox=typeof mailbox==="string"&&/^0x[0-9a-f]+$/i.test(mailbox)&&mailbox.length>2;
  status.merkleTreeHook=typeof hook==="string"&&/^0x[0-9a-f]+$/i.test(hook)&&hook.length>2;
  status.ok=status.mailbox&&status.merkleTreeHook;
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
  await getter("MerkleTreeHook","hook()","address",clean(infra.hyperlaneCore?.merkleTreeHook||"0x"+"0".repeat(40)));
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
