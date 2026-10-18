import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {deployedRoutes} from "./route-availability.js";
import {verifiedSyntheticContract,walletRepresentationBalance,tokenExplorerUrl} from "./token-inventory.js";

const account="0x"+"a".repeat(40);
const token="0x"+"b".repeat(40);
const other="0x"+"c".repeat(40);
const rep={chain:"base",representation:"synthetic",symbol:"wXGR"};
const nat={chain:"xgrchain",representation:"native",symbol:"XGR"};

test("only documented synthetic routers become wallet-copyable token contracts",()=>{
 const routes=[{asset:"XGR",source:"xgrchain",sourceToken:null,destination:"base",destinationRouter:token},
  {asset:"XGR",source:"base",sourceToken:token,destination:"xgrchain",destinationRouter:other}];
 assert.equal(verifiedSyntheticContract(routes,"XGR",rep),token);
 assert.equal(verifiedSyntheticContract(routes,"XGR",nat),null);
 assert.equal(verifiedSyntheticContract(routes,"XGR",{...rep,representation:"collateral"}),null);
 assert.equal(verifiedSyntheticContract(routes,"XYZ",rep),null);
 assert.equal(verifiedSyntheticContract([], "XGR", rep),null);
 assert.equal(verifiedSyntheticContract([...routes,{asset:"XGR",source:"base",sourceToken:other}],"XGR",rep),null);
 assert.equal(verifiedSyntheticContract([{asset:"XGR",source:"base",sourceToken:"not-an-address"}],"XGR",rep),null);
});

test("published XGR Base synthetic address is grounded in verified route deployments",()=>{
 const catalog=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const routes=deployedRoutes(catalog);
 const base=catalog.assets.XGR.metadata.representations.find(r=>r.chain==="base");
 assert.equal(base.representation,"synthetic");
 assert.equal(verifiedSyntheticContract(routes,"XGR",base),
  "0x2ca97eff807744f81f13c59a75a8eb0add1c715d");
 const reversed={...structuredClone(catalog)};
 reversed.assets.XGR.metadata.representations[1].assetAddress=other; // unverified metadata
 assert.equal(verifiedSyntheticContract(deployedRoutes(reversed),"XGR",base),
  "0x2ca97eff807744f81f13c59a75a8eb0add1c715d");
 reversed.infrastructure.base.present=false;
 assert.equal(verifiedSyntheticContract(deployedRoutes(reversed),"XGR",base),null);
});

test("wallet balances are read-only, represent zero honestly and never invent missing RPC data",()=>{
 const state={account,balances:{xgrchain:{status:"ready",balanceWei:"2400000000000000000"}},
  tokenBalances:{"XGR:base":{status:"ready",balanceRaw:"500000000000000000",decimals:18}}};
 assert.deepEqual(walletRepresentationBalance(state,"XGR",nat),{status:"ready",label:"2.4 XGR"});
 assert.deepEqual(walletRepresentationBalance(state,"XGR",rep),{status:"ready",label:"0.5 wXGR"});
 assert.equal(walletRepresentationBalance({...state,account:null},"XGR",rep),null);
 assert.equal(walletRepresentationBalance({...state,loading:true},"XGR",rep).status,"loading");
 assert.equal(walletRepresentationBalance({...state,tokenBalances:{"XGR:base":{status:"ready",balanceRaw:"0"}}},"XGR",rep).label,"0 wXGR");
 assert.match(walletRepresentationBalance({...state,tokenBalances:{}},"XGR",rep).label,/unavailable/);
 assert.match(walletRepresentationBalance({...state,tokenBalances:{"XGR:base":{status:"ready",balanceRaw:"bogus"}}},"XGR",rep).label,/unavailable/);
 assert.equal(walletRepresentationBalance({...state,tokenBalances:{"XGR:base":{status:"ready",balanceRaw:"1"}}},"XGR",rep).label,"< 0.00000001 wXGR");
});

test("explorer links have vetted chain origins and validated contract address",()=>{
 assert.equal(tokenExplorerUrl("base",token),"https://basescan.org/token/"+token);
 assert.equal(tokenExplorerUrl("invalid",token),null);
 assert.equal(tokenExplorerUrl("base","javascript:alert(1)"),null);
});
