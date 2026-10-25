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
