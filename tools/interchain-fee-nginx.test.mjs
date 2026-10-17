import test from "node:test";
import assert from "node:assert/strict";
import {patchInterchainFeeNginx} from "./interchain-fee-nginx.mjs";
const vhost=["server {",
 "server_name xita.xgr.network;",
 "location ^~ /api/xeta/ { return 503; }",
 "location / { try_files $uri $uri/ /index.html; }","}"].join("\n");
test("add exact fee quote and status, not a broad public signer proxy",()=>{
 const a=patchInterchainFeeNginx(vhost);
 assert.deepEqual(a.added,[
  "/api/xita/v1/managed/health","/api/xita/v1/managed/quote"]);
 assert.match(a.config,/location = \/api\/xita\/v1\/managed\/quote/);
 assert.match(a.config,/limit_except POST \{ deny all; \}/);
 assert.match(a.config,/client_max_body_size 4k/);
 assert.match(a.config,/location = \/api\/xita\/v1\/managed\/health/);
 assert.match(a.config,/limit_except GET \{ deny all; \}/);
 const again=patchInterchainFeeNginx(a.config);
 assert.equal(again.changed,false);
 assert.deepEqual(again.added,[]);
});
test("reject unsafe existing quote route or duplicate and wrong host",()=>{
 assert.throws(()=>patchInterchainFeeNginx(vhost.replace(
  "xita.xgr.network","evil.example")),/Wrong XITA/);
 let a=patchInterchainFeeNginx(vhost).config;
 const bad=a.replace("proxy_pass http://127.0.0.1:4092;",
  "proxy_pass http://127.0.0.1:9999;");
 assert.throws(()=>patchInterchainFeeNginx(bad),/Unapproved/);
 const quote="location = /api/xita/v1/managed/quote { limit_except POST { deny all; } proxy_pass http://127.0.0.1:4092; }";
 a=a.replace("location ^~ /api/xeta/ {",quote+"\nlocation ^~ /api/xeta/ {");
 assert.throws(()=>patchInterchainFeeNginx(a),/Duplicate/);
});
