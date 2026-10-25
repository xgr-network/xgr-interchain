import test from "node:test";
import assert from "node:assert/strict";
import {walletAwareSponsorship} from "./wallet-aware-sponsorship.mjs";
const stage=(chain,kind,units,price,fee="0")=>({
 chain,kind,gasUnits:String(units),gasPriceWei:String(price),nativeFeeWei:String(fee)});
const stages=[
 stage("xgrchain","first-delivery",100000,10),
 stage("xgrchain","hub-onward",200000,10,1000),
 stage("arbitrum","final-delivery",100000,10)
];
test("wallet's XGR balance is counted once across first delivery and hub onward",()=>{
 const r=walletAwareSponsorship({stages,balances:{xgrchain:"1500000",arbitrum:"500000"}});
 assert.deepEqual(r.stages.map(x=>x.shortfallWei),["0","2401000","800000"]);
 assert.deepEqual(r.grants.map(x=>x.stage),["hub-onward","final-delivery"]);
 assert.equal(r.stages[1].protocolWei,"1000");
});
test("fully funded wallet pays own downstream gas and gets no grants",()=>{
 const a=walletAwareSponsorship({stages,balances:{xgrchain:"5000000",arbitrum:"1500000"}});
 assert.deepEqual(a.grants,[]);
 const b=walletAwareSponsorship({stages,balances:{xgrchain:"0",arbitrum:"0"}});
 assert.equal(b.grants.reduce((sum,x)=>sum+BigInt(x.amountWei),0n),5201000n);
});
test("fail closed on missing, negative or user-ambiguous RPC balance",()=>{
 assert.throws(()=>walletAwareSponsorship({stages,balances:{xgrchain:"1"}}),/balance missing/);
 assert.throws(()=>walletAwareSponsorship({stages,balances:{xgrchain:"-1",arbitrum:"0"}}),/balance missing/);
 assert.throws(()=>walletAwareSponsorship({stages:[stages[0],stages[0]],balances:{xgrchain:"0"}}),/duplicate/);
});
test("gas principal is excluded and 30-percent gas margin is not applied to protocol fee",()=>{
 const r=walletAwareSponsorship({stages:[stage("xgrchain","hub-onward",21000,10,1000)],
  balances:{xgrchain:"0"}});
 assert.equal(r.grants[0].amountWei,"274000");
});
