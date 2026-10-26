import test from "node:test";
import assert from "node:assert/strict";
import {describeTokenJourney} from "./transfer-token-journey.js";
import {deriveTransferFlow,renderTransferFlow} from "./transfer-status-flow.js";

const h=x=>"0x"+x.repeat(64);
const wallet="0x"+"1".repeat(40);
const repsXGR=[
 {chain:"xgrchain",representation:"native",symbol:"XGR"},
 {chain:"base",representation:"synthetic",symbol:"wXGR"},
 {chain:"arbitrum",representation:"synthetic",symbol:"wXGR"}];
const repsARB=[
 {chain:"arbitrum",representation:"collateral",symbol:"ARB"},
 {chain:"xgrchain",representation:"synthetic",symbol:"wARB"},
 {chain:"base",representation:"synthetic",symbol:"wARB"}];
const source=(origin,destination,asset="XGR")=>({
 account:wallet,asset,sourceChain:origin,
 destinationChain:origin==="xgrchain"?destination:"xgrchain",
 finalDestinationChain:destination,txHash:h("a"),messageId:h("b"),
 onwardRouteId:h("c"),confirmed:true,delivered:false,status:"awaiting-proof"});
const get=(record,reps)=>describeTokenJourney({flow:deriveTransferFlow({
 journey:{origin:record.sourceChain,destination:record.finalDestinationChain,asset:record.asset},record
}),record,representations:reps});
const actions=journey=>journey.steps.map(x=>x.action+" "+x.symbol+" @ "+x.chain);

test("XGR two-hop burns wrapped Base, unlocks and re-locks native hub, mints Arbitrum",()=>{
 const record=source("base","arbitrum");
 const a=get(record,repsXGR);
 assert.deepEqual(actions(a),[
  "burn wXGR @ base","unlock XGR @ xgrchain",
  "lock XGR @ xgrchain","mint wXGR @ arbitrum"]);
 assert.equal(a.verified,1);
 assert.deepEqual(a.steps.map(x=>x.state),["complete","current","pending","pending"]);
 assert.match(a.summary,/wXGR burned on Base.*Next: unlock XGR on XGRChain/);
 const hub=get({...record,status:"awaiting-onward",delivered:true},repsXGR);
 assert.equal(hub.verified,2);
 assert.deepEqual(hub.steps.map(x=>x.state),["complete","complete","current","pending"]);
 assert.match(hub.summary,/XGR unlocked on XGRChain.*Next: lock XGR on XGRChain/);
 const onward={...record,status:"awaiting-final-proof",delivered:true,
  secondHopTxHash:h("d"),secondHopMessageId:h("e")};
 const final=get(onward,repsXGR);
 assert.equal(final.verified,3);
 assert.match(final.summary,/XGR locked on XGRChain.*Next: mint wXGR on Arbitrum/);
 assert.equal(final.steps[3].state,"current");
 const observed=get({...onward,finalProofObservation:{state:"delivery-observed"}},repsXGR);
 assert.equal(observed.verified,3);
 assert.equal(observed.steps[3].state,"observed");
 assert.match(observed.summary,/wXGR minted on Arbitrum observed; waiting for safe finality/);
 const done=get({...onward,status:"journey-delivered"},repsXGR);
 assert.equal(done.verified,4);
 assert.match(done.summary,/wXGR minted on Arbitrum\. Delivery verified/);
});

test("reversed XGR and ARB collateral journeys use actual token representation types",()=>{
 const xgr=get(source("arbitrum","base"),repsXGR);
 assert.deepEqual(actions(xgr),["burn wXGR @ arbitrum","unlock XGR @ xgrchain",
  "lock XGR @ xgrchain","mint wXGR @ base"]);
 const arbFromOriginal=get(source("arbitrum","base","ARB"),repsARB);
 assert.deepEqual(actions(arbFromOriginal),["lock ARB @ arbitrum","mint wARB @ xgrchain",
  "burn wARB @ xgrchain","mint wARB @ base"]);
 const arbBackOriginal=get(source("base","arbitrum","ARB"),repsARB);
 assert.deepEqual(actions(arbBackOriginal),["burn wARB @ base","mint wARB @ xgrchain",
  "burn wARB @ xgrchain","unlock ARB @ arbitrum"]);
});

test("direct one-hop token journey does not invent synthetic mint before delivery",()=>{
 const fromHub={...source("xgrchain","base"),destinationChain:"base"};
 const out=get(fromHub,repsXGR);
 assert.deepEqual(actions(out),["lock XGR @ xgrchain","mint wXGR @ base"]);
 assert.deepEqual(out.steps.map(x=>x.state),["complete","current"]);
 const inToHub={...source("base","xgrchain"),finalDestinationChain:"xgrchain"};
 const inbound=get(inToHub,repsXGR);
 assert.deepEqual(actions(inbound),["burn wXGR @ base","unlock XGR @ xgrchain"]);
});

test("unsigned / unconfirmed and unverified representations never become token claims",()=>{
 const record={...source("base","arbitrum"),confirmed:false,status:"confirming"};
 const progress=get(record,repsXGR);
 assert.equal(progress.verified,0);
 assert.equal(progress.steps[0].state,"current");
 assert.match(progress.summary,/No token movement is assumed yet/);
 const missing=get(source("base","arbitrum"),null);
 assert.equal(missing.steps.every(x=>x.action===null),true);
 const ambiguous=get(source("base","arbitrum"),[...repsXGR,repsXGR[1]]);
 assert.equal(ambiguous.steps[0].action,null);
 const unsafe=get(source("base","arbitrum"),repsXGR.map(x=>({...x,symbol:"<script>"})));
 assert.equal(unsafe.steps.every(x=>x.action===null),true);
});

test("modal makes verified four-token actions primary while retaining technical six-stage fallback",()=>{
 const record={...source("base","arbitrum"),status:"awaiting-final-proof",
  delivered:true,secondHopTxHash:h("d"),secondHopMessageId:h("e"),
  finalProofObservation:{state:"delivery-observed"}};
 const journey={origin:"base",destination:"arbitrum",asset:"XGR",sourceTxHash:record.txHash};
 const html=renderTransferFlow({journey,record,representations:repsXGR});
 assert.match(html,/Where your tokens are/);
 assert.match(html,/Burn wXGR/);
 assert.match(html,/Unlock XGR/);
 assert.match(html,/Lock XGR/);
 assert.match(html,/Mint wXGR/);
 assert.match(html,/Waiting for Arbitrum finality/);
 assert.match(html,/Network verification details/);
 assert.match(html,/<details class="ux-flow-technical">/);
 assert.match(html,/Two hops · six stages/);
 assert.match(html,/data-token-chain="arbitrum"/);
 assert.match(html,/is-observed/);
 const absent=renderTransferFlow({journey,record});
 assert.doesNotMatch(absent,/Where your tokens are/);
 assert.match(absent,/<details class="ux-flow-technical" open>/);
 assert.match(absent,/Two hops · six stages/);
});
