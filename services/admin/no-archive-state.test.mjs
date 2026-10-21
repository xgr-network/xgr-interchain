import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const paths=[
 "services/admin/deployment-ledger.mjs",
 "services/admin/chain-reconcile.mjs",
 "services/admin/source-registry-recovery.mjs",
 "services/admin/deployment-auto-recovery.mjs",
 "services/indexer/transfer-index.mjs",
 "services/managed-relay/worker.mjs",
 "services/managed-relay/managed-indexer.mjs",
 "runtime/native-relayer/iln.mjs",
 "runtime/native-relayer/init-iln-merkle.mjs",
 "tools/verify-base-bls-receipt.mjs",
 "tools/probe-base-rpc.mjs"
];
const archivePatterns=[
 /eth_getCode\s*["'],\s*\[\s*[^,]+,\s*(?!["']latest["'])[^\]]+/,
 /eth_getTransactionCount\s*["'],\s*\[\s*[^,]+,\s*["']0x/,
 /blockTag\s*:\s*(?:receipt\.blockNumber|finalized|checkpointBlock|epoch|snapshotBlock)/,
 /hookCall\s*\([^;]*checkpointBlock/,
 /eth_call\s*["'],\s*\[[\s\S]*?\}\s*,\s*(?:BLOCK|hex\(finalizedHead\))/
];
test("production RPC entrypoints do not require archive EVM state",()=>{
 for(const p of paths){
  const source=readFileSync(join(process.cwd(),p),"utf8");
  for(const expression of archivePatterns)
   assert.doesNotMatch(source,expression,`${p} must not require historical EVM account/contract state`);
 }
});
