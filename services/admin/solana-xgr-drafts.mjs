// XGRChain-specific Solana deployment drafts. Always server-authored from
// current-main sealed artifacts and independently verified genesis proofs.
// The EVM inbound registry (destination 1643) and Solana destination registry
// (destination 1399811149) have different purposes and MUST NOT be swapped.
import {readFileSync,lstatSync} from "node:fs";
import {join,resolve} from "node:path";
import {encodeAbi,encodeFunctionCall} from "./abi-encoder.mjs";
import {selector} from "../../apps/web/keccak.mjs";
import {prepareBootstrapEvidence} from "./bootstrap-evidence.mjs";

export const SOLANA_DOMAIN=1399811149;
export const XGR_DOMAIN=1643;
export const NATIVE_BLS_VERIFIER="0x0000000000000000000000000000000000002040";
export const REGISTRY_TYPES=Object.freeze([
 "uint64","uint32","address","uint8","uint256","uint256",
 "address[]","bytes[]","bytes[]","bytes[]"
]);
export const HUB_FACTORY_DEPLOY_SIGNATURE=
 "deploy(address,bytes32,bytes32,bytes32,bytes32,bytes32,uint256)";
const HUB_TYPES=Object.freeze([
 "address","bytes32","bytes32","bytes32","bytes32","bytes32","uint256"
]);
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const WORD=/^0x[0-9a-f]{64}$/i;
const ZERO="0x"+"0".repeat(40);
const uint=x=>typeof x==="string"&&/^[1-9][0-9]*$/.test(x)&&BigInt(x)<(1n<<256n);
const address=x=>ADDRESS.test(x||"")&&x.toLowerCase()!==ZERO;
const word=x=>WORD.test(x||"")&&BigInt(x)!==0n;
const requireArtifact=(artifact,component)=>{
 if(artifact?.component!==component||typeof artifact.creation!=="string"||
    !/^0x(?:[0-9a-f]{2})+$/i.test(artifact.creation)||
    artifact.creation.includes("__")||artifact.creation.length<102)
  throw Error("Missing sealed, main-pinned Solana XGR artifact: "+component);
 return artifact.creation;
};
const readPublic=(path)=>{
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.size<10||st.size>128*1024)
  throw Error("Invalid public Solana-destination BLS proof file");
 return readFileSync(path,"utf8");
};

