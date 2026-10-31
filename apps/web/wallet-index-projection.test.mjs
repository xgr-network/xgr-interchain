import test from "node:test";
import assert from "node:assert/strict";
import {canonicalWalletSnapshot} from "./wallet-index-projection.js";
import {openWalletTransfers} from "./wallet-transfer-selection.js";
const a="0x"+"a".repeat(40),h=s=>"0x"+s.repeat(64);
const parent={account:a,sourceChain:"arbitrum",destinationChain:"xgrchain",
 txHash:h("1"),messageId:h("2"),asset:"XGR",confirmed:true,
 delivered:true,status:"awaiting-final-proof",secondHopTxHash:h("3"),
 secondHopMessageId:h("4"),onwardRouteId:h("5")};
const staleChild={account:a,sourceChain:"xgrchain",destinationChain:"base",
 txHash:h("3"),messageId:h("4"),confirmed:true,delivered:false,
 status:"awaiting-proof",asset:"XGR"};
test("the actual indexed 50-XGR Arbitrum-Base journey replaces stale child history",()=>{
 const snapshot=canonicalWalletSnapshot({account:a,rows:[parent],previous:[parent,staleChild]});
 assert.deepEqual(snapshot,[parent]);
 assert.deepEqual(openWalletTransfers(snapshot,a),[parent]);
});
test("a simultaneous wallet broadcast is transient only until SQL indexes it",()=>{
 const pending={account:a,sourceChain:"base",txHash:h("8"),status:"pending-source",confirmed:false};
 const before=canonicalWalletSnapshot({account:a,rows:[parent],previous:[staleChild,pending],
  activeSourceHash:pending.txHash});
 assert.deepEqual(before,[parent,pending]);
 assert.deepEqual(canonicalWalletSnapshot({account:a,rows:[parent],previous:before}),[parent]);
 const recorded={...pending,confirmed:true,messageId:h("9"),status:"awaiting-proof"};
 assert.deepEqual(canonicalWalletSnapshot({account:a,rows:[parent,recorded],previous:before,
  activeSourceHash:pending.txHash}),[parent,recorded]);
});
test("unknown, foreign and unverified index rows cannot enter canonical history",()=>{
 const bad={...staleChild,account:"0x"+"b".repeat(40)};
 assert.deepEqual(canonicalWalletSnapshot({account:a,rows:[parent,{...staleChild,confirmed:false},bad]}),[parent]);
 assert.deepEqual(canonicalWalletSnapshot({account:null,rows:[parent]}),[]);
});
test("parent already indexed prevents active onward TX becoming a second selectable journey",()=>{
 const result=canonicalWalletSnapshot({account:a,rows:[parent],previous:[staleChild],
  activeSourceHash:staleChild.txHash});
 assert.deepEqual(result,[parent]);
});

test("verified onward receipt survives lagging SQL parent, without creating duplicate child",()=>{
 const full={...parent,asset:"XGR",amountRaw:"500",routeId:h("6"),
  finalDestinationChain:"base",finalRecipient:a};
 const confirmed={...full,status:"awaiting-final-proof",
  secondHopTxHash:h("3"),secondHopMessageId:h("4")};
 const stale={...full,status:"awaiting-onward",secondHopTxHash:undefined,secondHopMessageId:undefined};
 const result=canonicalWalletSnapshot({account:a,rows:[stale],previous:[confirmed]});
 assert.equal(result.length,1);
 assert.equal(result[0].secondHopTxHash,h("3"));
 assert.equal(result[0].status,"awaiting-final-proof");
 const conflicting=canonicalWalletSnapshot({account:a,rows:[{...stale,routeId:h("9")}],previous:[confirmed]});
 assert.equal(conflicting[0].secondHopTxHash,undefined);
});

test("finalized direct BSC delivery stays complete while SQL row lags; unrelated or conflicting rows do not",()=>{
 const direct={account:a,asset:"XGR",sourceChain:"xgrchain",
  destinationChain:"bsc",txHash:h("a"),messageId:h("b"),
  routeId:h("c"),gateway:"0x"+"1".repeat(40),
  confirmed:true,delivered:false,status:"awaiting-proof",
  finalityVerified:true,destinationFinalityHash:h("e")};
 const done={...direct,delivered:true,status:"delivered",
  destinationFinalityBlock:1234};
 const projected=canonicalWalletSnapshot({account:a,rows:[direct],previous:[done]});
 assert.equal(projected.length,1);
 assert.equal(projected[0].status,"delivered");
 assert.equal(projected[0].delivered,true);
 assert.equal(openWalletTransfers(projected,a).length,0);
 const conflict=canonicalWalletSnapshot({account:a,
  rows:[{...direct,destinationFinalityHash:h("f")}],previous:[done]});
 assert.equal(conflict[0].status,"awaiting-proof");
 const otherRoute=canonicalWalletSnapshot({account:a,
  rows:[{...direct,routeId:h("d")}],previous:[done]});
 assert.equal(otherRoute[0].status,"awaiting-proof");
 const notFinalized=canonicalWalletSnapshot({account:a,
  rows:[direct],previous:[{...done,finalityVerified:false}]});
 assert.equal(notFinalized[0].status,"awaiting-proof");
});

test("pending source parent must survive an incomplete, stale or paginated SQL result",()=>{
 const last={...parent,sourceChain:"arbitrum",destinationChain:"xgrchain",
  finalDestinationChain:"bsc",onwardRouteId:h("5"),
  status:"awaiting-onward",delivered:true,confirmed:true};
 const gone=canonicalWalletSnapshot({account:a,rows:[],previous:[last]});
 assert.deepEqual(gone,[last]);
 assert.deepEqual(openWalletTransfers(gone,a),[last]);
 const unrelated={...staleChild,txHash:h("9"),messageId:h("8")};
 const withOther=canonicalWalletSnapshot({account:a,rows:[unrelated],previous:[last]});
 assert.ok(withOther.some(row=>row.txHash===last.txHash));
 assert.ok(openWalletTransfers(withOther,a).some(row=>row.txHash===last.txHash));
 const finished={...last,status:"journey-delivered",finalDelivered:true};
 assert.deepEqual(canonicalWalletSnapshot({account:a,rows:[],previous:[finished]}),[]);
});
test("never invent a pending transfer for a different wallet or unconfirmed operation",()=>{
 const last={...parent,status:"awaiting-onward"};
 const foreign={...last,account:"0x"+"b".repeat(40)};
 const unverified={...last,confirmed:false};
 assert.deepEqual(canonicalWalletSnapshot({account:a,rows:[],previous:[foreign,unverified]}),[]);
});
