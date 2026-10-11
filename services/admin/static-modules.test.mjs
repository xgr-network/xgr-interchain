// Every imported browser module must be served by the Admin as JavaScript.
// Without this regression test, a missing module silently freezes the whole UI.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {dirname,join,posix} from "node:path";
import {fileURLToPath} from "node:url";

const dir=dirname(fileURLToPath(import.meta.url));
test("Admin serves the entire browser module dependency graph with JavaScript MIME",()=>{
 const server=readFileSync(join(dir,"server.mjs"),"utf8");
 const entries=[...server.matchAll(/^\s*\["(\/admin\/[^"]*)",\["([^"]+)","([^"]+)"\]\],?$/gm)];
 const routes=new Map(entries.map(([,url,file,mime])=>[url,{file,mime}]));
 assert.ok(routes.has("/admin/"),"Admin HTML entrypoint not served");
 const html=readFileSync(join(dir,"index.html"),"utf8");
 const scripts=[...html.matchAll(/<script[^>]+src="(\/admin\/[^"]+)"[^>]*>/gi)].map(m=>m[1]);
 assert.ok(scripts.length,"No Admin entry module found");
 const visited=new Set(),queue=[...scripts];
 while(queue.length){
  const url=queue.pop();
  if(visited.has(url))continue;
  visited.add(url);
  const entry=routes.get(url);
  assert.ok(entry,"Browser module is not served: "+url);
  assert.match(entry.mime,/^(?:text|application)\/javascript\b/,"Invalid JavaScript MIME: "+url);
  const abs=join(dir,entry.file);
  assert.ok(existsSync(abs),"Static module file missing: "+entry.file);
  const code=readFileSync(abs,"utf8");
  // Browser code uses static ESM imports; follow every dependency recursively.
  for(const match of code.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)){
   queue.push(posix.resolve(posix.dirname(url),match[1]));
  }
 }
 assert.ok(visited.has("/admin/deployment-poll.mjs"),"Receipt polling must load in the browser");
});
