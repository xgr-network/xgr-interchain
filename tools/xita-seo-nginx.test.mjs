import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {patchXitaSeoNginx,legacyFallback,seoFallback} from "./xita-seo-nginx.mjs";

const config=readFileSync(new URL("../deploy/nginx/xita.xgr.network.conf.example",import.meta.url),"utf8");
const spa="server { server_name xita.xgr.network;\n  location = /api/xeta/v1/rpc/read { proxy_pass http://127.0.0.1:4088; }\n  "+legacyFallback+"\n}";
test("SEO nginx keeps original RPC while adding all public and protected routes",()=>{
 const {config:patched,changed}=patchXitaSeoNginx(spa);
 assert.equal(changed,true);
 assert.equal(patched.includes("location = /api/xeta/v1/rpc/read { proxy_pass http://127.0.0.1:4088; }"),true);
 assert.equal(patched.includes("location = /faq { try_files /faq.html =404; }"),true);
 assert.equal(patched.includes("location = /transfer { try_files /noindex.html =404; }"),true);
 assert.equal(patched.includes("location / { try_files $uri =404; }"),true);
 assert.deepEqual(patchXitaSeoNginx(patched),{config:patched,changed:false});
 assert.equal(patchXitaSeoNginx(config).changed,false);
});
test("unknown, duplicated and conflicting Nginx routing fails closed",()=>{
 assert.throws(()=>patchXitaSeoNginx("server { server_name other; }"),/Wrong/);
 assert.throws(()=>patchXitaSeoNginx(spa.replace(legacyFallback,"location / { try_files /index.html =404; }")) ,/exactly one/);
 assert.throws(()=>patchXitaSeoNginx(spa.replace(legacyFallback,legacyFallback+"\n"+legacyFallback)),/exactly one/);
 assert.throws(()=>patchXitaSeoNginx(spa.replace(legacyFallback,"location = /faq { try_files /faq.html =404; }\n"+legacyFallback)),/Partial/);
});
test("public URLs have unique initial titles/canonicals; private URLs are excluded",()=>{
 const root=new URL("../apps/web/",import.meta.url);
 const map={"/":"index.html","/faq":"faq.html","/join":"join.html","/markets":"markets.html","/contact":"contact.html"};
 const titles=new Set();
 for(const [url,file] of Object.entries(map)){
  const html=readFileSync(new URL(file,root),"utf8");
  assert.match(html,/\<h1\>[^<]+\<\/h1\>/,file);
  assert.match(html,/name="description" content="[^"]+"/,file);
  assert.match(html,/name="robots" content="index,follow"/,file);
  assert.ok(html.includes('rel="canonical" href="https://xita.xgr.network'+url+'"'),file);
  const title=html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title,file); assert.ok(!titles.has(title),file);titles.add(title);
  assert.match(html,/type="module" src="\/app.js/,file);
 }
 const noindex=readFileSync(new URL("noindex.html",root),"utf8");
 assert.match(noindex,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(noindex,/rel="canonical"/);
 const robots=readFileSync(new URL("robots.txt",root),"utf8");
 const sitemap=readFileSync(new URL("sitemap.xml",root),"utf8");
 assert.match(robots,/Sitemap: https:\/\/xita\.xgr\.network\/sitemap\.xml/);
 for(const route of Object.keys(map))assert.ok(sitemap.includes("<loc>https://xita.xgr.network"+route+"</loc>"));
 assert.doesNotMatch(sitemap,/\/transfer|\/my-transfers|\/token\/|\/admin|\/join\/confirm/);
 assert.match(seoFallback,/location \/ \{ try_files \$uri =404; \}/);
});
