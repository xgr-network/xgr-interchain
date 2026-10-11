import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const source=path=>readFileSync(join(import.meta.dirname,path),"utf8");

test("chain and asset reconcile never mutate read-only git checkout",()=>{
 for(const name of ["chain-operator.mjs","asset-operator.mjs"]){
  const code=source(name);
  assert.doesNotMatch(code,/execFileSync\(["']git["']/);
  assert.doesNotMatch(code,/["']pull["'],["']--ff-only["']/);
  assert.match(code,/checkoutUpdateRequired:true/);
  assert.match(code,/\.document\(id,/);
 }
});
