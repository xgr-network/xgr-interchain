import test from "node:test";
import assert from "node:assert/strict";
import {assertNoUnresolvedCreatorNonce} from "./creator-wallet-guard.mjs";
const dir="/var/lib/xita/join";
const env={XITA_CREATOR_SHARED_WALLET:"true",XITA_CREATOR_PRIVATE_DIR:dir};
const path="11111111-1111-1111-1111-111111111111.json";
const hooks=row=>({stat:()=>({isDirectory:()=>true,mode:0o40700}),
 list:()=>[path],read:()=>JSON.stringify(row)});
test("sponsor/fee claim must refuse unresolved signed Creator tx even if RPC mempool is empty",()=>{
 const pending={kind:"token-creator",phase:"deployment-submitted",
  deployment:{txHash:"0x"+"a".repeat(64),rawSignedTransaction:"0x010203"}};
 assert.throws(()=>assertNoUnresolvedCreatorNonce(env,hooks(pending)),/nonce reserved/);
 assert.doesNotThrow(()=>assertNoUnresolvedCreatorNonce(env,hooks({...pending,phase:"deployed"})));
 assert.doesNotThrow(()=>assertNoUnresolvedCreatorNonce(env,hooks({...pending,phase:"pr-published"})));
 assert.throws(()=>assertNoUnresolvedCreatorNonce(env,hooks({...pending,deployment:{}})),/durable signed/);
});
test("Creator wallet guard is fail-closed for bad private journal paths and evidence",()=>{
 assert.throws(()=>assertNoUnresolvedCreatorNonce({...env,XITA_CREATOR_PRIVATE_DIR:"/tmp/join"}),/journal directory/);
 assert.throws(()=>assertNoUnresolvedCreatorNonce(env,{...hooks({}),stat:()=>({isDirectory:()=>true,mode:0o40755})}),/Untrusted/);
 assert.throws(()=>assertNoUnresolvedCreatorNonce(env,{...hooks({}),read:()=>"{ broken json"}),SyntaxError);
 assert.doesNotThrow(()=>assertNoUnresolvedCreatorNonce(env,{...hooks({}),list:()=>[]}));
 assert.doesNotThrow(()=>assertNoUnresolvedCreatorNonce({...env,XITA_CREATOR_SHARED_WALLET:"false"},{stat:()=>{throw Error("must not read")}}));
});
