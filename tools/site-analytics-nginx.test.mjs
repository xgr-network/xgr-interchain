import test from "node:test";
import assert from "node:assert/strict";
import {patchXitaAnalyticsNginx} from "./site-analytics-nginx.mjs";
const base="server {\n server_name xita.xgr.network;\n location ^~ /api/xeta/ { return 503; }\n}\n";
test("first install is scoped and idempotent",()=>{
 const first=patchXitaAnalyticsNginx(base);
 assert.equal(first.changed,true);
 assert.match(first.config,/location = \/api\/xita\/analytics\/hit \{/);
 assert.match(first.config,/limit_except POST \{ deny all; \}/);
 assert.match(first.config,/proxy_pass http:\/\/127\.0\.0\.1:4087/);
 assert.match(first.config,/proxy_set_header X-Real-IP \$remote_addr/);
 assert.match(first.config,/proxy_set_header X-Forwarded-For ""/);
 assert.match(first.config,/location \^~ \/api\/xeta\/ \{ return 503; \}/);
 const second=patchXitaAnalyticsNginx(first.config);
 assert.equal(second.changed,false);
 assert.equal(second.config,first.config);
});
test("reject wrong site, duplicate and unsafe incoming location",()=>{
 assert.throws(()=>patchXitaAnalyticsNginx(base.replace("xita.xgr.network","other.test")),/Wrong/);
 const installed=patchXitaAnalyticsNginx(base).config;
 const unsafe=installed.replace("127.0.0.1:4087","127.0.0.1:9999");
 assert.throws(()=>patchXitaAnalyticsNginx(unsafe),/Unsafe/);
 const firstRoute=installed.indexOf("location = /api/xita/analytics/hit {");
 const nextRoute=installed.indexOf("location ^~ /api/xeta/ {");
 const routeBlock=installed.slice(firstRoute,nextRoute);
 const duplicate=installed.replace("location ^~ /api/xeta/ {",
  routeBlock+"location ^~ /api/xeta/ {");
 assert.throws(()=>patchXitaAnalyticsNginx(duplicate),/Duplicate/);
});
