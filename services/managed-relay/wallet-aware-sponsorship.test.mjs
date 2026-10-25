import test from "node:test";
import assert from "node:assert/strict";
import {walletAwareSponsorship} from "./wallet-aware-sponsorship.mjs";
const stages=[
 {chain:"xgrchain",kind:"first-delivery",gasUnits:"100",gasPriceWei:"10"},
 {chain:"xgrchain",kind:"hub-onward",gasUnits:"200",gasPriceWei:"10"},
 {chain:"xgrchain",kind:"onward-protocol-fee",nativeFeeWei:"1000"},
 {chain:"arbitrum",kind:"final-delivery",gasUnits:"100",gasPriceWei:"10"}
];
test("gas shortfall uses existing native wallet gas exactly once on shared chain",()=>{
 const r=walletAwareSponsorship({stages,balances:{xgrchain:"1500",arbitrum:"500"},enabled:true});
 assert.deepEqual(r.stages.map(x=>x.shortfallWei),["0","2400","1000","800"]);
 assert.deepEqual(r.grants.map(x=>x.stage),["hub-onward","onward-protocol-fee","final-delivery"]);
});
test("sufficient wallets need no grants, deficient wallets get deterministic shortfalls",()=>{
 const a=walletAwareSponsorship({stages,balances:{xgrchain:"5000",arbitrum:"1500"},enabled:true});
 assert.deepEqual(a.grants,[]);
 const b=walletAwareSponsorship({stages,balances:{xgrchain:"0",arbitrum:"0"},enabled:true});
 assert.equal(b.grants.reduce((s,x)=>s+BigInt(x.amountWei),0n),6200n);
});
test("missing wallet chain balance never invents free sponsorship",()=>{
 assert.throws(()=>walletAwareSponsorship({stages,balances:{xgrchain:"1"},enabled:true}),/Wallet balance missing/);
 assert.throws(()=>walletAwareSponsorship({stages:[{chain:"arbitrum",kind:"final-delivery",gasUnits:"100",gasPriceWei:"1"}],balances:{arbitrum:"-1"},enabled:true}),/Wallet balance missing/);
});
