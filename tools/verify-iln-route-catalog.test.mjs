import test from "node:test";
import assert from "node:assert/strict";
import {checkedRoute} from "./verify-iln-route-catalog.mjs";
const registry="0x"+"1".repeat(40),gateway="0x"+"2".repeat(40),srcRouter="0x"+"3".repeat(40),dstRouter="0x"+"4".repeat(40),mailbox="0x"+"5".repeat(40),hook="0x"+"6".repeat(40),hash="0x"+"a".repeat(64);
const catalog={chains:{arbitrum:{chainId:42161,domainId:42161,confirmations:64},
 xgrchain:{chainId:1643,domainId:1643}},
 infrastructure:{arbitrum:{xitaV315:{components:{sourceRegistry:{address:registry,runtimeCodeKeccak256:hash}}}}}};
catalog.assets={XGR:{deployment:{routeDeployments:[{routeName:"arbitrum_to_xgr",routeId:hash,sourceChain:"arbitrum",destinationChain:"xgrchain",components:{gateway:{address:gateway,runtimeCodeKeccak256:hash}}}]}}};
const route={asset:"XGR",name:"arbitrum_to_xgr",routeId:hash,gateway,sourceRouter:srcRouter,destinationRouter:dstRouter,destination:"xgrchain"};
const registryReceipt={transactionHash:hash,status:"onchain-deployment-verified",component:"sourceRegistry",chain:"arbitrum",chainId:42161,address:registry,runtimeCodeKeccak256:hash,blockNumber:516837395};
const routeReceipt={transactionHash:hash,status:"onchain-deployment-verified",component:"gateway",chain:"arbitrum",chainId:42161,address:gateway,runtimeCodeKeccak256:hash,provenance:{routeId:hash},blockNumber:516982408};
const event={destinationDomain:1643,routeId:hash,gateway,sourceRouter:srcRouter,destinationRouter:dstRouter};
const onchain={registryCodeHash:hash,gatewayCodeHash:hash,head:517200480,
 record:{sourceChainId:42161n,sourceDomain:42161n,gateway,sourceRouter:srcRouter,
 destinationRouter:dstRouter,mailbox,dispatchHook:hook,fee:1000000000000n,enabled:true}};
const verify=(overrides={})=>checkedRoute({catalog,source:"arbitrum",route,registryReceipt,routeReceipt,
 chainID:42161,onchain,...overrides});
test("Arbitrum L2 route is independently verified at the documented deployment without trusting L1 block.number",()=>{
 const r=verify();
 assert.equal(r.sourceNetwork,"arbitrum");assert.equal(r.destinationDomain,1643);
 assert.equal(r.routeId,hash);
});
test("reject mismatched source route, unconfirmed factory receipt and missing code",()=>{
 assert.throws(()=>verify({chainID:8453}),/verification failed/);
 assert.throws(()=>verify({onchain:{...onchain,record:{...onchain.record,gateway:registry}}}),/Gateway mismatch/);
 assert.throws(()=>verify({onchain:{...onchain,registryCodeHash:"0x"}}),/verification failed/);
 assert.throws(()=>verify({routeReceipt:{...routeReceipt,status:"failed"}}),/verification failed/);
 assert.throws(()=>verify({onchain:{...onchain,record:{...onchain.record,enabled:false}}}),/verification failed/);
});
