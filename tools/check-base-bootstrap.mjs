#!/usr/bin/env node
// Read-only cross-chain validator proof validation. No keys, no signing.
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareBaseFromXgr} from "../services/admin/base-bootstrap-from-xgr.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const [evidenceDir]=process.argv.slice(2);
if(!evidenceDir){console.error("Usage: node tools/check-base-bootstrap.mjs <public-base-evidence-dir>");process.exit(2)}
const load=path=>JSON.parse(readFileSync(path,"utf8"));
try{
 const dir=resolve(evidenceDir);
 const initial=load(join(root,"config/validators/initial.json"));
 const xgrChain=load(join(root,"config/chains/xgrchain/chain.json"));
 const baseChain=load(join(root,"config/chains/base/chain.json"));
 const bootstrap=load(join(root,"config/chains/base/bootstrap.json"));
 const deployed=load(join(root,"deployments/chains/xgrchain.json"));
 const snapshot=load(join(dir,"pos-snapshot.json"));
 const proofs=initial.validators.map((_,i)=>readFileSync(join(dir,"validator-"+(i+1)+".txt"),"utf8"));
 const registryAddress=deployed.xitaV315?.components?.validatorRegistry?.address;
 const report=await prepareBaseFromXgr({
  xgrChain,baseChain,registryAddress,initial,bootstrap,snapshot,proofs});
 console.log(JSON.stringify({status:"precheck-only",sourceRegistry:report.registry,
  originSnapshotBlock:report.report.snapshotBlock,
  originSnapshotHash:report.report.snapshotHash,
  validatorCount:report.report.verifiedValidatorCount,
  proofMode:report.proofMode,
  destinationVerifierVerified:false,
  deploymentAuthorized:false,
  next:"Deploy and verify Base BLS verifier, rerun proof validation against Base before ValidatorRegistry"},null,2));
}catch(e){console.error("BASE VALIDATOR PRECHECK FAILED: "+String(e.message||e));process.exitCode=1}
