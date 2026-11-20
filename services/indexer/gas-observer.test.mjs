import test from "node:test";
import assert from "node:assert/strict";
import {recordVerifiedGas,observeOnwardGas,observeDeliveryGas,PROCESS_ID_TOPIC} from "./gas-observer.mjs";
import {deployedFixture} from "../../apps/web/deployed-test-fixture.mjs";
const h=x=>"0x"+x.repeat(64);
const config={chainId:8453,rpcUrls:["https://rpc.example.test"]};
const profile={key:"base|first-delivery|collateral|synthetic|mint|test",chain:"base"};
const tx=h("a"),block=h("b");
const rpc=async(_config,method,params)=>{
 if(method==="eth_chainId")return "0x2105";
 if(method==="eth_getBlockByNumber")return {number:"0x64",hash:block};
 if(method==="eth_getTransactionReceipt")return {
  transactionHash:tx,status:"0x1",blockNumber:"0x64",blockHash:block,
  gasUsed:"0x493e0"};
 throw Error("Unexpected RPC method "+method);
};
test("observer consumes canonical receipt gas, never wallet sponsor balances",async()=>{
 const writes=[];
 const pool={query:async q=>{writes.push(q);return {rows:[]}}};
 const good=await recordVerifiedGas({pool,rpc,chain:"base",chainConfig:config,
  txHash:tx,profile,expectedBlock:100,expectedBlockHash:block});
 assert.equal(good,true);
 assert.equal(writes.length,1);
 assert.equal(writes[0].values[5],300000);
 assert.ok(PROCESS_ID_TOPIC.startsWith("0x")&&PROCESS_ID_TOPIC.length===66);
});
test("observer never records unsuccessful or non-finalized receipts",async()=>{
 let writes=0;
 const pool={query:async()=>{writes++}};
 const bad=await recordVerifiedGas({pool,rpc:async(c,m,p)=>{
  if(m==="eth_getTransactionReceipt")return {transactionHash:tx,status:"0x0",
    blockHash:block,blockNumber:"0x64",gasUsed:"0x493e0"};
  return rpc(c,m,p);
 },chain:"base",chainConfig:config,txHash:tx,profile});
 assert.equal(bad,false);
 assert.equal(writes,0);
 const pending=await recordVerifiedGas({pool,rpc:async(c,m,p)=>{
  if(m==="eth_getBlockByNumber"&&p[0]==="safe")return {number:"0x63",hash:h("c")};
  if(m==="eth_getBlockByNumber"&&p[0]==="0x63")return {number:"0x63",hash:h("c")};
  return rpc(c,m,p);
 },chain:"base",chainConfig:config,txHash:tx,profile});
 assert.equal(pending,false);
 assert.equal(writes,0);
});

test("F-35: unprofiled child does not stall the next statistical observation",async()=>{
 const unknown={source_chain:"unconfigured",route_id:h("1"),source_tx_hash:h("2"),
  source_block_number:90,source_block_hash:h("3"),source_indexed_at:new Date().toISOString()};
 const writes=[];
 const pool={query:async q=>{
  const sql=typeof q==="string"?q:q.text;
  if(sql.startsWith("SELECT indexed_at"))return {rows:[]};
  if(sql.includes("FROM xita_transfer_operations"))return {rows:[unknown]};
  writes.push(q);return {rows:[],rowCount:1};
 }};
 const total=await observeOnwardGas({catalog:{chains:{},routes:[]},
  pool,rpc:async()=>{throw Error("unprofiled must not use RPC")}});
 assert.equal(total,0);
 assert.equal(writes.length,1);
 assert.match(writes[0].text,/xita_gas_onward_cursors/);
 assert.deepEqual(writes[0].values,[unknown.source_indexed_at,unknown.source_tx_hash]);
});

function destinationCatalog(){
 const asset=deployedFixture("ABC","xgrchain");
 const infrastructure=Object.fromEntries(["xgrchain","base"].map(chain=>{
  const components=Object.fromEntries(["factory","sourceRegistry","mailbox","ism","validatorRegistry"]
   .map((name,i)=>{const address="0x"+String(i+1).repeat(40);
    return [name,{address,runtimeCodeKeccak256:h("e"),receiptPath:
     "deployments/receipts/"+chain+"/"+("a".repeat(64))+"-"+address.slice(2)+".json"}];}));
  return [chain,{present:true,chainId:chain==="base"?8453:1643,
   xitaV315:{components,receiptPaths:Object.values(components).map(v=>v.receiptPath)}}];
 }));
 return {chains:{xgrchain:{chainId:1643},base:{chainId:8453}},
  infrastructure,assets:{ABC:asset}};
}
test("F-35: unmatched permissionless ProcessId does not pin optional gas cursor",async()=>{
 const catalog=destinationCatalog();
 const mailbox=catalog.infrastructure.base.xitaV315.components.mailbox.address;
 const rpcCalls=[],writes=[];
 const rpc=async(chain,method,params)=>{
  rpcCalls.push({chain:chain.chainId,method,params});
  if(method==="eth_chainId")return "0x"+chain.chainId.toString(16);
  if(method==="eth_getBlockByNumber"){
   const n=params[0]==="safe"?600:Number(BigInt(params[0]));
   return {number:"0x"+n.toString(16),hash:h("b")};
  }
  if(method==="eth_getLogs"){
   if(chain.chainId!==8453)return [];
   return [{address:mailbox,transactionHash:h("a"),blockHash:h("b"),
    blockNumber:"0x78",topics:[PROCESS_ID_TOPIC,h("c")]}];
  }
  throw Error("Unexpected RPC: "+method);
 };
 const pool={query:async q=>{
  const text=q.text||q;
  if(text.includes("FROM xita_gas_observation_cursors"))
   return {rows:q.values[0]==="base"?[{scanned_to:119,scanned_hash:h("b")}]:[]};
  if(text.includes("FROM xita_transfer_operations"))return {rows:[]};
  if(text.includes("INSERT INTO xita_gas_observation_cursors")){writes.push(q);return {rows:[]};}
  throw Error("Unexpected SQL");
 }};
 const measured=await observeDeliveryGas({catalog,pool,rpc,limit:150});
 assert.equal(measured,0);
 assert.ok(writes.some(q=>q.values[0]==="base"&&q.values[2]===120));
 assert.ok(rpcCalls.some(c=>c.chain===8453&&c.method==="eth_getLogs"));
 assert.equal(rpcCalls.filter(c=>c.method==="eth_getTransactionReceipt").length,0);
});
test("optional gas observer does not sample or advance into indexer grace window",async()=>{
 const catalog=destinationCatalog(),calls=[];
 const pool={query:async q=>{
  const text=q.text||q;
  if(text.includes("FROM xita_gas_observation_cursors"))
   return {rows:[{scanned_to:120,scanned_hash:h("b")}]};
  throw Error("No RPC scanning beyond delayed finalized head");
 }};
 const rpc=async(chain,method,params)=>{
  calls.push(method);
  if(method==="eth_chainId")return "0x"+chain.chainId.toString(16);
  if(method==="eth_getBlockByNumber"){
   const n=params[0]==="safe"||params[0]==="latest"?600:Number(BigInt(params[0]));
   return {number:"0x"+n.toString(16),hash:h("b")};
  }
  throw Error("Unexpected RPC");
 };
 assert.equal(await observeDeliveryGas({catalog,pool,rpc}),0);
 assert.ok(!calls.includes("eth_getLogs"));
});
