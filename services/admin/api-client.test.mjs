import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {apiJSON} from "./api-client.mjs";
const response=(status,type,payload)=>({
 ok:status>=200&&status<300,status,headers:{get:()=>type},
 json:async()=>typeof payload==="string"?JSON.parse(payload):payload
});
test("proxy timeout HTML becomes actionable API path + status, not JSON parser error",async()=>{
 await assert.rejects(apiJSON(async()=>response(504,"text/html","<html>timeout</html>"),"/admin/api/deployment-readiness?chain=xgrchain"),
  err=>/deployment-readiness/.test(err.message)&&/504/.test(err.message)&&!/Unexpected token/.test(err.message));
});
test("basic auth and absent API routing are diagnosed before parsing",async()=>{
 for(const code of [401,403,404,502,503]){
  await assert.rejects(apiJSON(async()=>response(code,"text/html","<html>"),"/admin/api/chain-deploy/status"),
   err=>err.message.includes(String(code))&&err.message.includes("chain-deploy/status"));
 }
});
test("typed JSON preserves backend diagnostics",async()=>{
 const good=await apiJSON(async()=>response(200,"application/json; charset=utf-8",{ok:true,intents:{}}),"/admin/api/chain-deploy/status");
 assert.equal(good.ok,true);
 await assert.rejects(apiJSON(async()=>response(400,"application/json",{ok:false,error:"missing BLS"}),"/admin/api/deployment-readiness"),
  /missing BLS/);
});
test("Admin API module is served behind authenticated Admin path",()=>{
 const server=readFileSync(new URL("./server.mjs",import.meta.url),"utf8");
 const html=readFileSync(new URL("./admin.js",import.meta.url),"utf8");
 assert.match(server,/\/admin\/api-client\.mjs/);
 assert.match(html,/import \{apiJSON\} from "\.\/api-client\.mjs"/);
});
