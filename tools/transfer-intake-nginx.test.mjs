import test from "node:test";
import assert from "node:assert/strict";
import {patchTransferIntakeNginx} from "./transfer-intake-nginx.mjs";
const cfg="server {\n server_name xita.xgr.network;\n location ^~ /api/xeta/ { return 503; }\n}";
test("exact TX intake route is idempotent and preserves fail-closed API",()=>{
 const first=patchTransferIntakeNginx(cfg);
 assert.equal(first.changed,true);
 assert.match(first.config,/location = \/api\/xeta\/v1\/transfers\/announce/);
 assert.match(first.config,/proxy_pass http:\/\/127\.0\.0\.1:4089/);
 assert.match(first.config,/X-Real-IP \$remote_addr/);
 assert.match(first.config,/location \^~ \/api\/xeta\/ \{ return 503; \}/);
 const repeat=patchTransferIntakeNginx(first.config);
 assert.equal(repeat.changed,false);
 assert.equal(repeat.config,first.config);
});
test("refuse malformed host, duplicate or untrusted listener",()=>{
 assert.throws(()=>patchTransferIntakeNginx(cfg.replace("xita.xgr.network","example.org")),/Wrong/);
 const first=patchTransferIntakeNginx(cfg).config;
 assert.throws(()=>patchTransferIntakeNginx(first.replace("4089","4088")),/Unsafe/);
 assert.throws(()=>patchTransferIntakeNginx(first.replace("location ^~ /api/xeta/ {",first.split("location = /api/xeta/v1/transfers/announce")[1]?"location = /api/xeta/v1/transfers/announce { proxy_pass http://127.0.0.1:4089; }\nlocation ^~ /api/xeta/ {":"")),/Duplicate|Malformed|Unsafe/);
 assert.throws(()=>patchTransferIntakeNginx("server_name xita.xgr.network;"),/fail-closed/);
});
