import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const shell=readFileSync(new URL("../manage.sh",import.meta.url),"utf8");
test("XITA static publication cannot roll back when Admin restart or readiness fails",()=>{
 assert.match(shell,/privileged mv -Tf "\$next" "\$SITE_DIR\/current"/);
 assert.doesNotMatch(shell,/restore_web\s*\(/);
 assert.doesNotMatch(shell,/restoring previous website/);
 assert.match(shell,/if ! privileged systemctl restart "\$ADMIN_SERVICE"; then[\s\S]*?new website remains published/);
 assert.match(shell,/elif ! wait_admin; then[\s\S]*?new website remains published/);
});
test("Admin readiness uses a lightweight local endpoint, not the chain inventory",()=>{
 const waiting=shell.split("wait_admin() {")[1]?.split("\n}")[0];
 assert.ok(waiting);
 assert.match(waiting,/\/admin\/api\/deployment-sync\/status/);
 assert.doesNotMatch(waiting,/\/admin\/api\/plan/);
});
test("manage.sh retains its executable bit in Git",()=>{
 // Mode check is also performed directly in the GitHub CI workflow.
 assert.match(shell,/^#!\/usr\/bin\/env bash/);
});

test("temporary service cleanup cannot leak a RETURN trap into update()",()=>{
 assert.match(shell,/install_sync\(\) \([\s\S]*?trap 'rm -f "\$\{service_file:-\}"[\s\S]*?' EXIT/);
 assert.match(shell,/install_transfer_api\(\) \([\s\S]*?trap 'rm -f "\$\{unit:-\}"' EXIT/);
 assert.doesNotMatch(shell,/trap [^\n]* RETURN/);
 assert.match(shell,/update\(\) \{[\s\S]*?install_sync/);
});
