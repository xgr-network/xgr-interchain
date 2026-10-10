import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {checkedLocalMain} from "./main-gate.mjs";
export const NAMES=Object.freeze(["XGRInterchainBLSVerifier","XGRInterchainValidatorRegistryV2","XGRILNInterchainISMV2","XETATokenFactoryV315","XGRILNRegistryV315","XETAGuardedNativeWarpRouter","XETAGuardedSyntheticWarpRouter","XETAGuardedCollateralWarpRouterV315","ILNGateway","XGRILNFeeVault"]);
const SHA=/^[a-f0-9]{40}$/i;
const digest=x=>createHash("sha256").update(x).digest("hex");
const dirFor=(root,commit)=>join(resolve(root),"runtime-state","admin","deployment-artifacts",commit);
export function sealArtifacts(root,{commit=checkedLocalMain(root),forgeVersion}={}){
 if(!SHA.test(commit||"")||typeof forgeVersion!=="string"||!forgeVersion.toLowerCase().includes("forge"))
  throw Error("A pinned main commit and Forge version are required");
 const raws={},hashes={};
 for(const name of NAMES){
  const bytes=readFileSync(join(root,"out",name+".sol",name+".json"));
  JSON.parse(bytes.toString("utf8"));
  hashes[name]=digest(bytes);raws[name]=JSON.parse(bytes.toString("utf8"));
 }
 const seal={schema:"xita-precompiled-v2",sourceCommit:commit.toLowerCase(),forgeVersion,artifacts:hashes};
 const directory=dirFor(root,commit.toLowerCase());
 mkdirSync(directory,{recursive:true,mode:0o755});
 const name="xita-deployment-build.json";
 const temp=join(directory,".xita-"+randomUUID()+".json");
 const packed={...seal,compiled:raws};
 writeFileSync(temp,JSON.stringify(packed)+"\n",{flag:"wx",mode:0o644});
 renameSync(temp,join(directory,name));
 return seal;
}
export function readSealedArtifacts(root,commit){
 if(!SHA.test(commit||""))throw Error("Invalid artifact commit");
 const file=join(dirFor(root,commit.toLowerCase()),"xita-deployment-build.json");
 if(!existsSync(file))throw Error("Deployment artifact release missing for "+commit+"; run ./manage.sh update");
 const packed=JSON.parse(readFileSync(file,"utf8"));
 if(packed.schema!=="xita-precompiled-v2"||packed.sourceCommit!==commit.toLowerCase()||
    typeof packed.forgeVersion!=="string"||!packed.forgeVersion.toLowerCase().includes("forge"))
  throw Error("Deployment release source commit or compiler mismatch");
 const raws={};
 for(const name of NAMES){
  const raw=packed.compiled?.[name];
  if(!raw)throw Error("Missing release artifact "+name);
  const disk=Buffer.from(JSON.stringify(raw)); // Canonical packed objects, not mutable Forge out directory.
  if(packed.artifacts?.[name]!==digest(disk))
   throw Error("Deployment release artifact mismatch: "+name);
  raws[name]=raw;
 }
 return {seal:packed,raws};
}
