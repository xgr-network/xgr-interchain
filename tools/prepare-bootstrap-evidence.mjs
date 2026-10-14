#!/usr/bin/env node
// No transactions, no private keys, no changes to approved GitHub manifests.
import {approvedValidatorSet} from "../services/admin/bootstrap.mjs";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareBootstrapEvidence} from "../services/admin/bootstrap-evidence.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const [chainName,snapshotPath,proofDir,outputPath]=process.argv.slice(2);
if(!/^[a-z][a-z0-9-]*$/.test(chainName||"")||!snapshotPath||!proofDir||!outputPath){
 console.error("Usage: node tools/prepare-bootstrap-evidence.mjs <chain> <snapshot.json> <public-proof-directory> <output-candidate.json>");
 process.exit(2);
}
function load(path){return JSON.parse(readFileSync(path,"utf8"))}
const config=(p)=>load(join(root,p));
try{
 const chain=config("config/chains/"+chainName+"/chain.json");
 const initial=approvedValidatorSet(root,config("config/chains/"+chainName+"/bootstrap.json"));
 const origin=config("config/chains/xgrchain/chain.json");
 const bootstrap=config("config/chains/"+chainName+"/bootstrap.json");
 const snapshot=load(resolve(snapshotPath));
 const proofs=initial.validators.map((_,i)=>readFileSync(resolve(proofDir,"validator-"+(i+1)+".txt"),"utf8"));
 const {candidate,report}=await prepareBootstrapEvidence({chain,originChain:origin,bootstrap,initial,snapshot,proofs});
 const dest=resolve(outputPath);
 if(dest.startsWith(join(root,"config")+ "/")||dest.startsWith(join(root,"deployments")+"/"))
  throw Error("Cannot write candidate into approved config or deployment tree");
 mkdirSync(dirname(dest),{recursive:true,mode:0o700});
 writeFileSync(dest,JSON.stringify(candidate,null,2)+"\n",{encoding:"utf8",flag:"wx",mode:0o600});
 console.log(JSON.stringify({...report,candidatePath:dest,remaining:{
  initialSourceFee:bootstrap.sourceFee?.targetWei===null,
  minimumReserve:bootstrap.reserve?.minimumWei===null,
  executorReimbursement:bootstrap.reserve?.maxExecutorReimbursementWei===null,
  perValidatorReserve:bootstrap.reserve?.perValidatorWei===null
 }},null,2));
}catch(e){console.error("Bootstrap evidence FAILED: "+String(e.message||e));process.exitCode=1}
