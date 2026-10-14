// Read-only, per-configured-chain bridge from local PUBLIC evidence to
// operator deployment readiness. No wallet signing or chain state writes.
import {lstatSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {prepareBootstrapEvidence} from "./bootstrap-evidence.mjs";
import {readFinalizedXgrRegistrySnapshot} from "./base-bootstrap-from-xgr.mjs";
import {approvedValidatorSet} from "./bootstrap.mjs";
import {rpcCall} from "./inspector.mjs";
import {keccak256} from "../../apps/web/keccak.mjs";
import {chainBootstrapPath} from "../../tools/manifest-layout.mjs";
const equal=(x,y)=>typeof x==="string"&&typeof y==="string"&&x.toLowerCase()===y.toLowerCase();
const safeChain=n=>typeof n==="string"&&/^[a-z][a-z0-9-]*$/.test(n);
const approvedFields=["minimumWei","maxExecutorReimbursementWei","perValidatorWei"];
// Receipt paths are canonical across the deployment ledger, the startup
// inventory, and the public validator evidence readout. A different chain,
// address, or historical/legacy layout is never accepted as proof.
export function validVerifierDeploymentReceipt(chainName,record){
 if(!safeChain(chainName)||!/^0x[0-9a-f]{40}$/i.test(record?.address||"")||
    !/^0x[0-9a-f]{64}$/i.test(record?.runtimeCodeKeccak256||"")||
    typeof record?.receiptPath!=="string")return false;
 const match=new RegExp("^deployments/receipts/"+chainName+
  "/[0-9a-f]{64}-([0-9a-f]{40})\\.json$","i").exec(record.receiptPath);
 return Boolean(match && match[1].toLowerCase()===record.address.slice(2).toLowerCase());
}
const readPublic=(path)=>{
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0||stat.size>128*1024)
  throw Error("Invalid or oversized local PUBLIC bootstrap evidence file");
 return readFileSync(path,"utf8");
};
const loadJSON=p=>JSON.parse(readPublic(p));
async function verifiedRuntime(record,chain,rpc){
 if(!validVerifierDeploymentReceipt(chain.name,record))
  throw Error("Missing canonical deployed contract receipt on "+chain.name);
 const code=await rpc(chain.rpcUrls[0],"eth_getCode",[record.address,"latest"]);
 if(!/^0x(?:[0-9a-f]{2})+$/i.test(code||"")||
    keccak256(Uint8Array.from(Buffer.from(code.slice(2),"hex"))).toLowerCase()!==
    record.runtimeCodeKeccak256.toLowerCase())
  throw Error("Documented on-chain contract runtime mismatch on "+chain.name);
 return record.address;
}

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
 const config=loadJSON(join(root,chainBootstrapPath(chain.name)));
 const initial=approvedValidatorSet(root,config);
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
  verifiedSnapshot:null,
  values:{sourceFeeWei:config.sourceFee?.targetWei??null,
   minimumReserveWei:config.reserve?.minimumWei??null,
   maxExecutorReimbursementWei:config.reserve?.maxExecutorReimbursementWei??null,
   perValidatorReserveWei:config.reserve?.perValidatorWei??null},
  missing:[]};
 if(!mainCurrent)report.missing.push("GitHub main ist nicht aktuell bestätigt");
 try{
  // One independently approved list per destination remains pinned to GitHub. Public
  // domain-bound BLS proofs are mandatory; no duplicate hand-saved candidate.
  const proofs=initial.validators.map((_,i)=>{
   try{return readPublic(join(evidenceDir,"validator-"+(i+1)+".txt"));}
   catch(e){if(e.code==="ENOENT")throw Error("Zielchain-Validator-Nachweis "+(i+1)+" für "+chain.name+" fehlt im Public-Bootstrap-Verzeichnis");throw e;}
  });
  let proofBootstrap=config;
  if(chain.blsVerifierFormat==="eip2537"){
   const infrastructure=loadJSON(join(root,chain.observedInfrastructure));
   const address=await verifiedRuntime(
    infrastructure.xitaV315?.components?.blsVerifier,chain,rpc);
   proofBootstrap={...config,verifierAddress:address};
  }
  let snapshot;
  if(chain.chainId===initial.originChainId){
   snapshot=loadJSON(join(evidenceDir,"pos-snapshot.json"));
   report.snapshotSource="public-pos-snapshot";
  }else{
   // All destination chains independently select an approved validator set.
   // Verify each member against a finalized XGRChain Registry V3 block:
   // no copied local PoS snapshots, and no assumption all chains choose the
   // same initial addresses. The destination BLS proofs bind its own domain.
   const source=loadJSON(join(root,origin.observedInfrastructure));
   const registry=source.xitaV315?.components?.validatorRegistry;
   const address=await verifiedRuntime(registry,origin,rpc);
   snapshot=await readFinalizedXgrRegistrySnapshot({
    xgrChain:origin,registryAddress:address,initial,rpc});
   report.snapshotSource="confirmed-xgrchain-registry-v3";
  }
  const prepared=await prepareBootstrapEvidence({
   chain,originChain:origin,bootstrap:proofBootstrap,
   initial,snapshot,proofs,rpc,...(verifyProof?{verifyProof}:{})
  });
  const trusted=prepared.candidate.validatorSnapshot;
  if(new Set(trusted.validators.map(v=>v.blsPublicKeyCompressed.toLowerCase())).size!==initial.validators.length)
   throw Error("Duplicate validator BLS keys");
  // A committed full snapshot, when present, remains a strict commitment.
  // An EMPTY bootstrap template is not an extra manual deployment gate:
  // proof material is reconstructed and verified at preview/prepare time.
  const pinned=config.validatorSnapshot;
  if(Array.isArray(pinned?.validators)&&pinned.validators.length>0&&
     !sameEvidence(pinned,trusted,initial.validators))
   throw Error("GitHub-pinned validator snapshot differs from live verified evidence");
  report.verifiedSnapshot=trusted;
  report.evidenceVerified=true;
  report.verifiedValidatorCount=prepared.report.verifiedValidatorCount;
  report.originSnapshotBlock=prepared.report.snapshotBlock;
  report.snapshotConfirmedDepth=prepared.report.confirmedDepth;
  report.manifestMatchesEvidence=true;
 }catch(e){
  report.evidenceError=String(e.message||e).slice(0,200);
  report.missing.push("Validator-Bootstrap: "+report.evidenceError);
 }
 const values=config.reserve||{};
 const positive=value=>typeof value==="string"&&/^[1-9][0-9]*$/.test(value);
 const economicsReady=approvedFields.every(key=>positive(values[key]))&&
   BigInt(values.perValidatorWei)>=BigInt(values.minimumWei)&&
   BigInt(values.minimumWei)>=BigInt(values.maxExecutorReimbursementWei);
 const feeReady=positive(config.sourceFee?.targetWei);
 if(!economicsReady)report.missing.push("Reserveparameter fehlen oder sind inkonsistent");
 if(!feeReady)report.missing.push("Initiale Source-Fee fehlt");
 report.bootstrapReady=report.evidenceVerified&&economicsReady;
 if(report.bootstrapReady&&mainCurrent)
  report.transactionSimulation="requires-verified-artifact-and-gas-estimation";
 else report.transactionSimulation="blocked-by-bootstrap";
 return report;
}
