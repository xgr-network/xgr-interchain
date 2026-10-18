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

test("update always reloads the checkout after pull before publishing or restarting",()=>{
 const u=shell.split("\nupdate() {")[1]?.split("\n}\n\ncase ")[0];
 assert.ok(u,"missing update function");
 assert.match(u,/git -C "\$ROOT" pull --ff-only origin main/);
 assert.match(u,/exec env XITA_UPDATE_MAIN_SHA="\$checked_out" bash "\$ROOT\/manage\.sh" _complete-update/);
 assert.doesNotMatch(u,/\bpublish_web\b|\binstall_sync\b|systemctl restart/);
 const completion=shell.split("\ncomplete_update() {")[1]?.split("\n}\n")[0];
 assert.match(completion,/require_clean_main/);
 assert.match(completion,/publish_web/);
 assert.match(completion,/install_sync/);
 assert.match(completion,/systemctl restart xita-indexer\.service/);
 assert.match(shell,/_complete-update\)[\s\S]*?XITA_UPDATE_MAIN_SHA[\s\S]*?complete_update/);
});

test("updating the published XITA release refreshes both proof and historical transfer indexer",()=>{
 const done=shell.split("\ncomplete_update() {")[1]?.split("\n}\n")[0];
 assert.match(done,/restart xita-indexer\.service/);
 assert.match(done,/restart xita-transfer-indexer\.service/);
 assert.match(done,/is-active --quiet xita-transfer-indexer\.service/);
});

test("optional global Interchain Fee install is separate from blockchain deployment and protects private keys",()=>{
 const section=shell.split("install_interchain_fee() (")[1]?.split("\n)\n")[0];
 assert.ok(section,"missing installer");
 assert.match(section,/require_clean_main/);
 assert.doesNotMatch(section,/\/etc\/xita\/quote\.env/);
 assert.match(section,/\/etc\/xita\/interchain-fee\.env/);
 assert.match(section,/xita-interchain-fee-quote\.service/);
 assert.match(section,/xita-interchain-fee-claim\.timer/);
 assert.match(section,/xita-gas-sponsor\.timer/);
 assert.match(section,/XITA_INTERCHAIN_FEE_NGINX=1/);
 assert.match(section,/\/run\/lock\/xita-fee-wallet\.lock/);
 assert.doesNotMatch(section,/cast send|forge script|ethereum\.request|sendTransaction/);
 const completion=shell.split("\ncomplete_update() {")[1]?.split("\n}\n")[0];
 assert.match(completion,/systemctl restart xita-interchain-fee-quote\.service/);
});

test("TVL installer checks root-only indexer env with privileged access",()=>{
 const part=shell.split("install_tvl() (")[1]?.split("\n)\n")[0];
 assert.ok(part);
 assert.match(part,/privileged test -f \/etc\/xita\/indexer\.env/);
 assert.doesNotMatch(part,/\[\[ -f \/etc\/xita\/indexer\.env \]\]/);
 assert.match(part,/privileged grep -q/);
});
