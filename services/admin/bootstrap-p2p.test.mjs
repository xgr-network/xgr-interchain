import test from "node:test";
import assert from "node:assert/strict";
import {collectLocalBootstrapProofs} from "./bootstrap-p2p.mjs";

const domain=42161,origin=1643,chain={name:"arbitrum",chainId:42161,domainId:domain};
const validators=[1,2,3].map(x=>"0x"+x.toString(16).padStart(40,"0"));
const proof=(validator)=>({validator,originChainId:origin,destinationDomain:domain,
 blsPublicKey:"0x"+"1".repeat(96),blsPublicKeyEIP2537:"0x"+"2".repeat(256),
 payload:"0x1234",possessionProof:"0x5678"});
const all=validators.map(proof);
const respond=(result,status=200)=>({
 ok:status===200,status,headers:{get:()=>null},
 text:async()=>JSON.stringify({jsonrpc:"2.0",id:1,result})
});
const makeFetcher=(result,observed)=>async(url,opts)=>{
 observed?.push({url,opts});
 return respond(result);
};

test("read-only XGR validator-1 RPC returns approved ordered public proofs",async()=>{
 const calls=[];
 const result=await collectLocalBootstrapProofs({
  chain,expectedValidators:validators,
  fetcher:makeFetcher({originChainId:origin,destinationDomain:domain,
   proofs:[all[2],all[0],all[1]]},calls)
 });
 assert.deepEqual(result.map(p=>p.validator),validators);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,"http://127.0.0.1:8545");
 assert.deepEqual(JSON.parse(calls[0].opts.body),{
  jsonrpc:"2.0",id:1,method:"xgr_getILNBootstrapProofs",params:[42161]
 });
 assert.equal(calls[0].opts.method,"POST");
});
test("missing or duplicated P2P bootstrap proofs fail closed",async()=>{
 const opts={chain,expectedValidators:validators};
 await assert.rejects(()=>collectLocalBootstrapProofs({...opts,
  fetcher:makeFetcher({originChainId:origin,destinationDomain:domain,
   proofs:[all[0],all[1]]})}),/2\/3/);
 await assert.rejects(()=>collectLocalBootstrapProofs({...opts,
  fetcher:makeFetcher({originChainId:origin,destinationDomain:domain,
   proofs:[all[0],all[1],all[1],all[2]]})}),/Duplicate/);
 await assert.rejects(()=>collectLocalBootstrapProofs({...opts,
  fetcher:makeFetcher({originChainId:origin,destinationDomain:8453,
   proofs:all})}),/wrong|identity/i);
 await assert.rejects(()=>collectLocalBootstrapProofs({...opts,
  fetcher:makeFetcher({originChainId:origin,destinationDomain:domain,
   proofs:[all[0],{...all[1],destinationDomain:8453},all[2]]})}),/wrong origin/);
});
test("no nonloopback RPC, arbitrary chain or request can supply validator secrets",async()=>{
 await assert.rejects(()=>collectLocalBootstrapProofs({
  chain,expectedValidators:validators,rpcUrl:"https://arbitrum-one-rpc.publicnode.com"
 }),/loopback/);
 await assert.rejects(()=>collectLocalBootstrapProofs({
  chain:{...chain,domainId:0},expectedValidators:validators
 }),/identity/);
 await assert.rejects(()=>collectLocalBootstrapProofs({
  chain,expectedValidators:validators,originChainId:8453
 }),/identity/);
 await assert.rejects(()=>collectLocalBootstrapProofs({
  chain,expectedValidators:validators,fetcher:async()=>respond({},503)
 }),/HTTP 503/);
});