// This READS independent public PoP files and verifies every proof on
// XGRChain's native BLS precompile for the Solana destination domain.
// No JS/UI parameter may assert that its own BLS signature was verified.
export async function verifiedSolanaXGRGenesis({
 root,publicEvidenceDir,rpc,verifyProof
}){
 if(!root||!publicEvidenceDir||typeof rpc!=="function")
  throw Error("Missing independently verifiable Solana bootstrap inputs");
 const xgr=JSON.parse(readFileSync(join(root,"config/chains/xgrchain/chain.json"),"utf8"));
 const boot=JSON.parse(readFileSync(join(root,"config/chains/xgrchain/bootstrap.json"),"utf8"));
 const initial=JSON.parse(readFileSync(join(root,"config/validators/initial.json"),"utf8"));
 if(xgr.chainId!==XGR_DOMAIN||xgr.domainId!==XGR_DOMAIN||
    boot.membershipOriginChainId!==XGR_DOMAIN||
    boot.verifierAddress?.toLowerCase()!==NATIVE_BLS_VERIFIER||
    initial.originChainId!==XGR_DOMAIN||
    !Array.isArray(initial.validators)||initial.validators.length<3||
    !Array.isArray(xgr.rpcUrls)||xgr.rpcUrls.length<2)
  throw Error("Canonical XGR native verifier or selected validator manifest missing");
 const chain={
  name:"solana",chainId:XGR_DOMAIN,domainId:SOLANA_DOMAIN,
  blsVerifierFormat:"compressed",rpcUrls:xgr.rpcUrls
 };
 const bootstrap={
  schemaVersion:1,chain:"solana",chainId:XGR_DOMAIN,
  destinationDomain:SOLANA_DOMAIN,membershipOriginChainId:XGR_DOMAIN,
  verifierFormat:"compressed",verifierAddress:NATIVE_BLS_VERIFIER,
  validatorSnapshot:{validators:[]}
 };
 const publicDir=resolve(publicEvidenceDir,"solana");
 const proofs=initial.validators.map((_,i)=>readPublic(
  join(publicDir,"validator-"+(i+1)+".txt")
 ));
 const result=await prepareBootstrapEvidence({
  chain,bootstrap,initial,proofs,rpc,...(verifyProof?{verifyProof}:{})
 });
 if(result.report?.verifiedValidatorCount!==initial.validators.length||
    result.candidate.validatorSnapshot.validators.some((v,i)=>
     v.address.toLowerCase()!==initial.validators[i].toLowerCase()||
     v.destinationDomain!==SOLANA_DOMAIN||
     v.originChainId!==XGR_DOMAIN))
  throw Error("Solana genesis proof order/domain mismatch");
 return {validators:result.candidate.validatorSnapshot.validators,
  reserve:boot.reserve,sourceFeeWei:boot.sourceFee?.targetWei,
  originChainId:XGR_DOMAIN,destinationDomain:SOLANA_DOMAIN,
  proofKind:"native-xgr-precompile-verified",
  verifierAddress:NATIVE_BLS_VERIFIER};
}
export function solanaRegistryDraft(artifact,verified){
 const creation=requireArtifact(artifact,"solanaValidatorRegistry");
 const v=verified?.validators,rs=verified?.reserve;
 if(verified?.proofKind!=="native-xgr-precompile-verified"||
    verified.originChainId!==XGR_DOMAIN||
    verified.destinationDomain!==SOLANA_DOMAIN||
    verified.verifierAddress?.toLowerCase()!==NATIVE_BLS_VERIFIER||
    !Array.isArray(v)||v.length<3||v.length>16||
    !v.every(m=>address(m.address)&&m.originChainId===XGR_DOMAIN&&
      m.destinationDomain===SOLANA_DOMAIN&&
      /^0x[0-9a-f]{96}$/i.test(m.blsPublicKeyCompressed||"")&&
      /^0x[0-9a-f]{256}$/i.test(m.blsPublicKeyEIP2537||"")&&
      /^0x[0-9a-f]{192}$/i.test(m.possessionProof||""))||
    new Set(v.map(m=>m.address.toLowerCase())).size!==v.length||
    new Set(v.map(m=>m.blsPublicKeyCompressed.toLowerCase())).size!==v.length||
    !uint(rs?.minimumWei)||!uint(rs?.maxExecutorReimbursementWei)||
    !uint(rs?.perValidatorWei)||
    BigInt(rs.perValidatorWei)<BigInt(rs.minimumWei)||
    BigInt(rs.minimumWei)<BigInt(rs.maxExecutorReimbursementWei))
  throw Error("No independently authenticated Solana-domain registry genesis");
 const params=[
  XGR_DOMAIN,SOLANA_DOMAIN,NATIVE_BLS_VERIFIER,1,
  rs.minimumWei,rs.maxExecutorReimbursementWei,
  v.map(x=>x.address),v.map(x=>x.blsPublicKeyCompressed),
  v.map(x=>x.blsPublicKeyEIP2537),v.map(x=>x.possessionProof)
 ];
 const deposit=BigInt(rs.perValidatorWei)*BigInt(v.length);
 return {component:"solanaValidatorRegistry",network:"xgrchain",chainId:XGR_DOMAIN,
  operation:"create",transaction:{
   to:null,data:creation+encodeAbi(REGISTRY_TYPES,params).slice(2),
   value:"0x"+deposit.toString(16)
  },expected:{destinationDomain:SOLANA_DOMAIN,originChainId:XGR_DOMAIN,
   validatorCount:v.length,reserveWei:deposit.toString()}};
}
export function solanaHubFactoryDraft(artifact){
 const creation=requireArtifact(artifact,"solanaHubFactory");
 return {component:"solanaHubFactory",network:"xgrchain",chainId:XGR_DOMAIN,
  operation:"create",transaction:{to:null,data:creation,value:"0x0"}};
}
export function solanaHubDraft({
 factoryAddress,existingXGRRegistry,solanaProgram,solanaRouter,
 solanaSourceRegistry,solanaDestinationISM,solanaDestinationRegistry,
 sourceFeeWei,verifiedInfrastructure
}){
 if(!address(factoryAddress)||!address(existingXGRRegistry)||
    !word(solanaProgram)||!word(solanaRouter)||!word(solanaSourceRegistry)||
    !word(solanaDestinationISM)||!word(solanaDestinationRegistry)||
    !uint(sourceFeeWei)||
    !verifiedInfrastructure?.factoryVerified||
    !verifiedInfrastructure?.xgrRegistryVerified||
    !verifiedInfrastructure?.solanaProgramImmutable||
    !verifiedInfrastructure?.solanaAccountsVerified||
    !verifiedInfrastructure?.solanaBlsBootstrapVerified||
    solanaDestinationISM.toLowerCase()!==solanaProgram.toLowerCase()||
    factoryAddress.toLowerCase()===existingXGRRegistry.toLowerCase())
  throw Error("Solana hub requires both separately verified chain endpoints");
 const params=[existingXGRRegistry,solanaProgram,solanaRouter,
  solanaSourceRegistry,solanaDestinationISM,solanaDestinationRegistry,sourceFeeWei];
 return {component:"solanaHub",network:"xgrchain",chainId:XGR_DOMAIN,
  operation:"factory-call",transaction:{
   to:factoryAddress,
   data:encodeFunctionCall(HUB_FACTORY_DEPLOY_SIGNATURE,HUB_TYPES,params,selector),
   value:"0x0"
  },expected:{xgrDestinationDomain:XGR_DOMAIN,solanaDestinationDomain:SOLANA_DOMAIN,
   factory:factoryAddress,validatorRegistry:existingXGRRegistry}};
}
