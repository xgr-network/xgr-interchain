// Compile during software update; the Admin process only reads the sealed
// release and never depends on Forge's ephemeral out/ directory.
import {readFileSync,writeFileSync,renameSync,mkdirSync,rmSync,lstatSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {checkedLocalMain} from "./main-gate.mjs";

export const NAMES=Object.freeze(["XGRInterchainBLSVerifier","XGRInterchainValidatorRegistryV2","XGRILNInterchainISMV2","XETATokenFactoryV315","XGRILNRegistryV315","XETAGuardedNativeWarpRouter","XETAGuardedSyntheticWarpRouter","XETAGuardedCollateralWarpRouterV315","ILNGateway","XGRILNFeeVault"]);
const SHA=/^[a-f0-9]{40}$/i;
const HASH=/^[a-f0-9]{64}$/i;
const STORE="runtime-state/xita-compiled-artifacts";
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");

// GitHub receipt/UI changes do not invalidate Solidity artifacts. Changes to
// tracked production contracts, remappings, compiler settings or pinned
// dependency declarations always invalidate the seal.
export function deploymentSourceFingerprint(root){
 const paths=execFileSync("git",[
  "ls-files","-z","--","contracts","foundry.toml","remappings.txt","vendor/package.json","vendor/package-lock.json"
 ],{cwd:root}).toString("utf8").split("\0").filter(Boolean).sort();
 if(!paths.includes("foundry.toml")||!paths.includes("vendor/package.json")||
    !paths.some(p=>p.startsWith("contracts/")&&p.endsWith(".sol")))
  throw Error("Tracked Solidity sources, Foundry settings or pinned vendor declaration missing");
 const hash=createHash("sha256");
 for(const path of paths){
  const file=join(root,path),stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error("Invalid tracked Solidity source: "+path);
  hash.update(path+"\0");hash.update(digest(readFileSync(file))+"\0");
 }
 return hash.digest("hex");
}
function releasePath(root,fingerprint){
 if(!HASH.test(fingerprint||""))throw Error("Invalid Solidity source fingerprint");
 return join(resolve(root),STORE,fingerprint.toLowerCase());
}
function safeFile(path){
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0||stat.size>20*1024*1024)
  throw Error("Invalid sealed deployment artifact: "+path);
 return readFileSync(path);
}
export function sealArtifacts(root,{commit=checkedLocalMain(root),forgeVersion,sourceFingerprint}={}){
 if(!SHA.test(commit||"")||typeof forgeVersion!=="string"||
    !forgeVersion.toLowerCase().includes("forge"))
  throw Error("A pinned main commit and Forge version are required");
 const fingerprint=(sourceFingerprint??deploymentSourceFingerprint(root)).toLowerCase();
 const destination=releasePath(root,fingerprint);
 const contents={},artifacts={};
 for(const name of NAMES){
  const bytes=readFileSync(join(root,"out",name+".sol",name+".json"));
  JSON.parse(bytes.toString("utf8"));
  contents[name]=bytes;
  artifacts[name]=digest(bytes);
 }
 if(existsSync(destination)){
  const {seal}=readSealedArtifacts(root,commit,{sourceFingerprint:fingerprint});
  if(NAMES.every(name=>seal.artifacts[name]===artifacts[name]))return seal;
  throw Error("Different bytecode already sealed for identical Solidity sources; investigate build reproducibility");
 }
 const parent=join(resolve(root),STORE);
 mkdirSync(parent,{recursive:true,mode:0o755});
 const temporary=join(parent,".release-"+randomUUID());
 mkdirSync(temporary,{mode:0o755});
 const seal={schema:"xita-precompiled-v2",sourceCommit:commit.toLowerCase(),
  sourceFingerprint:fingerprint,forgeVersion,artifacts};
 try{
  for(const name of NAMES){
   const dir=join(temporary,name+".sol");
   mkdirSync(dir,{mode:0o755});
   writeFileSync(join(dir,name+".json"),contents[name],{mode:0o644,flag:"wx"});
  }
  writeFileSync(join(temporary,"seal.json"),JSON.stringify(seal,null,2)+"\n",{mode:0o644,flag:"wx"});
  renameSync(temporary,destination);
  return seal;
 }catch(error){rmSync(temporary,{recursive:true,force:true});throw error}
}
export function readSealedArtifacts(root,commit,{sourceFingerprint}={}){
 if(!SHA.test(commit||""))throw Error("Invalid current GitHub main commit");
 const fingerprint=(sourceFingerprint??deploymentSourceFingerprint(root)).toLowerCase();
 const dir=releasePath(root,fingerprint);
 const seal=JSON.parse(safeFile(join(dir,"seal.json")).toString("utf8"));
 if(seal.schema!=="xita-precompiled-v2"||seal.sourceFingerprint!==fingerprint||
    !SHA.test(seal.sourceCommit||"")||typeof seal.forgeVersion!=="string"||
    !seal.forgeVersion.toLowerCase().includes("forge")||
    Object.keys(seal.artifacts||{}).length!==NAMES.length)
  throw Error("Sealed release does not match current Solidity source fingerprint; run software update");
 const raws={};
 for(const name of NAMES){
  const bytes=safeFile(join(dir,name+".sol",name+".json"));
  if(!HASH.test(seal.artifacts[name]||"")||seal.artifacts[name]!==digest(bytes))
   throw Error("Compiled artifact changed or is missing: "+name);
  raws[name]=JSON.parse(bytes.toString("utf8"));
 }
 return {seal,raws};
}
