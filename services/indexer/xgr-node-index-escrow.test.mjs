import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {escrowDescriptor} from "./tvl-verifier.mjs";
import {createNodeIndexedEscrowReader} from "./xgr-node-index-escrow.mjs";

const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url)));
const d=escrowDescriptor(catalog,"ARB");
const hash=x=>"0x"+x.repeat(64);
const word=x=>"0x"+BigInt(x).toString(16).padStart(64,"0");
const snap={
 version:1,asset:"ARB",chain:d.chain,chainId:d.chainConfig.chainId,
 kind:"erc20",router:d.router,token:d.token,
 finalizedHeadBlock:800,latestHeadBlock:812,finalizedHeadHash:hash("b"),
 observedAt:new Date().toISOString(),
 routerCode:"0x60006000",routerToken:"0x"+d.token.slice(2).padStart(64,"0"),
 tokenCode:"0x60006000",tokenDecimals:word(d.decimals),tokenBalance:word(100),
 evidenceStatus:"FINALIZED_ESCROW_READ_MODEL_NOT_BLS_EVIDENCE"
};
test("all foreign TVL reads are served from a single XGR index snapshot",async()=>{
 assert.equal(d.status,"ready");
 assert.equal(d.chain,"arbitrum");
 const methods=[];
 const rpc=async(method,params)=>{
  methods.push(method);
  assert.equal(method,"xgr_getILNIndexedEscrow");
  assert.deepEqual(params,["ARB"]);
  return snap;
 };
 const read=await createNodeIndexedEscrowReader({catalog,rpc});
 assert.equal(await read(d.chainConfig,"eth_chainId",[]),"0xa4b1");
 assert.equal(await read(d.chainConfig,"eth_blockNumber",[]),"0x32c");
 assert.equal(await read(d.chainConfig,"eth_getCode",[d.router,"latest"]),snap.routerCode);
 assert.equal(await read(d.chainConfig,"eth_getCode",[d.token,"latest"]),snap.tokenCode);
 assert.equal(await read(d.chainConfig,"eth_call",[{to:d.router,data:"0xfc0c546a"},"latest"]),snap.routerToken);
 assert.equal(await read(d.chainConfig,"eth_call",[{to:d.token,data:"0x313ce567"},"latest"]),snap.tokenDecimals);
 assert.equal(await read(d.chainConfig,"eth_call",[{to:d.token,data:"0x70a08231"+d.router.slice(2).padStart(64,"0")},"latest"]),snap.tokenBalance);
 await assert.rejects(()=>read(d.chainConfig,"eth_getLogs",[]),/Escrow index address/);
 assert.deepEqual(methods,["xgr_getILNIndexedEscrow"],
  "no foreign RPC can be triggered by escrow reads");
});
test("XGR native collateral uses only XGR RPC, never a foreign chain",async()=>{
 const methods=[];
 const rpc=async(method,params)=>{methods.push({method,params});if(method==="xgr_getILNIndexedEscrow")return snap;return "0x1";};
 const read=await createNodeIndexedEscrowReader({catalog,rpc});
 const xgr=escrowDescriptor(catalog,"XGR");
 assert.equal(xgr.chainConfig.chainId,1643);
 assert.equal(await read(xgr.chainConfig,"eth_getBalance",[xgr.router,"latest"]),"0x1");
 assert.equal(methods.filter(x=>x.method==="eth_getBalance").length,1);
 assert.equal(methods.filter(x=>x.method==="xgr_getILNIndexedEscrow").length,1);
});
test("stale or mismatched Node escrow cannot silently fallback",async()=>{
 await assert.rejects(()=>createNodeIndexedEscrowReader({
  catalog,rpc:async()=>({...snap,observedAt:"2020-01-01T00:00:00Z"})
 }),/incomplete or stale/);
 await assert.rejects(()=>createNodeIndexedEscrowReader({
  catalog,rpc:async()=>({...snap,router:"0x"+("c".repeat(40))})
 }),/incomplete or stale/);
});
