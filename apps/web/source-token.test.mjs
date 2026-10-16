import test from "node:test";
import assert from "node:assert/strict";
import {selector} from "./keccak.js";
import {verifiedSourceToken} from "./source-token.js";
const address=d=>"0x"+d.repeat(40);
const raw=a=>"0x"+a.slice(2).padStart(64,"0");
const router=address("a"),underlying=address("b"),gateway=address("c"),ZERO=address("0");
function readToken(token,gatewayToken=token){return async (to,data)=>{
 if(to===router&&data===selector("token()"))return raw(token);
 if(to===gateway&&data===selector("warpToken()"))return raw(gatewayToken);
 throw Error("Unexpected on-chain query");
}}
function route(sourceRouterType){return {sourceRouter:router,gateway,sourceRouterType};}
test("collateral source resolves the actual underlying, not escrow Router",async()=>{
 assert.equal(await verifiedSourceToken(route("collateralRouter"),readToken(underlying)),underlying);
});
test("synthetic and native resolve their respective representations",async()=>{
 assert.equal(await verifiedSourceToken(route("syntheticRouter"),readToken(router)),router);
 assert.equal(await verifiedSourceToken(route("nativeRouter"),readToken(ZERO)),null);
});
test("reject mismatched, malformed and implausible token bindings",async()=>{
 await assert.rejects(verifiedSourceToken(route("collateralRouter"),readToken(underlying,router)),/differ/);
 await assert.rejects(verifiedSourceToken(route("collateralRouter"),readToken(router)),/own underlying/);
 await assert.rejects(verifiedSourceToken(route("syntheticRouter"),readToken(underlying)),/not the represented/);
 await assert.rejects(verifiedSourceToken(route("nativeRouter"),readToken(underlying)),/Native/);
 await assert.rejects(verifiedSourceToken(route("collateralRouter"),async()=> "0x1234"),/Malformed/);
});
