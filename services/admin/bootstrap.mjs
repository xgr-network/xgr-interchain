import {readFileSync} from "node:fs";
import {join} from "node:path";
import {selector} from "../../apps/web/keccak.mjs";
import {rpcCall} from "./inspector.mjs";

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HEX=/^0x(?:[a-f0-9]{2})*$/i;
const ZERO="0x"+"0".repeat(40);
function addr(x){return ADDRESS.test(x||"") && x.toLowerCase()!==ZERO}
function uint(x){return typeof x==="string" && /^[0-9]+$/.test(x) && BigInt(x)>0n}
function decodeUint(x){if(!/^0x[0-9a-f]{64}$/i.test(x||""))throw Error("Invalid ABI uint256 return");return BigInt(x)}
const abiView=(rpc,url,to,signature)=>rpc(url,"eth_call",[{to,data:selector(signature)},"latest"]);

export function bootstrapPlan(root,chain){
 const cfg=JSON.parse(readFileSync(join(root,"config/bootstrap",chain.name+".json"),"utf8"));
 if(cfg.schemaVersion!==1||cfg.kind!=="xita-validator-fee-bootstrap"||
    cfg.chain!==chain.name||cfg.chainId!==chain.chainId||
    cfg.destinationDomain!==chain.domainId||cfg.membershipOriginChainId!==1643||
    cfg.verifierFormat!==chain.blsVerifierFormat)
  throw Error("Validator bootstrap manifest identity mismatch: "+chain.name);
 const snapshot=cfg.validatorSnapshot||{},validators=snapshot.validators||[];
 if(!Array.isArray(validators))throw Error("Invalid validator snapshot");
 const seen=new Set(),keys=new Set();
 for(const v of validators){
  const address=v.address?.toLowerCase(),key=v.blsPublicKeyCompressed?.toLowerCase();
  if(!addr(address)||seen.has(address)||typeof key!=="string"||
     !/^0x[a-f0-9]{96}$/.test(key)||
     !/^0x[a-f0-9]{256}$/i.test(v.blsPublicKeyEIP2537||"")||
     !HEX.test(v.possessionProof)||v.possessionProof.length<4)
   throw Error("Invalid, duplicated or missing validator bootstrap evidence: "+chain.name);
  seen.add(address);if(keys.has(key))throw Error("Duplicate BLS key");keys.add(key);
  if(v.originChainId!==1643||v.destinationDomain!==chain.domainId)
   throw Error("BLS PoP not bound to XGR origin and destination domain");
 }
 const reserve=cfg.reserve||{},fee=cfg.sourceFee||{};
 const complete=Number.isSafeInteger(snapshot.blockNumber)&&snapshot.blockNumber>0&&
  validators.length>0&&uint(reserve.minimumWei)&&uint(reserve.maxExecutorReimbursementWei)&&
  uint(reserve.perValidatorWei)&&
  BigInt(reserve.minimumWei)>=BigInt(reserve.maxExecutorReimbursementWei)&&
  BigInt(reserve.perValidatorWei)>=BigInt(reserve.minimumWei)&&uint(fee.targetWei)&&
  fee.governance==="validator-bls-quorum"&&Number.isInteger(fee.ttlSeconds)&&
  fee.ttlSeconds>=1&&fee.ttlSeconds<=600;
 const missing=[];
 if(!validators.length)missing.push("Validator-BLS-Keys und Proof-of-Possession fehlen");
 if(!snapshot.blockNumber)missing.push("Finalisierter XGR-PoS-Validator-Snapshot fehlt");
 if(!complete&&(!uint(reserve.minimumWei)||!uint(reserve.maxExecutorReimbursementWei)||!uint(reserve.perValidatorWei)))
  missing.push("Reserve-Parameter und Erstattungslimit fehlen");
 if(!uint(fee.targetWei))missing.push("Source-Chain-Gebühr in Wei nicht festgelegt");
 if(!complete&&!missing.length)missing.push("Bootstrap-Parameter inkonsistent");
 return {chain:chain.name,chainId:chain.chainId,domainId:chain.domainId,
  validatorCount:validators.length,setId:null,ready:complete,missing,
  reserveWei:complete?(BigInt(reserve.perValidatorWei)*BigInt(validators.length)).toString():null,
  proposedFeeWei:uint(fee.targetWei)?fee.targetWei:null,
  verifierAddress:addr(cfg.verifierAddress)?cfg.verifierAddress:null,
  feeGovernance:fee.governance};
}
export async function readLiveBootstrap(plan,infrastructure,chains,{rpc=rpcCall}={}){
 const chain=chains.find(c=>c.name===plan.chain);
 if(!chain)throw Error("Unknown chain");
 const url=chain.rpcUrls?.[0];
 if(!url?.startsWith("https://"))throw Error("No HTTPS RPC");
 const observed=infrastructure.find(c=>c.name===plan.chain);
 const addrBy=key=>observed?.components.find(c=>c.key===key)?.address;
 const validatorRegistry=addrBy("validatorRegistry");
 const sourceRegistry=addrBy("sourceRegistry");
 const result={...plan,validatorRegistry,sourceRegistry,verified:false,
  validatorSetId:null,validatorCountOnChain:null,feeWei:null,feeNonce:null,
  missing:[...plan.missing]};
 const id=await rpc(url,"eth_chainId",[]);
 if(BigInt(id)!==BigInt(chain.chainId))throw Error("Bootstrap RPC chain mismatch");
 if(validatorRegistry){
  const [domain,set,threshold]=await Promise.all([
   abiView(rpc,url,validatorRegistry,"destinationDomain()"),
   abiView(rpc,url,validatorRegistry,"setId()"),
   abiView(rpc,url,validatorRegistry,"quorumThreshold()")]);
  if(decodeUint(domain)!==BigInt(chain.domainId))throw Error("Validator registry domain mismatch");
  result.validatorSetId=decodeUint(set).toString();
  result.quorumThreshold=decodeUint(threshold).toString();
 }else result.missing.push("ValidatorRegistryV2 noch nicht deployed");
 if(sourceRegistry){
  const [sourceDomain,nonce,fee]=await Promise.all([
   abiView(rpc,url,sourceRegistry,"sourceDomain()"),
   abiView(rpc,url,sourceRegistry,"sourceFeeNonce()"),
   abiView(rpc,url,sourceRegistry,"validatorFeeWei()")]);
  if(decodeUint(sourceDomain)!==BigInt(chain.domainId))throw Error("Source registry domain mismatch");
  result.feeWei=decodeUint(fee).toString();
  result.feeNonce=decodeUint(nonce).toString();
  if(result.feeWei==="0")result.missing.push("Source-Chain-Fee-Quorum noch nicht ausgeführt");
 }else result.missing.push("Source-Registry noch nicht deployed");
 result.verified=result.ready && Boolean(result.validatorSetId)&&result.feeWei!=="0"&&result.feeWei!==null;
 return result;
}
