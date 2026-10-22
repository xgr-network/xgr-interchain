import test from "node:test";
import assert from "node:assert/strict";
import {checkedRoute} from "./verify-iln-route-catalog.mjs";
const registry="0x"+"1".repeat(40),gateway="0x"+"2".repeat(40),srcRouter="0x"+"3".repeat(40),dstRouter="0x"+"4".repeat(40),mailbox="0x"+"5".repeat(40),hook="0x"+"6".repeat(40),hash="0x"+"a".repeat(64);
const catalog={chains:{arbitrum:{chainId:42161,domainId:42161},
 xgrchain:{chainId:1643,domainId:1643}},
 infrastructure:{arbitrum:{xitaV315:{components:{sourceRegistry:{address:registry}}}}}};
const route={routeId:hash,gateway,sourceRouter:srcRouter,destinationRouter:dstRouter,destination:"xgrchain"};
const registryReceipt={transactionHash:hash,status:1,blockNumber:516837395};
const routeReceipt={transactionHash:hash,status:1,blockNumber:516982408};
const event={destinationDomain:1643,routeId:hash,gateway,sourceRouter:srcRouter,destinationRouter:dstRouter};
const onchain={registryBlock:516837395,registryCode:"0x6000",head:517200480,
 record:{sourceChainId:42161n,sourceDomain:42161n,gateway,sourceRouter:srcRouter,
 destinationRouter:dstRouter,mailbox,merkleTreeHook:hook,fee:1000000000000n,enabled:true}};
const verify=(overrides={})=>checkedRoute({catalog,source:"arbitrum",route,registryReceipt,routeReceipt,
 chainID:42161,event,onchain,...overrides});
test("Arbitrum L2 route is independently verified at the documented deployment without trusting L1 block.number",()=>{
 const r=verify();
 assert.equal(r.sourceNetwork,"arbitrum");assert.equal(r.destinationDomain,1643);
 assert.equal(r.routeId,hash);
});
test("reject mismatched source route, unconfirmed factory receipt and missing code",()=>{
 assert.throws(()=>verify({chainID:8453}),/verification failed/);
 assert.throws(()=>verify({event:{...event,gateway:registry}}),/identity or fee mismatch/);
 assert.throws(()=>verify({onchain:{...onchain,registryCode:"0x"}}),/verification failed/);
 assert.throws(()=>verify({routeReceipt:{...routeReceipt,status:0}}),/verification failed/);
 assert.throws(()=>verify({onchain:{...onchain,record:{...onchain.record,enabled:false}}}),/verification failed/);
});
