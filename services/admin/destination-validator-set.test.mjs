import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {approvedValidatorSet} from "./bootstrap.mjs";
const addr=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
test("Base and Polygon can pin DIFFERENT explicit initial Interchain Genesis validator sets",()=>{
 const root=mkdtempSync(join(tmpdir(),"xita-genesis-"));
 try{
  mkdirSync(join(root,"config/validators"),{recursive:true});
  const base=[addr(1),addr(2),addr(3)],polygon=[addr(2),addr(3),addr(4),addr(5)];
  const record=validators=>({schemaVersion:1,kind:"xita-initial-validator-set",
   originChainId:1643,validators});
  writeFileSync(join(root,"config/validators/initial.json"),JSON.stringify(record(base)));
  writeFileSync(join(root,"config/validators/polygon.json"),JSON.stringify(record(polygon)));
  assert.deepEqual(approvedValidatorSet(root,{
   genesisValidatorManifest:"config/validators/initial.json"}).validators,base);
  assert.deepEqual(approvedValidatorSet(root,{
   genesisValidatorManifest:"config/validators/polygon.json"}).validators,polygon);
  assert.throws(()=>approvedValidatorSet(root,{
   genesisValidatorManifest:"../../etc/passwd"}),/Genesis/);
  writeFileSync(join(root,"config/validators/polygon.json"),JSON.stringify(record([addr(1),addr(1),addr(2)])));
  assert.throws(()=>approvedValidatorSet(root,{
   genesisValidatorManifest:"config/validators/polygon.json"}),/Invalid/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
