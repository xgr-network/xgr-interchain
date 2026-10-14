#!/usr/bin/env node
// Optional PUBLIC, read-only proof report. Deployments perform this check
// automatically: no snapshot export, no PoS RPC and no manual candidate gate.
import {approvedValidatorSet} from "../services/admin/bootstrap.mjs";
import {verifiedRuntime} from "../services/admin/deployment-readiness.mjs";
import {rpcCall} from "../services/admin/inspector.mjs";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareBootstrapEvidence} from "../services/admin/bootstrap-evidence.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const [chainName,proofDir,outputPath]=process.argv.slice(2);
if(!/^[a-z][a-z0-9-]*$/.test(chainName||"")||!proofDir||!outputPath){
 console.error("Usage: node tools/prepare-bootstrap-evidence.mjs <chain> <public-proof-directory> <output-report.json>");
 process.exit(2);
}
function load(path){return JSON.parse(readFileSync(path,"utf8"))}
try{
 const chain=load(join(root,"config/chains",chainName,"chain.json"));
 const config=load(join(root,"config/chains",chainName,"bootstrap.json"));
 const initial=approvedValidatorSet(root,config);
 let bootstrap=config;
 if(chain.blsVerifierFormat==="eip2537"){
  const infra=load(join(root,chain.observedInfrastructure));
  const verifier=await verifiedRuntime(infra.xitaV315?.components?.blsVerifier,chain,rpcCall);
  bootstrap={...config,verifierAddress:verifier};
 }
 const proofs=initial.validators.map((_,i)=>readFileSync(
  resolve(proofDir,"validator-"+(i+1)+".txt"),"utf8"));
 const {candidate,report}=await prepareBootstrapEvidence({
  chain,bootstrap,initial,proofs,rpc:rpcCall});
 const dest=resolve(outputPath);
 if(dest.startsWith(join(root,"config")+"/")||dest.startsWith(join(root,"deployments")+"/"))
  throw Error("Cannot write a preview into approved config or deployment tree");
 mkdirSync(dirname(dest),{recursive:true,mode:0o700});
 writeFileSync(dest,JSON.stringify({report,validators:candidate.validatorSnapshot.validators},null,2)+"\n",
  {encoding:"utf8",flag:"wx",mode:0o600});
 console.log(JSON.stringify({verification:report.verification,
  validatorCount:report.verifiedValidatorCount,reportPath:dest,
  note:"Admin re-verifies the same public proofs before signing. No import required."},null,2));
}catch(e){console.error("GENESIS PROOF CHECK FAILED: "+String(e.message||e));process.exitCode=1}
