import test from "node:test";
import assert from "node:assert/strict";
import {keccak256} from "./keccak.js";
import {configuredNativeXGRClaimRouter,readNativeXGRClaim,submitNativeXGRClaim,NATIVE_CLAIM_SELECTOR,NATIVE_WITHDRAW_SELECTOR} from "./native-xgr-claim.js";
const account="0x"+"a".repeat(40),router="0x"+"1".repeat(40);
const hash="0x"+"b".repeat(64),code="0x6001600055";
const catalog={chains:{xgrchain:{chainId:1643,rpcUrls:["https://rpc.xgr.network"]}},
 assets:{XGR:{deployment:{present:true,representations:[{chain:"xgrchain",
 component:"nativeRouter",address:router,runtimeCodeKeccak256:
 keccak256(Uint8Array.from([0x60,0x01,0x60,0x00,0x55])),
 receiptPath:"deployments/receipts/xgrchain/"+"e".repeat(64)+"-"+"1".repeat(40)+".json"}]}}}};
function reader(amount="5"){
 const calls=[];
 const read=async(url,method,args)=>{
  calls.push({url,method,args});
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_getCode")return code;
  if(method==="eth_call")return "0x"+BigInt(amount).toString(16).padStart(64,"0");
  throw Error("Unexpected RPC");
 };
 return {read,calls};
}
test("F-09: beneficiary claim is only exposed after exact catalog runtime verification",async()=>{
 const {read,calls}=reader();
 const c=await readNativeXGRClaim({catalog,account,read});
 assert.equal(c.status,"pending");assert.equal(c.amountWei,"5");
 assert.equal(c.router,router);
 assert.equal(calls.at(-1).args[0].data,NATIVE_CLAIM_SELECTOR+account.slice(2).padStart(64,"0"));
 assert.equal((await readNativeXGRClaim({catalog,account,read:reader("0").read})).status,"none");
 await assert.rejects(()=>readNativeXGRClaim({catalog:{...catalog,assets:{XGR:{deployment:{present:false}}}},account,read}),/router unavailable/);
 await assert.rejects(()=>readNativeXGRClaim({catalog,account,read:async(url,method,args)=>method==="eth_getCode"?"0x6002":read(url,method,args)}),/runtime is not verified/);
 const wrong=reader().read;
 await assert.rejects(()=>readNativeXGRClaim({catalog,account,read:(url,m,p)=>m==="eth_chainId"?"0x1":wrong(url,m,p)}),/chain mismatch/);
});
test("F-09: claim requires beneficiary authorization, exact XGRChain and explicit signing",async()=>{
 const {read}=reader(),calls=[];
 const wallet={request:async({method,params})=>{
  calls.push({method,params});
  if(method==="eth_accounts")return [account];
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_sendTransaction")return hash;
  throw Error("Unexpected wallet action");
 }};
 const tx=await submitNativeXGRClaim({catalog,account,wallet,read});
 assert.equal(tx.txHash,hash);assert.equal(tx.status,"submitted");
 const sent=calls.find(c=>c.method==="eth_sendTransaction").params[0];
 assert.equal(sent.from,account);assert.equal(sent.to,router);assert.equal(sent.value,"0x0");
 assert.equal(sent.data,NATIVE_WITHDRAW_SELECTOR+account.slice(2).padStart(64,"0"));
 const hostile={request:async({method})=>method==="eth_accounts"?["0x"+"f".repeat(40)]:"0x66b"};
 await assert.rejects(()=>submitNativeXGRClaim({catalog,account,wallet:hostile,read}),/beneficiary wallet/);
 await assert.rejects(()=>submitNativeXGRClaim({catalog,account,wallet,read:reader("0").read}),/No verified native/);
 assert.equal(calls.filter(c=>c.method==="eth_sendTransaction").length,1);
});
