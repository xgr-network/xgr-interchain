import test from "node:test";
import assert from "node:assert/strict";
import {buildPlan,renderStepCommand,validateDeployTopology} from "./plan.mjs";
const a="0x"+"a".repeat(40);
const catalog={schemaVersion:1,chains:{xgrchain:{chainId:1643,domainId:1643},base:{chainId:8453,domainId:8453}},
 infrastructure:{xgrchain:{chainId:1643,domainId:1643,hyperlaneCore:{mailbox:a,merkleTreeHook:a}},
 base:{chainId:8453,domainId:8453,hyperlaneCore:{mailbox:a,merkleTreeHook:a}}},
 assets:{XGR:{routes:{routes:[{name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"},{name:"base_to_xgr",sourceChain:"base",destinationChain:"xgrchain"}]}}}};
test("validates the 2-chain topology",()=>assert.equal(validateDeployTopology(catalog),true));
test("all plan steps are ordered and explicit",()=>{
 const steps=buildPlan(catalog),known=new Set();
 for(const s of steps){for(const d of s.dependsOn)assert.equal(known.has(d),true);known.add(s.id)}
 assert.equal(steps.at(-1).id,"publish");
 assert.equal(steps.find(s=>s.id==="governance_xgr").dependsOn.includes("bindings"),true);
 assert.equal(steps.find(s=>s.id==="e2e_outbound").dependsOn.includes("bootstrap_base"),true);
 assert.equal(steps.some(s=>s.script&&s.kind!=="deploy"),false);
});
test("CLI plans never include keys or arbitrary paths",()=>{
 for(const s of buildPlan(catalog)){
   const cmd=renderStepCommand(s);
   if(cmd){assert.match(cmd,/^forge script script\/DeployXETA/);assert.match(cmd,/--broadcast$/);assert.doesNotMatch(cmd,/private-key|;|&&/)}
 }
});
test("rejects wrong chain or missing canonical endpoints",()=>{
 const bad=structuredClone(catalog);bad.chains.base.chainId=137;
 assert.throws(()=>buildPlan(bad),/chain IDs/);
 const broken=structuredClone(catalog);broken.infrastructure.base.hyperlaneCore.mailbox=null;
 assert.throws(()=>buildPlan(broken),/Hyperlane/);
});
