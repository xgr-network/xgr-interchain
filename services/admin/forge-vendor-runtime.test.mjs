import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const root=resolve(new URL("../../",import.meta.url).pathname);
test("UI trusted build compiles production contracts without forge-std scripts or tests",()=>{
 const source=readFileSync(resolve(root,"services/admin/trusted-artifacts.mjs"),"utf8");
 assert.doesNotMatch(source,/exec\(forge,\["build"/);
 assert.match(source,/readSealedArtifacts\(root,commit\)/);
});
test("server update provisions Hyperlane and OpenZeppelin before restarting UI",()=>{
 const sh=readFileSync(resolve(root,"manage.sh"),"utf8");
 assert.match(sh,/npm install --prefix "\$ROOT\/vendor" --ignore-scripts/);
 assert.match(sh,/prepare_solidity_runtime\n  sha=/);
 assert.match(sh,/verify-solidity-runtime\.mjs/);
 assert.match(sh,/forge_bin.*build --force --skip test script/);
});
