import test from "node:test";
import assert from "node:assert/strict";
import {patchInterchainFeeNginx,patchFeePreviewNginx} from "./interchain-fee-nginx.mjs";
const vhost=["server {",
 "server_name xita.xgr.network;",
 "location ^~ /api/xeta/ { return 503; }",
 "location / { try_files $uri $uri/ /index.html; }","}"].join("\n");
test("add exact fee quote and status, not a broad public signer proxy",()=>{
 const a=patchInterchainFeeNginx(vhost);
 assert.deepEqual(a.added,[
  "/api/xita/v1/managed/health","/api/xita/v1/managed/quote","/api/xita/v1/managed/preview"]);
 assert.match(a.config,/location = \/api\/xita\/v1\/managed\/quote/);
 assert.match(a.config,/location = \/api\/xita\/v1\/managed\/preview/);
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

test("exact configured Polygon/Arbitrum/Base JSON-RPC HTTPS hosts are whitelisted once in CSP",()=>{
 const csp=vhost.replace("server_name xita.xgr.network;",
  "server_name xita.xgr.network;\n"+
  "add_header Content-Security-Policy \"default-src 'self'; connect-src 'self' https://rpc.xgr.network; object-src 'none'\" always;");
 const a=patchInterchainFeeNginx(csp);
 for(const uri of [
  "https://gateway.tenderly.co",
  "https://base.gateway.tenderly.co",
  "https://polygon-bor-rpc.publicnode.com",
  "https://arbitrum-one-rpc.publicnode.com"
 ]){
  assert.ok(a.config.includes(uri));
  assert.equal(a.config.split(uri).length-1,1);
 }
 assert.equal(patchInterchainFeeNginx(a.config).changed,false);
});

test("keyless preview installs only POST /preview on isolated 4093, not signer on 4092",()=>{
 const {config,added}=patchFeePreviewNginx(vhost);
 assert.deepEqual(added,["/api/xita/v1/managed/preview"]);
 assert.match(config,/location = \\/api\\/xita\\/v1\\/managed\\/preview/);
 assert.match(config,/proxy_pass http:\\/\\/127\\.0\\.0\\.1:4093;/);
 assert.doesNotMatch(config,/location = \\/api\\/xita\\/v1\\/managed\\/quote/);
 assert.doesNotMatch(config,/location = \\/api\\/xita\\/v1\\/managed\\/health/);
 assert.deepEqual(patchFeePreviewNginx(config),{config,changed:false,added:[]});
 const bad=config.replace("proxy_pass http://127.0.0.1:4093;","proxy_pass http://127.0.0.1:4092;");
 assert.throws(()=>patchFeePreviewNginx(bad),/Unapproved/);
});
test("later fee signer route setup keeps preview isolated and existing signer proxy",()=>{
 const first=patchFeePreviewNginx(vhost).config;
 const full=patchInterchainFeeNginx(first);
 assert.deepEqual(full.added,["/api/xita/v1/managed/health","/api/xita/v1/managed/quote"]);
 assert.match(full.config,/location = \\/api\\/xita\\/v1\\/managed\\/quote[\\s\\S]*?proxy_pass http:\\/\\/127\\.0\\.0\\.1:4092;/);
 assert.match(full.config,/location = \\/api\\/xita\\/v1\\/managed\\/preview[\\s\\S]*?proxy_pass http:\\/\\/127\\.0\\.0\\.1:4093;/);
});
