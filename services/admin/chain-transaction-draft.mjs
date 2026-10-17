// Main-derived infrastructure transaction drafts. Read-only; no keys,
// no untrusted ABI/bytecode and no broadcast. Chain names never select logic.
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {encodeAbi,encodeFunctionCall} from "./abi-encoder.mjs";
import {selector} from "../../apps/web/keccak.mjs";
import {deploymentParameters} from "./deployment-parameters.mjs";
import {quoteBaseDeploymentExtras} from "./base-fee-quote.mjs";

const ADDR=/^0x[0-9a-fA-F]{40}$/;
const HEX=/^0x(?:[0-9a-fA-F]{2})+$/;
const ZERO="0x"+"0".repeat(40);
const deployed=(infra,key)=>infra.components.find(p=>p.key===key)?.address||null;
const nonzero=x=>ADDR.test(x||"")&&x.toLowerCase()!==ZERO;
const load=(root,path)=>JSON.parse(readFileSync(join(root,path),"utf8"));
export const CHAIN_COMPONENTS=Object.freeze(["blsVerifier","validatorRegistry","ism","transportBundle","nativeRouterDeployer","syntheticRouterDeployer","collateralRouterDeployer","factory","sourceRegistry","executionGateway"]);
const contractFor={nativeRouterDeployer:"XETANativeRouterDeployer",
 syntheticRouterDeployer:"XETASyntheticRouterDeployer",
 collateralRouterDeployer:"XETACollateralRouterDeployer",
 blsVerifier:"XGRInterchainBLSVerifier",
 validatorRegistry:"XGRInterchainValidatorRegistryV3",
 ism:"XGRILNInterchainISMV2",transportBundle:"XITAFreshTransportV315",factory:"XETATokenFactoryV315",
 executionGateway:"XITAExecutionGateway"};
