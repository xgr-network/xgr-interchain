import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn,spawnSync} from "node:child_process";

const root=fileURLToPath(new URL(".",import.meta.url));
const types={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"};
const browsers=[process.env.XITA_BROWSER,"google-chrome","chromium","chromium-browser"].filter(Boolean);
const executable=browsers.find(name=>{
 const result=spawnSync(name,["--version"],{encoding:"utf8",timeout:3000});
 return result.status===0;
});
function visit(browser,url){
 return new Promise((ok,fail)=>{
  const args=["--headless","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
    "--disable-extensions","--no-first-run","--disable-background-networking",
    "--virtual-time-budget=5000","--dump-dom",url];
  const child=spawn(browser,args,{stdio:["ignore","pipe","pipe"]});
  let output="",errors="";
  const timer=setTimeout(()=>{child.kill();fail(new Error("Chromium did not render page within 18 seconds: "+errors.slice(-1000)))},18000);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data",v=>{output+=v});
  child.stderr.setEncoding("utf8");
  child.stderr.on("data",v=>{errors+=v});
  child.on("error",error=>{clearTimeout(timer);fail(error)});
  child.on("close",code=>{
   clearTimeout(timer);
   if(code!==0)fail(new Error("Browser exited "+code+": "+errors.slice(-1400)));
   else ok(output);
  });
 });
}

test("real browser renders all XITA pages from local JSON, not an endless splash", {timeout:70000},async()=>{
 assert.ok(executable,"Headless Chrome or Chromium required for UI startup smoke test");
 const requests=[];
 const server=createServer(async(request,response)=>{
  const pathname=new URL(request.url,"http://127.0.0.1").pathname;
  requests.push(pathname);
  if(pathname.startsWith("/api/")){
   response.writeHead(503,{"Content-Type":"application/json"});
   response.end('{"ok":false,"error":"Not deployed"}');
   return;
  }
  const isPage=pathname==="/"||pathname==="/universe"||pathname==="/token/xgr"||pathname==="/markets";
  const target=isPage?"index.html":pathname.slice(1);
  const full=resolve(root,target);
  if(!full.startsWith(root.endsWith(sep)?root:root+sep)){
   response.writeHead(403);response.end();return;
  }
  try{
   const data=await readFile(full);
   response.writeHead(200,{"Content-Type":types[extname(full)]||"application/octet-stream","Cache-Control":"no-store"});
   response.end(data);
  }catch{
   response.writeHead(404);response.end("Missing static asset: "+target);
  }
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{
  const origin="http://127.0.0.1:"+server.address().port;
  for(const [path,expected] of [["/","Interchain Dashboard"],["/universe","The XITA"],["/token/xgr","Bridge XGR"],["/markets","Explore Tokens"]]){
   const html=await visit(executable,origin+path);
   assert.match(html,/data-ready="1"/,path+" did not initialize from catalog.json");
   assert.ok(html.replace(/<[^>]*>/g," ").replace(/\s+/g," ").includes(expected.replace(/\s+/g," ")),path+" missing expected page "+expected);
   assert.doesNotMatch(html,/Dashboard could not start|Dashboard unavailable/,path+" failed to bootstrap");
   if(path==="/markets"){assert.match(html,/data-leader-sort="lockedUsd"/);assert.match(html,/data-leader-sort="movedUsd"/);assert.match(html,/data-leader-sort="marketCapUsd"/);assert.match(html,/Explore Tokens|Explore <span>Tokens<\/span>/); }
   if(path==="/"||path==="/universe"){
    assert.match(html,/<canvas[^>]+ux-3d-canvas/,path+" missing 3D scene");
    assert.match(html,/data-cosmos-action="home"/,path+" missing XGR home navigation");
    assert.doesNotMatch(html,/data-cosmos-action="left"/,path+" should not require arrow buttons");
    assert.match(html,/ux-3d-hint/,path+" missing mouse guidance");
    if(path==="/universe"){assert.match(html,/ux-3d-focus/, "System focus overlay missing");assert.match(html,/data-cosmos-system="base"/, "Clickable chain label missing");}
    assert.match(html,/data-renderer="(webgl|fallback)"/,path+" did not initialize WebGL or graceful fallback");
   }
  }
  assert.ok(requests.filter(x=>x==="/catalog.json").length>=3,"Local catalog.json not requested for each direct URL");
  assert.ok(!requests.some(x=>x.endsWith(".mjs")),"Browser requested an old .mjs asset");
  for(const name of ["/app.js","/experience.js","/wallet-core.js","/ui-data.js"])assert.ok(requests.includes(name),"Missing browser module "+name);
 }finally{
  await new Promise(ok=>server.close(ok));
 }
});
