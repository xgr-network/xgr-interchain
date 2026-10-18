import test from "node:test";
import assert from "node:assert/strict";
import {verifyGrossEscrowFlows24h,ESCROW_FLOW_WINDOW_MS} from "./escrow-flow-24h.mjs";
import {keccak256} from "../../apps/web/keccak.js";
const addr=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64),hex=x=>"0x"+BigInt(x).toString(16);
const now=Date.parse("2026-10-18T14:00:00Z");
const route={asset:"ABC",source:"xgrchain",destination:"base",routeId:hash("1"),gateway:addr("1")};
const reverse={...route,source:"base",destination:"xgrchain",routeId:hash("2"),gateway:addr("2"),destinationMailbox:addr("3")};
const descriptor={status:"ready",asset:"ABC",assetId:hash("a"),chain:"xgrchain",
 chainConfig:{chainId:1643,confirmations:1},decimals:6,escrowRoutes:[route,reverse]};
const inflow={asset:"ABC",asset_id:hash("a"),source_chain:"xgrchain",destination_chain:"base",route_id:hash("1"),
 gateway:addr("1"),message_id:hash("c"),source_block_hash:hash("d"),source_block_number:"100",
 amount_raw:"2000000",delivered:false};
const outflow={...inflow,source_chain:"base",destination_chain:"xgrchain",route_id:hash("2"),
 gateway:addr("2"),message_id:hash("e"),source_block_hash:hash("f"),destination_mailbox:addr("3"),
 amount_raw:"1000000",delivered:true};
const processTopic=keccak256("ProcessId(bytes32)");
const price={priceUsd:3,asOf:new Date(now).toISOString(),source:"coingecko"};
const get=(status="delivered")=>async (_chain,method,args)=>{
 if(method==="eth_blockNumber")return hex(1000);
 if(method==="eth_getBlockByNumber"){
  const n=Number(BigInt(args[0]));
  return {number:hex(n),hash:n===100?hash("d"):n===900?hash("9"):hash("f"),
   timestamp:hex(Math.floor((now-(n<900?ESCROW_FLOW_WINDOW_MS+1000:1000))/1000))};
 }
 if(method==="eth_getLogs"){
  return status==="delivered"?[{address:addr("3"),topics:[processTopic,hash("e")],blockNumber:hex(900),blockHash:hash("9"),removed:false}]:[];
 }
 if(method==="eth_call")return hex(status==="delivered"?1:0);
 throw Error("unexpected RPC "+method);
};
test("24h: lock inflow and delivered unlock outflow are summed gross, not net",async()=>{
 const r=await verifyGrossEscrowFlows24h({descriptor,operations:[inflow,outflow],read:get(),price,now});
 assert.equal(r.status,"verified");assert.equal(r.grossRaw,"1000000");
 assert.equal(r.inflowRaw,"0");assert.equal(r.outflowRaw,"1000000");
 assert.equal(r.movedUsd,3);assert.equal(r.kind,"escrow-gross-24h");
});
test("24h: burn without final delivery is not an escrow outflow",async()=>{
 const r=await verifyGrossEscrowFlows24h({descriptor,operations:[{...outflow,delivered:false}],
  read:get("pending"),price,now});
 assert.equal(r.status,"verified");assert.equal(r.grossRaw,"0");
});
test("24h: source events outside rolling interval are excluded and identity conflicts fail",async()=>{
 const r=await verifyGrossEscrowFlows24h({descriptor,operations:[inflow],read:get(),price,now});
 assert.equal(r.status,"verified");assert.equal(r.grossRaw,"0");
 const duplicate=await verifyGrossEscrowFlows24h({descriptor,operations:[inflow,inflow],read:get(),price,now});
 assert.equal(duplicate.status,"unavailable");
});
