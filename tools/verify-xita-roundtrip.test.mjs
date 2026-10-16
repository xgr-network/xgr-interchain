import test from "node:test";import assert from "node:assert/strict";
import {roundtripArguments,classifyRoundtrip,verifyTransfer} from "./verify-xita-roundtrip.mjs";
const h=x=>"0x"+x.repeat(64),a=x=>"0x"+x.repeat(40);
test("XGR/Base roundtrip must be ordered and use transaction hashes",()=>{
 assert.equal(roundtripArguments(["xgrchain",h("1"),"base",h("2")]).length,2);
 assert.throws(()=>roundtripArguments(["base",h("1"),"xgrchain",h("2")]),/Expected/);
 assert.throws(()=>roundtripArguments(["xgrchain","not-a-hash"]),/Invalid/);
});
test("receipt auditor never requires relayer or database state",async()=>{
 const url="https://rpc.example",catalog={chains:{xgrchain:{rpcUrls:[url]}}};
 const out=await verifyTransfer({catalog,sourceChain:"xgrchain",txHash:h("1"),
  rpc:async(_,method)=>method==="eth_getTransactionByHash"?{from:a("a")}:null,
  evidenceLookup:async()=>({sourceChain:"xgrchain",txHash:h("1"),
   account:a("a"),destinationChain:"base",routeName:"xgr_to_base",asset:"XGR",
   confirmed:true,delivered:null,status:"delivery-unknown",messageId:h("b"),routeId:h("c")}),
  routeLookup:()=>[{sourceChain:"xgrchain",destinationChain:"base",
   routeName:"xgr_to_base",routeId:h("c")}],
  deliveryLookup:async()=>({delivered:null})});
 assert.equal(out.sourceConfirmed,true);
 assert.equal(out.destinationDelivered,false);
 assert.equal(out.destinationUnknown,true);
});
test("both destinations must be delivered before roundtrip is considered complete",()=>{
 const forward={asset:"XGR",account:a("a"),sourceConfirmed:true,destinationDelivered:true,destinationChain:"base"};
 const backward={...forward,destinationChain:"xgrchain"};
 assert.equal(classifyRoundtrip([forward]),"FORWARD_DELIVERED");
 assert.equal(classifyRoundtrip([forward,backward]),"ROUNDTRIP_DELIVERED");
 assert.equal(classifyRoundtrip([{...forward,destinationDelivered:false},backward]),"SOURCE_LOCK_CONFIRMED_DELIVERY_PENDING");
 assert.equal(classifyRoundtrip([forward,{...backward,destinationDelivered:false}]),"RETURN_DELIVERY_PENDING");
 assert.equal(classifyRoundtrip([forward,{...backward,sourceConfirmed:false}]),"RETURN_SOURCE_PENDING");
 assert.equal(classifyRoundtrip([forward,{...backward,account:a("b")}]),"INVALID");
});
