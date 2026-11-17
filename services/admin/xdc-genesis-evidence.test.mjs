import {test} from "node:test";
import assert from "node:assert/strict";
import {computeXGRSetCommitment} from "./xdc-genesis-evidence.mjs";

test("XGR commitment deterministic and sensitive to canonical order",()=>{
 const a=[
  {address:"0x"+"01".repeat(20),blsPublicKeyCompressed:"0x"+"11".repeat(48)},
  {address:"0x"+"02".repeat(20),blsPublicKeyCompressed:"0x"+"22".repeat(48)},
  {address:"0x"+"03".repeat(20),blsPublicKeyCompressed:"0x"+"33".repeat(48)}
 ];
 const hash=computeXGRSetCommitment(a);
 assert.match(hash,/^0x[a-f0-9]{64}$/);
 assert.equal(hash,computeXGRSetCommitment(a));
 assert.notEqual(hash,computeXGRSetCommitment([a[1],a[0],a[2]]));
 assert.throws(()=>computeXGRSetCommitment(a.slice(0,2)),/Invalid XGR/);
 assert.throws(()=>computeXGRSetCommitment([{...a[0],blsPublicKeyCompressed:"0x00"},a[1],a[2]]),/Invalid XGR/);
});
