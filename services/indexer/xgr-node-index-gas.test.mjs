import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {transferGasProfile} from "../../apps/web/transfer-gas-profile.js";
import {indexedGasProfile,checkIndexedGas,tickNodeIndexedGas}
 from "./xgr-node-index-gas.mjs";
const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url)));
const id="0x"+"a".repeat(64),tx="0x"+"b".repeat(64),blockHash="0x"+"c".repeat(64);
const route=deployedRoutes(catalog).find(r=>transferGasProfile(catalog,r,"first-delivery"));
assert.ok(route,"fixture must have a deployed, receipt-backed gas profile");
const mailbox=catalog.infrastructure[route.destination].xitaV315.components.mailbox.address;
const row={source_chain:route.source,destination_chain:route.destination,
 route_id:route.routeId,destination_mailbox:mailbox,
 message_id:id,destination_checked_block:10000,parent_message_id:null};
const evidence={
 version:1,evidenceStatus:"FINALIZED_GAS_READ_MODEL_NOT_BLS_EVIDENCE",
 destinationChainId:catalog.chains[route.destination].chainId,
 mailbox,messageId:id,transactionHash:tx,blockHash,
 blockNumber:9999,gasUsed:95000
};
test("gas statistics accept only exact message, Mailbox and finalized destination",()=>{
 const profile=indexedGasProfile(catalog,row);
 assert.ok(profile?.key);
 const sample=checkIndexedGas({catalog,row,profile,evidence});
 assert.equal(sample.gas,95000);
 assert.equal(sample.profile,profile.key);
 assert.throws(()=>checkIndexedGas({catalog,row,profile,evidence:{...evidence,
  mailbox:"0x"+"f".repeat(40)}}),/mismatched/);
 assert.throws(()=>checkIndexedGas({catalog,row,profile,evidence:{...evidence,
  blockNumber:10001}}),/mismatched/);
 assert.throws(()=>checkIndexedGas({catalog,row,profile,evidence:{...evidence,
  evidenceStatus:"BLS_PROOF"}}),/mismatched/);
});
test("Node indexed gas writer never reads foreign chains or changes delivery",async()=>{
 const queries=[],rpcCalls=[];
 const pool={query:async query=>{
  const sql=typeof query==="string"?query:query.text;
  queries.push(sql);
  if(sql.includes("FROM xita_node_gas_jobs j"))return {rows:[row]};
  return {rows:[],rowCount:1};
 }};
 const rpc=async(method,args)=>{
  rpcCalls.push({method,args});
  assert.equal(method,"xgr_getILNIndexedGas");
  return evidence;
 };
 const result=await tickNodeIndexedGas({catalog,pool,rpc,limit:4});
 assert.equal(result.recorded,1);
 assert.equal(result.unknown,0);
 assert.deepEqual(rpcCalls.map(x=>x.method),["xgr_getILNIndexedGas"]);
 assert.ok(queries.some(q=>q.includes("xita_record_gas_observation")));
 assert.ok(queries.every(q=>!q.includes("UPDATE xita_transfer_operations")));
});
test("missing gas remains optional and is retried without creating a delivery",async()=>{
 const queries=[];
 const pool={query:async q=>{
  const sql=typeof q==="string"?q:q.text;queries.push(sql);
  if(sql.includes("FROM xita_node_gas_jobs j"))return {rows:[row]};
  return {rows:[]};
 }};
 const result=await tickNodeIndexedGas({catalog,pool,
  rpc:async()=>{throw Error("not indexed yet")},limit:1});
 assert.equal(result.recorded,0);
 assert.equal(result.unknown,1);
 assert.ok(queries.some(q=>q.includes("next_attempt_at")));
 assert.ok(queries.every(q=>!q.includes("UPDATE xita_transfer_operations")));
});
