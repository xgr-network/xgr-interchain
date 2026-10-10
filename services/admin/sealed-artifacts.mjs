import {readFileSync,writeFileSync,renameSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {checkedLocalMain} from "./main-gate.mjs";
export const NAMES=Object.freeze(["XGRInterchainBLSVerifier","XGRInterchainValidatorRegistryV2","XGRILNInterchainISMV2","XETATokenFactoryV315","XGRILNRegistryV315","XETAGuardedNativeWarpRouter","XETAGuardedSyntheticWarpRouter","XETAGuardedCollateralWarpRouterV315","ILNGateway","XGRILNFeeVault"]);
const valid=/^[a-f0-9]{40}$/i;
const digest=x=>createHash("sha256").update(x).digest("hex");
export function sealArtifacts(root,{commit=checkedLocalMain(root),forgeVersion,sourceFingerprint}={}){
 if(!valid.test(commit)||typeof forgeVersion!=="string"||!forgeVersion.toLowerCase().includes("forge"))
  throw Error("A pinned main commit and Forge version are required");
 const artifacts={};
 for(const name of NAMES){
  const content=readFileSync(join(root,"out",name+".sol",name+".json"));
  JSON.parse(content.toString("utf8"));
  artifacts[name]=digest(content);
 }
 const seal={schema:"xita-precompiled-v1",sourceCommit:commit.toLowerCase(),forgeVersion,artifacts};
 const dir=resolve(root,"out");
 const file=join(dir,"xita-deployment-build.json");
 const temp=join(dir,".xita-build-"+randomUUID()+".json");
 writeFileSync(temp,JSON.stringify(seal,null,2)+"\n",{mode:0o600,flag:"wx"});
 renameSync(temp,file);
 return seal;
}
export function readSealedArtifacts(root,commit,{sourceFingerprint}={}){
 const seal=JSON.parse(readFileSync(join(root,"out","xita-deployment-build.json"),"utf8"));
 if(seal.schema!=="xita-precompiled-v1"||seal.sourceCommit!==commit.toLowerCase()||
    !valid.test(commit)||typeof seal.forgeVersion!=="string"||!seal.forgeVersion.toLowerCase().includes("forge"))
  throw Error("Precompiled artifacts not sealed for current main; run software update");
 const raws={};
 for(const name of NAMES){
  const bytes=readFileSync(join(root,"out",name+".sol",name+".json"));
  if(seal.artifacts?.[name]!==digest(bytes))
   throw Error("Compiled artifact changed or is missing: "+name);
  raws[name]=JSON.parse(bytes.toString("utf8"));
 }
 return {seal,raws};
}
