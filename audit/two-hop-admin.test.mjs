import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryRouteDraft} from '../services/admin/route-factory-draft.mjs';
const addr=n=>'0x'+n.toString(16).padStart(40,'0');
const hub={name:'xgrchain',chainId:1643,domainId:1643};
const base={name:'base',chainId:8453,domainId:8453};
const origin={name:'xdc',chainId:50,domainId:50};
const inf=c=>({name:c.name,chainId:c.chainId,components:[{key:'factory',address:addr(1)},{key:'sourceRegistry',address:addr(2)}]});
test('second hop must retain origin chain even when original is on neither current endpoint',()=>{
 const asset={asset:'AUD',assetId:'0x'+'a'.repeat(64),canonicalChain:'xdc',canonicalToken:addr(10),metadata:{name:'Audit',symbol:'AUD',decimals:18}};
 assert.doesNotThrow(()=>factoryRouteDraft({asset,source:base,destination:hub,sourceInfrastructure:inf(base),destinationInfrastructure:inf(hub),representation:{chain:'base',component:'syntheticRouter',router:null},action:'deploy-router',chains:[origin,hub,base]}));
});
