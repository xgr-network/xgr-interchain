// Main-derived infrastructure transaction drafts. Read-only; no keys,
// no untrusted ABI/bytecode and no broadcast. Chain names never select logic.
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {encodeAbi,encodeFunctionCall} from "./abi-encoder.mjs";
import {selector} from "../../apps/web/keccak.mjs";

const ADDR=/^0x[0-9a-fA-F]{40}$/;
const HEX=/^0x(?:[0-9a-fA-F]{2})+$/;
const ZERO="0x"+"0".repeat(40);
const deployed=(infra,key)=>infra.components.find(p=>p.key===key)?.address||null;
const nonzero=x=>ADDR.test(x||"")&&x.toLowerCase()!==ZERO;
const load=(root,path)=>JSON.parse(readFileSync(join(root,path),"utf8"));
export const CHAIN_COMPONENTS=Object.freeze(["blsVerifier","validatorRegistry","ism","factory","sourceRegistry"]);
const contractFor={blsVerifier:"XGRInterchainBLSVerifier",
 validatorRegistry:"XGRInterchainValidatorRegistryV2",
 ism:"XGRILNInterchainISMV2",factory:"XETATokenFactoryV315"};
const typesFor={
 blsVerifier:[],
 validatorRegistry:["uint64","uint32","address","uint8","uint256","uint256","address[]","bytes[]","bytes[]","bytes[]"],
 ism:["address"],
 factory:["uint64","uint32","address","address","address","address","uint256","uint256"]
};
const positive=v=>typeof v==="string"&&/^[1-9][0-9]*$/.test(v);
function exactArtifact(root,component){
 const name=contractFor[component];
 if(!name)throw Error("No constructor artifact for "+component);
 const file=load(root,"out/"+name+".sol/"+name+".json");
 const hex=file.bytecode?.object;
 if(typeof hex!=="string"||!HEX.test(hex)||hex.length<100||hex.includes("__"))
  throw Error("Unlinked or missing pinned creation bytecode for "+component);
 const expected=typesFor[component];
 const ctor=file.abi?.find(x=>x.type==="constructor");
 if((ctor?.inputs||[]).map(x=>x.type).join(",")!==expected.join(","))
  throw Error("Foundry artifact constructor ABI mismatch: "+component);
 if(!file.deployedBytecode?.object||!HEX.test(file.deployedBytecode.object))
  throw Error("Compiled deployed runtime bytecode unavailable");
 return {name,hex};
}
function requirePresent(map,key){
 const address=deployed(map,key);
 if(!nonzero(address))throw Error("Verified dependency missing: "+key);
 return address;
}
export function chainDraft({root,chain,infrastructure,bootstrap,component,gasLimit=200000}){
 if(!chain||!infrastructure||!bootstrap||chain.name!==infrastructure.name||
    chain.chainId!==infrastructure.chainId||bootstrap.chain!==chain.name)
  throw Error("Chain manifest identity mismatch");
 if(!CHAIN_COMPONENTS.includes(component))throw Error("Unknown chain component");
 if(component==="sourceRegistry"){
  const factory=requirePresent(infrastructure,"factory");
  return {id:chain.name+":sourceRegistry",chain:chain.name,chainId:chain.chainId,
   component,transaction:{to:factory,data:encodeFunctionCall("deployRegistry()",[],[],selector),value:"0x0"},
   operation:"factory-call",mustVerify:"Factory RegistryDeployed event and on-chain registry() getter"};
 }
 if(component==="blsVerifier" && chain.blsVerifierFormat!=="eip2537")
  throw Error("Native verifier must never be redeployed");
 if(deployed(infrastructure,component))throw Error("Component already documented");
 const cfg=load(root,"config/bootstrap/"+chain.name+".json");
 let values=[],value="0x0";
 if(component==="validatorRegistry"){
  if(!bootstrap.ready)throw Error("Validator bootstrap manifest incomplete");
  if(!cfg.validatorSnapshot?.validators?.length)throw Error("Missing validators");
  const format=chain.blsVerifierFormat==="compressed"?1:2;
  const verifier=format===1?bootstrap.verifierAddress:requirePresent(infrastructure,"blsVerifier");
  if(!nonzero(verifier)||![1,2].includes(format))throw Error("BLS verifier missing");
  const reserve=cfg.reserve||{};
  for(const key of ["minimumWei","maxExecutorReimbursementWei","perValidatorWei"])
   if(!positive(reserve[key]))throw Error("Missing positive reserve "+key);
  if(BigInt(reserve.minimumWei)<BigInt(reserve.maxExecutorReimbursementWei)||
     BigInt(reserve.perValidatorWei)<BigInt(reserve.minimumWei))
   throw Error("Invalid reserve relationships");
  const vs=cfg.validatorSnapshot.validators;
  values=[1643,chain.domainId,verifier,format,reserve.minimumWei,reserve.maxExecutorReimbursementWei,
   vs.map(v=>v.address),vs.map(v=>v.blsPublicKeyCompressed),
   vs.map(v=>v.blsPublicKeyEIP2537),vs.map(v=>v.possessionProof)];
  value="0x"+(BigInt(reserve.perValidatorWei)*BigInt(vs.length)).toString(16);
 }else if(component==="ism"){
  values=[requirePresent(infrastructure,"validatorRegistry")];
 }else if(component==="factory"){
  if(!positive(cfg.sourceFee?.targetWei))throw Error("Source fee not approved");
  const core=infrastructure.hyperlane;
  if(!nonzero(core.mailbox)||!nonzero(core.merkleTreeHook))
   throw Error("Unverified Hyperlane core");
  const gas=load(root,"config/chains/"+chain.name+".json").defaultDestinationGasLimit;
  // No silently invented gas parameter. Until an approved gas limit exists,
  // factory construction is deliberately blocked.
  if(!Number.isSafeInteger(gas)||gas<21000)throw Error("Missing approved defaultDestinationGasLimit");
  values=[chain.chainId,chain.domainId,requirePresent(infrastructure,"validatorRegistry"),
   core.mailbox,core.merkleTreeHook,requirePresent(infrastructure,"ism"),
   gas,cfg.sourceFee.targetWei];
 }
 const artifact=exactArtifact(root,component);
 return {id:chain.name+":"+component,chain:chain.name,chainId:chain.chainId,
  component,operation:"create",contract:artifact.name,
  transaction:{to:null,data:artifact.hex+encodeAbi(typesFor[component],values).slice(2),value},
  mustVerify:"finalized receipt, canonical block, constructor bindings and deployed runtime"};
}
export async function simulateChainDraft(draft,{rpc,url,from}){
 if(!nonzero(from)||typeof rpc!=="function"||!/^https:\/\//.test(url||""))
  throw Error("Invalid simulation inputs");
 const network=await rpc(url,"eth_chainId",[]);
 if(BigInt(network)!==BigInt(draft.chainId))throw Error("Simulation chain mismatch");
 const t={from,data:draft.transaction.data,value:draft.transaction.value};
 if(draft.transaction.to)t.to=draft.transaction.to;
 const estimate=await rpc(url,"eth_estimateGas",[t]);
 if(!/^0x[0-9a-f]+$/i.test(estimate||"")||BigInt(estimate)<21000n)
  throw Error("Gas estimation failed");
 const price=await rpc(url,"eth_gasPrice",[]);
 if(!/^0x[0-9a-f]+$/i.test(price||""))throw Error("Gas price failed");
 const gas=BigInt(estimate)*120n/100n+1n;
 const balance=await rpc(url,"eth_getBalance",[from,"latest"]);
 const total=gas*BigInt(price)+BigInt(t.value);
 if(!/^0x[0-9a-f]+$/i.test(balance||"")||BigInt(balance)<total)
  throw Error("Insufficient balance including maximum gas and deposit");
 return {chain:draft.chain,component:draft.component,operation:draft.operation,
  gasEstimateWei:estimate,gasLimit:"0x"+gas.toString(16),gasPriceWei:price,
  totalWorstCaseWei:total.toString(),wallet:from,simulated:true,
  transaction:{...t,gas:"0x"+gas.toString(16)}};
}
