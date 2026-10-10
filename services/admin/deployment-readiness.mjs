// Read-only, per-configured-chain bridge from local PUBLIC evidence to
// operator deployment readiness. No wallet signing or chain state writes.
import {lstatSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {prepareBootstrapEvidence} from "./bootstrap-evidence.mjs";
import {rpcCall} from "./inspector.mjs";
const equal=(x,y)=>typeof x==="string"&&typeof y==="string"&&x.toLowerCase()===y.toLowerCase();
const safeChain=n=>typeof n==="string"&&/^[a-z][a-z0-9-]*$/.test(n);
const approvedFields=["minimumWei","maxExecutorReimbursementWei","perValidatorWei"];
const readPublic=(path)=>{
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0||stat.size>128*1024)
  throw Error("Invalid or oversized local PUBLIC bootstrap evidence file");
 return readFileSync(path,"utf8");
};
const loadJSON=p=>JSON.parse(readPublic(p));
function sameEvidence(a,b,expected){
 if(a?.blockNumber!==b?.blockNumber||!equal(a?.blockHash,b?.blockHash)||
    !Array.isArray(a?.validators)||a.validators.length!==expected.length||
    !Array.isArray(b?.validators)||b.validators.length!==expected.length)return false;
 const fields=["address","blsPublicKeyCompressed","blsPublicKeyEIP2537","possessionProof"];
 return expected.every((address,i)=>fields.every(field=>
  equal(a.validators[i]?.[field],b.validators[i]?.[field]))&&
  equal(a.validators[i]?.address,address)&&
  a.validators[i]?.originChainId===b.validators[i]?.originChainId&&
  a.validators[i]?.destinationDomain===b.validators[i]?.destinationDomain);
}
export async function readDeploymentReadiness({
 root,chain,inventory,boot,baseDir,mainCurrent=false,
 rpc=rpcCall,verifyProof
}){
 if(!safeChain(chain?.name)||!inventory?.chains?.some(c=>c.name===chain.name&&c.chainId===chain.chainId))
  throw Error("Chain is not in approved GitHub inventory");
 const config=loadJSON(join(root,"config/bootstrap",chain.name+".json"));
 const initial=loadJSON(join(root,"config/validators/initial.json"));
 const origin=inventory.chains.find(c=>c.chainId===initial.originChainId);
 if(!origin||config.chain!==chain.name||config.chainId!==chain.chainId)
  throw Error("Missing canonical origin or deployment bootstrap");
 const evidenceDir=resolve(baseDir,chain.name);
 const report={chain:chain.name,chainId:chain.chainId,
  mode:"read-only",mainCurrent:Boolean(mainCurrent),
  evidenceVerified:false,verifiedValidatorCount:0,originSnapshotBlock:null,
  snapshotConfirmedDepth:null,manifestMatchesEvidence:false,
  bootstrapReady:boot.ready===true,
  deploymentExecutable:false,transactionSimulation:"not-available",
  values:{sourceFeeWei:config.sourceFee?.targetWei??null,
   minimumReserveWei:config.reserve?.minimumWei??null,
   maxExecutorReimbursementWei:config.reserve?.maxExecutorReimbursementWei??null,
   perValidatorReserveWei:config.reserve?.perValidatorWei??null},
  missing:[]};
 if(!mainCurrent)report.missing.push("GitHub main ist nicht aktuell bestätigt");
 if(!boot.ready)report.missing.push(...boot.missing);
 try{
  const snapshot=loadJSON(join(evidenceDir,"pos-snapshot.json"));
  const proofs=initial.validators.map((_,i)=>readPublic(join(evidenceDir,"validator-"+(i+1)+".txt")));
  const candidate=loadJSON(join(evidenceDir,"bootstrap-candidate.json"));
  const prepared=await prepareBootstrapEvidence({chain,originChain:origin,bootstrap:config,
   initial,snapshot,proofs,rpc,...(verifyProof?{verifyProof}:{})});
  if(!sameEvidence(candidate.validatorSnapshot,prepared.candidate.validatorSnapshot,initial.validators))
   throw Error("Local candidate differs from independently verified public evidence");
  report.evidenceVerified=true;
  report.verifiedValidatorCount=prepared.report.verifiedValidatorCount;
  report.originSnapshotBlock=prepared.report.snapshotBlock;
  report.snapshotConfirmedDepth=prepared.report.confirmedDepth;
  report.manifestMatchesEvidence=sameEvidence(config.validatorSnapshot,
   prepared.candidate.validatorSnapshot,initial.validators);
  if(!report.manifestMatchesEvidence)report.missing.push("Validierter Bootstrap muss in GitHub main übernommen werden");
 }catch(e){
  report.evidenceError=String(e.message||e).slice(0,160);
  report.missing.push("Öffentliche Validator- und Snapshot-Evidenz nicht vollständig geprüft");
 }
 for(const key of approvedFields)if(config.reserve?.[key]===null||config.reserve?.[key]===undefined)
  report.missing.push("Reserveparameter fehlt: "+key);
 if(config.sourceFee?.targetWei===null||config.sourceFee?.targetWei===undefined)
  report.missing.push("Initiale Source-Fee fehlt");
 if(!report.bootstrapReady||!report.manifestMatchesEvidence||!report.evidenceVerified)
  report.transactionSimulation="blocked-by-bootstrap";
 else report.transactionSimulation="requires-verified-artifact-and-gas-estimation";
 return report;
}
