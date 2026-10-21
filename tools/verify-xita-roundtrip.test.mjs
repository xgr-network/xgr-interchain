import test from "node:test";import assert from "node:assert/strict";
import {roundtripArguments,classifyRoundtrip,verifyTransfer} from "./verify-xita-roundtrip.mjs";
const h=x=>"0x"+x.repeat(64),a=x=>"0x"+x.repeat(40);
test("read-only roundtrip accepts any documented hub/spoke source pair, not only Base or XGR",()=>{
 const catalog={chains:{xgrchain:{},base:{},arbitrum:{}}};
 assert.equal(roundtripArguments(["xgrchain",h("1"),"arbitrum",h("2")],catalog).length,2);
 assert.equal(roundtripArguments(["arbitrum",h("1"),"xgrchain",h("2")],catalog).length,2);
 assert.throws(()=>roundtripArguments(["polygon",h("1")],catalog),/Invalid/);
 assert.throws(()=>roundtripArguments(["base",h("1"),"base",h("2")],catalog),/Return source/);
 assert.throws(()=>roundtripArguments(["xgrchain","not-a-hash"],catalog),/Invalid/);
});
test("receipt auditor never requires relayer or database state",async()=>{
 const url="https://rpc.example",catalog={chains:{
  xgrchain:{rpcUrls:[url]},base:{rpcUrls:["https://rpc.base.test"]}
 },assets:{XGR:{}}};
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
test("any same-asset roundtrip must confirm both destination deliveries",()=>{
 const forward={asset:"ABC",account:a("a"),sourceConfirmed:true,destinationDelivered:true,
  sourceChain:"xgrchain",destinationChain:"arbitrum"};
 const backward={...forward,sourceChain:"arbitrum",destinationChain:"xgrchain"};
 assert.equal(classifyRoundtrip([forward]),"FORWARD_DELIVERED");
 assert.equal(classifyRoundtrip([forward,backward]),"ROUNDTRIP_DELIVERED");
 assert.equal(classifyRoundtrip([{...forward,destinationDelivered:false},backward]),"SOURCE_LOCK_CONFIRMED_DELIVERY_PENDING");
 assert.equal(classifyRoundtrip([forward,{...backward,destinationDelivered:false}]),"RETURN_DELIVERY_PENDING");
 assert.equal(classifyRoundtrip([forward,{...backward,sourceConfirmed:false}]),"RETURN_SOURCE_PENDING");
 assert.equal(classifyRoundtrip([forward,{...backward,account:a("b")}]),"INVALID");
 assert.equal(classifyRoundtrip([forward,{...backward,asset:"OTHER"}]),"INVALID");
 assert.equal(classifyRoundtrip([forward,{...backward,destinationChain:"base"}]),"INVALID");
 assert.equal(classifyRoundtrip([forward,{...backward,sourceChain:"base"}]),"INVALID");
});
