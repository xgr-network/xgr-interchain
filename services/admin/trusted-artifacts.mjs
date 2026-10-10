// Trusted artifacts: compile only a CLEAN, current GitHub-main checkout.
// Constructor bytecode and runtime fingerprint can never come from the browser.
// Deployed Solidity immutables are masked ONLY for bytecode template matching;
// independent on-chain getter checks must bind their exact configured values.
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {keccak256} from "../../apps/web/keccak.mjs";
import {checkedLocalMain} from "./main-gate.mjs";

const exec=promisify(execFile);
const HEX=/^0x(?:[0-9a-fA-F]{2})+$/;
const SHA=/^[0-9a-f]{40}$/i;
const SOURCE={
 blsVerifier:"XGRInterchainBLSVerifier",
 validatorRegistry:"XGRInterchainValidatorRegistryV2",
 ism:"XGRILNInterchainISMV2",
 factory:"XETATokenFactoryV315",
 sourceRegistry:"XGRILNRegistryV315",
 nativeRouter:"XETAGuardedNativeWarpRouter",
 syntheticRouter:"XETAGuardedSyntheticWarpRouter",
 collateralRouter:"XETAGuardedCollateralWarpRouterV315",
 gateway:"ILNGateway",
 feeVault:"XGRILNFeeVault"
};
const TYPES={
 blsVerifier:[],
 validatorRegistry:["uint64","uint32","address","uint8","uint256","uint256","address[]","bytes[]","bytes[]","bytes[]"],
 ism:["address"],
 factory:["uint64","uint32","address","address","address","address","uint256","uint256"],
 nativeRouter:["address","address","address","address","uint256"],
 syntheticRouter:["address","address","address","address","uint256","uint8","string","string"],
 collateralRouter:["address","address","address","address","address","uint256"],
 gateway:["address","bytes32","uint32","address","bool"],
 feeVault:["address","address","bytes32","uint32"]
};
const digest=s=>createHash("sha256").update(s).digest("hex");
const hexBytes=s=>Uint8Array.from(Buffer.from(s.slice(2),"hex"));
export function artifactTemplate(raw,{component,commit,forgeVersion}){
 if(!SHA.test(commit||"")||typeof forgeVersion!=="string"||!forgeVersion.includes("forge"))
  throw Error("Artifact provenance must include exact main commit and Forge version");
 const name=SOURCE[component];
 if(!name||!raw||typeof raw!=="object")throw Error("Unsupported XITA artifact");
 const creation=raw.bytecode?.object,runtime=raw.deployedBytecode?.object;
 if(!HEX.test(creation||"")||creation.length<100||
    !HEX.test(runtime||"")||runtime.length<100)
  throw Error("Unlinked creation/deployed bytecode missing");
 const ctor=raw.abi?.find(x=>x.type==="constructor");
 if(component!=="sourceRegistry"&&
    (ctor?.inputs||[]).map(x=>x.type).join(",")!==TYPES[component].join(","))
   throw Error("Unexpected constructor ABI for "+component);
 const immutableReferences=Object.values(raw.deployedBytecode?.immutableReferences||{}).flat();
 const spans=[];const used=new Set();
 for(const ref of immutableReferences){
  const start=ref?.start,length=ref?.length;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||
     length<1||length>32||start<0||start+length>(runtime.length-2)/2)
   throw Error("Invalid immutable offset in Foundry artifact");
  for(let i=start;i<start+length;i++){
   if(used.has(i))throw Error("Overlapping immutable references");
   used.add(i);
  }
  spans.push({start,length});
 }
 const metadata=typeof raw.metadata==="string"?JSON.parse(raw.metadata):raw.metadata;
 if(metadata?.compiler?.version && !String(metadata.compiler.version).startsWith("0.8.24"))
  throw Error("Wrong Solidity compiler for XITA 3.1.5");
 const buildHash=digest(JSON.stringify({
  sourceCommit:commit.toLowerCase(),forgeVersion,name,
  creationKeccak:keccak256(hexBytes(creation)),
  runtimeTemplateKeccak:keccak256(hexBytes(runtime)),
  spans,metadata:metadata?.compiler?.version||"solc-0.8.24"
 }));
 return {component,name,creation,runtime,immutableSpans:spans,
  sourceCommit:commit.toLowerCase(),forgeVersion,buildHash,
  artifactHash:digest(creation+"|"+runtime)};
}
function normalizedRuntime(code,spans){
 let result=code.toLowerCase();
 for(const {start,length} of spans)
  result=result.slice(0,2+start*2)+"00".repeat(length)+result.slice(2+(start+length)*2);
 return result;
}
export function verifyRuntimeTemplate(artifact,observedCode){
 if(!HEX.test(observedCode||"")||artifact?.runtime?.length!==observedCode.length)
  throw Error("Deployed contract code length differs from Foundry artifact");
 if(normalizedRuntime(observedCode,artifact.immutableSpans)!==
    normalizedRuntime(artifact.runtime,artifact.immutableSpans))
  throw Error("On-chain runtime differs outside compiler-declared immutables");
 return keccak256(hexBytes(observedCode));
}
export async function trustedBuild(root,commit,{
 runner=async()=>{
  const {stdout:version}=await exec("forge",["--version"],{cwd:root,timeout:12000,maxBuffer:4096});
  await exec("forge",["build","--force"],{cwd:root,timeout:180000,maxBuffer:1024*1024*4});
  return version.trim();
 }
}={}){
 if(!SHA.test(commit||""))throw Error("Trusted build requires exact main commit SHA");
 if(checkedLocalMain(root)!==commit.toLowerCase())throw Error("Source checkout changed before build");
 const forgeVersion=await runner();
 if(checkedLocalMain(root)!==commit.toLowerCase())throw Error("Source checkout changed while building");
 const artifacts={};
 for(const [component,name] of Object.entries(SOURCE)){
  const raw=JSON.parse(readFileSync(join(root,"out",name+".sol",name+".json"),"utf8"));
  artifacts[component]=artifactTemplate(raw,{component,commit,forgeVersion});
 }
 return {commit:commit.toLowerCase(),forgeVersion,artifacts};
}
