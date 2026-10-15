import test from "node:test";
import assert from "node:assert/strict";
import {patchXitaTransferNginx} from "./transfer-recovery-nginx.mjs";
const base=[
 "server {",
 "    server_name xita.xgr.network;",
 "    add_header Content-Security-Policy \"default-src 'self'; connect-src 'self' https://rpc.xgr.network https://explorer.xgr.network\" always;",
 "    location ^~ /api/xeta/ { return 503; }",
 "    location / { try_files $uri $uri/ /index.html; }",
 "}"
].join("\n");
const recovery=[
 "location = /api/xeta/v1/transfer/recovery {",
 "    proxy_pass http://127.0.0.1:4088;",
 "    proxy_read_timeout 95s;",
 "}"
].join("\n");
const health=[
 "location = /api/xeta/v1/transfer/health {",
 "    proxy_pass http://127.0.0.1:4088;",
 "    proxy_read_timeout 5s;",
 "}"
].join("\n");
test("fresh install provides both exact read-only proxy paths",()=>{
 const first=patchXitaTransferNginx(base);
 assert.deepEqual(first.added,["/api/xeta/v1/transfer/health","/api/xeta/v1/transfer/recovery"]);
 assert.match(first.config,/location = \/api\/xeta\/v1\/transfer\/health/);
 assert.match(first.config,/location = \/api\/xeta\/v1\/transfer\/recovery/);
 assert.match(first.config,/location \^~ \/api\/xeta\/ \{ return 503; \}/);
 assert.match(first.config,/https:\/\/base-rpc\.publicnode\.com/);
 const second=patchXitaTransferNginx(first.config);
 assert.equal(second.changed,false);
 assert.deepEqual(second.added,[]);
 assert.equal(second.config,first.config);
});
test("existing recovery route alone does not skip missing health endpoint",()=>{
 const prior=base.replace("location ^~ /api/xeta/ {",recovery+"\n    location ^~ /api/xeta/ {");
 const result=patchXitaTransferNginx(prior);
 assert.deepEqual(result.added,["/api/xeta/v1/transfer/health"]);
 assert.equal(result.config.split("location = /api/xeta/v1/transfer/recovery").length-1,1);
 assert.equal(result.config.split("location = /api/xeta/v1/transfer/health").length-1,1);
 assert.equal(patchXitaTransferNginx(result.config).changed,false);
});
test("existing health route alone does not skip destination recovery",()=>{
 const prior=base.replace("location ^~ /api/xeta/ {",health+"\n    location ^~ /api/xeta/ {");
 const result=patchXitaTransferNginx(prior);
 assert.deepEqual(result.added,["/api/xeta/v1/transfer/recovery"]);
 assert.equal(result.config.split("location = /api/xeta/v1/transfer/health").length-1,1);
});
test("wrong virtual host, duplicate route or untrusted upstream fail closed",()=>{
 assert.throws(()=>patchXitaTransferNginx(base.replace("xita.xgr.network","other.test")),/Wrong XITA/);
 const double=base.replace("location ^~ /api/xeta/ {",health+"\n"+health+"\nlocation ^~ /api/xeta/ {");
 assert.throws(()=>patchXitaTransferNginx(double),/Duplicate XITA/);
 const evil=base.replace("location ^~ /api/xeta/ {",health.replace("127.0.0.1:4088","127.0.0.1:9999")+
  "\nlocation ^~ /api/xeta/ {");
 assert.throws(()=>patchXitaTransferNginx(evil),/approved read-only upstream/);
});
test("missing fail-closed API location is an error, not an invented route",()=>{
 assert.throws(()=>patchXitaTransferNginx(base.replace("location ^~ /api/xeta/ {","location /api/xeta/ {")),/fail-closed/);
});