const typesFor={
 blsVerifier:[],
 validatorRegistry:["uint64","uint32","address","uint8","uint256","uint256","address[]","bytes[]","bytes[]","bytes[]"],
 ism:["address"],transportBundle:["uint32","address"],
 nativeRouterDeployer:[],syntheticRouterDeployer:[],collateralRouterDeployer:[],
 factory:["uint64","uint32","address","address","address","address","uint256","address","address","address"],
 executionGateway:["address","address","address"]
};
export const chainDraftConstructorTypes=Object.freeze(typesFor);
const positive=v=>typeof v==="string"&&/^[1-9][0-9]*$/.test(v);
function exactArtifact(root,component,compiled){
 if(compiled){
  if(compiled.component!==component||typeof compiled.creation!=="string"||!HEX.test(compiled.creation))
   throw Error("Trusted precompiled creation artifact missing for "+component);
  return {name:contractFor[component],hex:compiled.creation};
 }
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
export function chainDraft({root,chain,infrastructure,bootstrap,component,parameters={},artifact=null}){
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
 let values=[],value="0x0";
 if(component==="validatorRegistry"){
  const p=deploymentParameters(component,parameters);
  if(!bootstrap.initialValidators||bootstrap.validatorCount!==bootstrap.expectedValidatorCount)
   throw Error("Independently verified destination Genesis BLS signer set required");
  if(!bootstrap.validatorSnapshot?.validators?.length)throw Error("Missing verified validator proof records");
  const format=chain.blsVerifierFormat==="compressed"?1:2;
  const verifier=format===1?bootstrap.verifierAddress:requirePresent(infrastructure,"blsVerifier");
  if(!nonzero(verifier)||![1,2].includes(format))throw Error("BLS verifier missing");
  const reserve={minimumWei:p.minimumWei,maxExecutorReimbursementWei:p.maxExecutorReimbursementWei,perValidatorWei:p.perValidatorWei};
  for(const key of ["minimumWei","maxExecutorReimbursementWei","perValidatorWei"])
   if(!positive(reserve[key]))throw Error("Missing positive reserve "+key);
  if(BigInt(reserve.minimumWei)<BigInt(reserve.maxExecutorReimbursementWei)||
     BigInt(reserve.perValidatorWei)<BigInt(reserve.minimumWei))
   throw Error("Invalid reserve relationships");
  const vs=bootstrap.validatorSnapshot.validators;
  values=[1643,chain.domainId,verifier,format,reserve.minimumWei,reserve.maxExecutorReimbursementWei,
   vs.map(v=>v.address),vs.map(v=>v.blsPublicKeyCompressed),
   vs.map(v=>v.blsPublicKeyEIP2537),vs.map(v=>v.possessionProof)];
  value="0x"+(BigInt(reserve.perValidatorWei)*BigInt(vs.length)).toString(16);
 }else if(component==="ism"){
  values=[requirePresent(infrastructure,"validatorRegistry")];
 }else if(component==="transportBundle"){
  values=[chain.domainId,requirePresent(infrastructure,"ism")];
 }else if(component==="executionGateway"){
  // One optional funded source-chain adapter, NEVER one per token/route.
  const p=deploymentParameters(component,parameters);
  values=[requirePresent(infrastructure,"sourceRegistry"),p.serviceWallet,p.recoveryAdmin];
 }else if(component==="factory"){
  const p=deploymentParameters(component,parameters);
  const core=infrastructure.hyperlane||{};
  if(!deployed(infrastructure,"transportBundle"))throw Error("Fresh, receipt-verified XITA transport bundle missing");
  if(!nonzero(core.mailbox)||!nonzero(core.merkleTreeHook))
   throw Error("Fresh XITA Mailbox/Hook not documented; Factory blocked");
  // Pinned 500k Hyperlane dispatch metadata is internal, not a transaction cap.
  values=[chain.chainId,chain.domainId,requirePresent(infrastructure,"validatorRegistry"),
   core.mailbox,core.merkleTreeHook,requirePresent(infrastructure,"ism"),
   p.sourceFeeWei,
   requirePresent(infrastructure,"nativeRouterDeployer"),
   requirePresent(infrastructure,"syntheticRouterDeployer"),
   requirePresent(infrastructure,"collateralRouterDeployer")];
 }
 const artifactData=exactArtifact(root,component,artifact);
 return {id:chain.name+":"+component,chain:chain.name,chainId:chain.chainId,
  component,operation:"create",contract:artifactData.name,
  transaction:{to:null,data:artifactData.hex+encodeAbi(typesFor[component],values).slice(2),value},
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
 // On Base the transaction is additionally charged L1 data-availability
 // and possibly OP-Stack operator fees. Missing quote MUST block signing.
 const extra=draft.chainId===8453
  ?await quoteBaseDeploymentExtras({rpc,url,transactionData:t.data,gasLimit:gas})
  :{l1DataFeeUpperBoundWei:"0",operatorFeeWei:"0"};
 const balance=await rpc(url,"eth_getBalance",[from,"latest"]);
 const total=gas*BigInt(price)+BigInt(t.value)+
  BigInt(extra.l1DataFeeUpperBoundWei)+BigInt(extra.operatorFeeWei);
 if(!/^0x[0-9a-f]+$/i.test(balance||"")||BigInt(balance)<total)
  throw Error("Insufficient balance for estimated gas, constructor reserve and Base network surcharges");
 return {chain:draft.chain,component:draft.component,operation:draft.operation,
  gasEstimateWei:estimate,gasLimit:"0x"+gas.toString(16),gasPriceWei:price,
  // This remains a point-in-time estimate; Base L1 fees and gas prices move.
  totalWorstCaseWei:total.toString(),wallet:from,simulated:true,
  l1DataFeeUpperBoundWei:extra.l1DataFeeUpperBoundWei,
  operatorFeeWei:extra.operatorFeeWei,
  // eth_estimateGas omits "to" for contract creation. The durable journal
  // requires an explicit null destination to distinguish creation from an
  // incomplete wallet payload. Keep "to" absent in the RPC simulation only.
  transaction:{...t,to:draft.transaction.to??null,gas:"0x"+gas.toString(16)}};
}
