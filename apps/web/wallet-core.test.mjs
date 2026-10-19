import test from "node:test";
import assert from "node:assert/strict";
import {authorizedWalletAccount,connectWallet} from "./wallet-core.js";

const original="0x"+"a".repeat(40),other="0x"+"b".repeat(40);

test("reloading a previously authorized wallet is silent and account-scoped",async()=>{
 const calls=[],provider={request:async({method})=>{
  calls.push(method);
  if(method==="eth_accounts")return [original];
  throw Error("Unexpected wallet permission or signing request: "+method);
 }};
 assert.equal(await authorizedWalletAccount(provider),original);
 assert.deepEqual(calls,["eth_accounts"]);
});

test("no wallet authorization is not a transfer or a permission request",async()=>{
 const calls=[],provider={request:async({method})=>{
  calls.push(method);return method==="eth_accounts"?[]:[other];
 }};
 assert.equal(await authorizedWalletAccount(provider),null);
 assert.deepEqual(calls,["eth_accounts"]);
 assert.equal(await authorizedWalletAccount(null),null);
});

test("invalid account and provider failures never produce wallet ownership",async()=>{
 const provider={request:async({method})=>{
  if(method==="eth_accounts")return ["0x"+"0".repeat(40),"invalid"];
  throw Error("Unexpected call");
 }};
 assert.equal(await authorizedWalletAccount(provider),null);
 await assert.rejects(()=>authorizedWalletAccount({request:async()=>{throw Error("wallet locked")}}),
  /wallet locked/);
});

test("explicit Connect Wallet still requires the user's permission dialog",async()=>{
 const calls=[],provider={request:async({method})=>{
  calls.push(method);
  return method==="eth_requestAccounts"?[original]:[];
 }};
 assert.equal(await connectWallet(provider),original);
 assert.deepEqual(calls,["eth_requestAccounts"]);
});
