import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {parseUnitShow,summarizeTransferIndex,inspectEvidenceFile,collectOperationsHealth,UNITS} from "./operations-health.mjs";
const now=Date.parse("2026-10-19T12:00:00.000Z");
const cursor=(updatedAt,scannedTo=100,finalizedHead=100,complete=true)=>({
 source:"base",destination:"xgrchain",route:"base_to_xgr",scannedTo,finalizedHead,updatedAt,complete
});
const stats=(routes,complete=true)=>({ok:true,coverage:{routes,complete,indexedRoutes:routes.filter(r=>r.complete).length,requiredRoutes:routes.length}});
test("systemd parses loaded and not-installed without inventing uptime",()=>{
 const def=UNITS[0];
 assert.equal(parseUnitShow("LoadState=loaded\nActiveState=active\nSubState=running\nNRestarts=2\n",def).state,"ok");
 assert.equal(parseUnitShow("LoadState=not-found\nActiveState=inactive\n",def).state,"not-installed");
 assert.equal(parseUnitShow("LoadState=loaded\nActiveState=failed\n",def).state,"down");
});
test("indexer health recognizes freshness, historical backlog, stale cursors and missing values",()=>{
 assert.equal(summarizeTransferIndex(stats([cursor("2026-10-19T11:59:30Z")]),{now}).state,"ok");
 const behind=summarizeTransferIndex(stats([cursor("2026-10-19T11:59:30Z",90,100,false)],false),{now});
 assert.equal(behind.state,"warning");assert.equal(behind.routes[0].lagBlocks,10);
 const stuck=summarizeTransferIndex(stats([cursor("2026-10-19T11:50:00Z",90,100,false)],false),{now});
 assert.equal(stuck.state,"stalled");
 const unknown=summarizeTransferIndex(stats([cursor(null,null,null,false)],false),{now});
 assert.equal(unknown.routes[0].lagBlocks,null);
 assert.equal(unknown.routes[0].scannedTo,null);
 assert.notEqual(unknown.state,"ok");
});
test("TVL evidence is fresh only with a valid timestamp and schema",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-health-test-"));
 const file=join(dir,"tvl.json");
 assert.equal(inspectEvidenceFile(file,{now}).status,"missing");
 writeFileSync(file,JSON.stringify({schemaVersion:1,kind:"xita-asset-metrics-v1",asOf:"2026-10-19T11:59:30Z",assets:{XGR:{verified:true}}}));
 assert.deepEqual(inspectEvidenceFile(file,{now}),{status:"fresh",asOf:"2026-10-19T11:59:30.000Z",verifiedAssets:1});
 assert.equal(inspectEvidenceFile(file,{now:now+600000}).status,"stale");
 writeFileSync(file,"bad json");
 assert.equal(inspectEvidenceFile(file,{now}).status,"invalid");
});
test("overall health is sound with absent optional services but flags core failure",async()=>{
 const catalog={chains:{xgrchain:{chainId:1643,rpcUrls:["https://rpc.xgr.network"]}}};
 const readUnit=async name=>UNITS.find(x=>x.unit===name)?.optional?
  "LoadState=not-found\nActiveState=inactive\n":
  "LoadState=loaded\nActiveState=active\nSubState=running\nNRestarts=0\n";
 const readHTTP=async target=>target.optional?Promise.reject(Error("not installed")):
  target.id==="transfer-stats"?stats([cursor("2026-10-19T11:59:30Z")]):
  {ok:true,proofBuilder:"installed"};
 const checkChain=async()=>({name:"xgrchain",chainId:1643,head:12,attempted:1,configuredEndpoints:1,state:"ok"});
 const readEvidence=()=>({status:"fresh",asOf:"2026-10-19T11:59:30Z",verifiedAssets:1});
 const good=await collectOperationsHealth({catalog,readUnit,readHTTP,checkChain,readEvidence,now});
 assert.equal(good.status,"ok");assert.equal(good.indexer.state,"ok");
 assert.equal(good.services.find(s=>s.id==="quote").state,"not-installed");
 assert.equal(good.checks.find(s=>s.id==="quote-api").state,"not-installed");
 const bad=await collectOperationsHealth({catalog,readUnit:async name=>name==="xita-transfer-indexer.service"?
  "LoadState=loaded\nActiveState=failed\n":readUnit(name),readHTTP,checkChain,readEvidence,now});
 assert.equal(bad.status,"degraded");
});
