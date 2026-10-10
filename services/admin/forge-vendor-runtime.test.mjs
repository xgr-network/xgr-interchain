import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const root=resolve(new URL("../../",import.meta.url).pathname);
test("UI trusted build compiles production contracts without forge-std scripts or tests",()=>{
 const source=readFileSync(resolve(root,"services/admin/trusted-artifacts.mjs"),"utf8");
 assert.match(source,/\["build","--force","--skip","test","script"\]/);
});
test("server update provisions Hyperlane and OpenZeppelin before restarting UI",()=>{
 const sh=readFileSync(resolve(root,"manage.sh"),"utf8");
 assert.match(sh,/npm install --prefix "\$ROOT\/vendor" --ignore-scripts/);
 assert.match(sh,/prepare_solidity_runtime\n  sha=/);
 assert.match(sh,/@hyperlane-xyz\/core\/contracts\/token\/libs\/TokenRouter\.sol/);
});
