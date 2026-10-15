import test from "node:test";
import assert from "node:assert/strict";
import {routeIndexCoverage,indexedTransferRow} from "./transfer-index-store.mjs";
const addr=n=>"0x"+n.repeat(40),hash=n=>"0x"+n.repeat(64);
test("same directional route name across different token projects NEVER shares a cursor",()=>{
 const routes=[
  {sourceChain:"xgrchain",destinationChain:"base",routeName:"xgr_to_base",
   routeId:hash("a"),gateway:addr("1"),deploymentBlock:10},
  {sourceChain:"xgrchain",destinationChain:"base",routeName:"xgr_to_base",
   routeId:hash("b"),gateway:addr("2"),deploymentBlock:20}
 ];
 const when=new Date("2026-10-15T10:00:00Z"),now=when.getTime();
 const cursors=routes.map((r,i)=>({
  source_chain:r.sourceChain,route_name:r.routeName,route_id:r.routeId,
  gateway:r.gateway,deployment_block:r.deploymentBlock,
  scanned_to:50+i,finalized_head:50+i,updated_at:when
 }));
 const verified=routeIndexCoverage({},cursors,{routeList:routes,now});
 assert.equal(verified.complete,true);
 assert.equal(verified.indexedRoutes,2);
 const swapped=[{...cursors[0],route_id:hash("b")},cursors[1]];
 const ambiguous=routeIndexCoverage({},swapped,{routeList:routes,now});
 assert.equal(ambiguous.complete,false);
 assert.equal(ambiguous.indexedRoutes,1);
});
test("unknown target delivered state remains UNKNOWN and never invents successful mint",()=>{
 const base={account:addr("a"),asset:"XGR",source_chain:"xgrchain",
  destination_chain:"base",route_name:"xgr_to_base",route_id:hash("f"),
  gateway:addr("1"),source_tx_hash:hash("c"),message_id:hash("d"),
  source_block_number:50,amount_raw:"100",validator_fee_wei:"1"};
 assert.equal(indexedTransferRow({...base,delivered:null}).status,"delivery-unknown");
 assert.equal(indexedTransferRow({...base,delivered:false}).status,"awaiting-proof");
 assert.equal(indexedTransferRow({...base,delivered:true}).status,"delivered");
});
