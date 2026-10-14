#!/usr/bin/env node
// Optional read-only precheck of the hand-approved Base Interchain Genesis.
// No PoS query, origin Interchain Registry, snapshot or wallet transaction.
import {approvedValidatorSet} from "../services/admin/bootstrap.mjs";
import {verifiedRuntime} from "../services/admin/deployment-readiness.mjs";
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareBaseFromXgr} from "../services/admin/base-bootstrap-from-xgr.mjs";
import {rpcCall} from "../services/admin/inspector.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const [evidenceDir]=process.argv.slice(2);
if(!evidenceDir){
 console.error("Usage: node tools/check-base-bootstrap.mjs <public-base-evidence-dir>");
 process.exit(2);
}
const load=path=>JSON.parse(readFileSync(path,"utf8"));
try{
 const dir=resolve(evidenceDir);
 const xgrChain=load(join(root,"config/chains/xgrchain/chain.json"));
 const baseChain=load(join(root,"config/chains/base/chain.json"));
 const config=load(join(root,"config/chains/base/bootstrap.json"));
 const initial=approvedValidatorSet(root,config);
 const infra=load(join(root,baseChain.observedInfrastructure));
 const verifier=await verifiedRuntime(infra.xitaV315?.components?.blsVerifier,baseChain,rpcCall);
 const bootstrap={...config,verifierAddress:verifier};
 const proofs=initial.validators.map((_,i)=>readFileSync(join(dir,"validator-"+(i+1)+".txt"),"utf8"));
 const report=await prepareBaseFromXgr({xgrChain,baseChain,initial,bootstrap,proofs});
 console.log(JSON.stringify({status:"public-genesis-proofs-verified",
  validatorCount:report.report.verifiedValidatorCount,
  proofMode:report.proofMode,destinationVerifierVerified:report.destinationVerifierVerified,
  deploymentAuthorized:false,
  next:"Registry V3 is deployed via MetaMask in the Admin UI"},null,2));
}catch(e){console.error("BASE GENESIS PROOF CHECK FAILED: "+String(e.message||e));process.exitCode=1}
