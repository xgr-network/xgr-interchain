import test from "node:test";
import assert from "node:assert/strict";
import {patchXitaJoinNginx} from "./join-nginx.mjs";
const vhost=["server {","server_name xita.xgr.network;",
 "location ^~ /api/xeta/ { return 503; }",
 "location / { try_files $uri $uri/ /index.html; }","}"].join("\n");
test("install only exact Join methods and rate-limited write paths",()=>{
 const p=patchXitaJoinNginx(vhost);
 assert.deepEqual(p.added,[
  "/api/xita/join/status","/api/xita/join/preview",
  "/api/xita/join/submit","/api/xita/join/confirm",
  "/api/xita/creator/register","/api/xita/creator/confirm","/token-logos/"]);
 for(const endpoint of p.added)assert.ok(p.config.includes("location "+(endpoint==="/token-logos/"?"^~ ":"= ")+endpoint+" {"));
 assert.equal((p.config.match(/proxy_pass http:\/\/127\.0\.0\.1:4090;/g)||[]).length,4);
 assert.equal((p.config.match(/limit_req zone=xita_join_submit burst=3 nodelay;/g)||[]).length,2);
 assert.match(p.config,/location = \/api\/xita\/join\/status \{\n\s+limit_except GET/);
 assert.match(p.config,/location = \/api\/xita\/join\/confirm \{\n\s+limit_except POST \{ deny all; \}\n\s+client_max_body_size 1k/);
 assert.match(p.config,/location = \/api\/xita\/join\/confirm \{[\s\S]*?proxy_read_timeout 120s;/);
 assert.ok(p.config.includes("location ^~ /token-logos/ {"));
 assert.match(p.config,/client_max_body_size 185k/);
 assert.deepEqual(patchXitaJoinNginx(p.config),{config:p.config,changed:false,added:[]});
});
test("keep safe existing read-only preview, add three missing endpoints",()=>{
 const existing=vhost.replace("location ^~ /api/xeta/ {",[
  "location = /api/xita/join/preview {",
  "limit_except POST { deny all; }",
  "client_max_body_size 480k;",
  "proxy_pass http://127.0.0.1:4090;",
  "}",
  "location ^~ /api/xeta/ {"].join("\n"));
 const out=patchXitaJoinNginx(existing);
 assert.deepEqual(out.added,[
  "/api/xita/join/status","/api/xita/join/submit","/api/xita/join/confirm",
  "/api/xita/creator/register","/api/xita/creator/confirm","/token-logos/"]);
 assert.equal((out.config.match(/location = \/api\/xita\/join\/preview/g)||[]).length,1);
 assert.equal(patchXitaJoinNginx(out.config).changed,false);
});
test("fail closed on wrong host, duplicate routes, altered upstream and missing protection",()=>{
 assert.throws(()=>patchXitaJoinNginx(vhost.replace("xita.xgr.network","other.example")) ,/Wrong XITA/);
 const installed=patchXitaJoinNginx(vhost).config;
 assert.throws(()=>patchXitaJoinNginx(installed.replace("127.0.0.1:4090","127.0.0.1:4099")),/Unapproved/);
 assert.throws(()=>patchXitaJoinNginx(installed.replace("limit_req zone=xita_join_submit burst=3 nodelay;","")),/rate limit/);
 assert.throws(()=>patchXitaJoinNginx(installed.replace("client_max_body_size 1k;","client_max_body_size 480k;")),/request limit/);
 const duplicate=installed.replace("location ^~ /api/xeta/ {",
  "location = /api/xita/join/status { limit_except GET { deny all; } proxy_pass http://127.0.0.1:4090; }\nlocation ^~ /api/xeta/ {");
 assert.throws(()=>patchXitaJoinNginx(duplicate),/Duplicate/);
});
