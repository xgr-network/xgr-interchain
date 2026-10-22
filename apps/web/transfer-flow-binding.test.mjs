import test from "node:test";
import assert from "node:assert/strict";
import {transferFlowBinding,isFlowContinuationAuthorized} from "./transfer-flow-binding.js";
const account="0x"+"1".repeat(40),other="0x"+"2".repeat(40);
const a="0x"+"a".repeat(64),b="0x"+"b".repeat(64),child="0x"+"c".repeat(64);
const records=[
 {account,txHash:a,asset:"XGR",sourceChain:"arbitrum",destinationChain:"xgrchain",finalDestinationChain:"base",secondHopTxHash:child,confirmed:true,status:"awaiting-final-proof"},
 {account,txHash:b,asset:"XGR",sourceChain:"xgrchain",destinationChain:"base",confirmed:true,status:"awaiting-proof"}
];
test("hide A, select B: modal and continuation bind ONLY B",()=>{
 const stale={account,sourceTxHash:a,journey:{origin:"arbitrum",destination:"base",asset:"XGR"},stage:"final-proof-wait"};
 const binding=transferFlowBinding({account,selectedTxHash:b,items:records,session:stale});
 assert.equal(binding.sourceTxHash,b);assert.equal(binding.journey.origin,"xgrchain");
 assert.equal(binding.journey.destination,"base");assert.equal(binding.sameSession,false);
 assert.equal(binding.record.txHash,b);
 assert.equal(isFlowContinuationAuthorized({account,selectedTxHash:b,binding}),true);
 assert.equal(isFlowContinuationAuthorized({account,selectedTxHash:a,binding}),false);
});
test("reselect original two-hop parent after another transfer preserves full destination",()=>{
 const stale={account,sourceTxHash:b,journey:{origin:"xgrchain",destination:"base",asset:"XGR"}};
 const binding=transferFlowBinding({account,selectedTxHash:a,items:records,session:stale});
 assert.equal(binding.journey.origin,"arbitrum");
 assert.equal(binding.journey.destination,"base");
 assert.equal(binding.sourceTxHash,a);
 assert.notEqual(binding.sourceTxHash,child);
});
test("new transfer with no selected hash must not inherit hidden old modal",()=>{
 const session={account,sourceTxHash:a,journey:{origin:"arbitrum",destination:"base",asset:"XGR"}};
 assert.equal(transferFlowBinding({account,selectedTxHash:null,items:records,session}),null);
 assert.equal(transferFlowBinding({account,selectedTxHash:child,items:records,session}),null);
 assert.equal(transferFlowBinding({account,selectedTxHash:a,items:[],session:null}),null);
});
test("wallet switch and foreign wallet record never opens previous modal",()=>{
 const session={account,sourceTxHash:a,journey:{origin:"arbitrum",destination:"base",asset:"XGR"}};
 assert.equal(transferFlowBinding({account:other,selectedTxHash:a,items:records,session}),null);
 assert.equal(transferFlowBinding({account:other,selectedTxHash:b,items:records,session}),null);
});
test("broadcast without indexer evidence can reopen only exact wallet/session hash",()=>{
 const session={account,sourceTxHash:a,journey:{origin:"arbitrum",destination:"base",asset:"XGR"}};
 const binding=transferFlowBinding({account,selectedTxHash:a,items:[],session});
 assert.equal(binding.journey.destination,"base");
 assert.equal(binding.record,null);
 assert.equal(isFlowContinuationAuthorized({account,selectedTxHash:a,binding}),false);
});
test("unconfirmed pending source never authorizes continuation",()=>{
 const binding=transferFlowBinding({account,selectedTxHash:b,items:[{...records[1],confirmed:false}]});
 assert.equal(binding.record.confirmed,false);
 assert.equal(isFlowContinuationAuthorized({account,selectedTxHash:b,binding}),false);
});
