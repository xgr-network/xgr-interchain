import {createServer} from "node:http";
import {readFile, mkdir} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";

const root=fileURLToPath(new URL(".",import.meta.url));
const output=resolve(process.argv[2]||"artifacts/xita-universe.png");
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,"http://127.0.0.1").pathname;
 if(path.startsWith("/api/")){res.writeHead(503,{"Content-Type":"application/json"});res.end("{}");return;}
 const target=["/","/universe","/markets"].includes(path)?"index.html":path.slice(1);
 const full=resolve(root,target);
 if(!full.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}
 try{const file=await readFile(full);res.writeHead(200,{"Content-Type":types[extname(full)]||"application/octet-stream"});res.end(file);}
 catch{if(!res.headersSent){res.writeHead(404);res.end();}}
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
try{
 await mkdir(resolve(output,".."),{recursive:true});
 const chrome=process.env.XITA_BROWSER||"chromium";
 const args=["--headless","--no-sandbox","--disable-dev-shm-usage",
 "--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader","--disable-background-timer-throttling",
 "--window-size=1600,1450","--hide-scrollbars","--virtual-time-budget=1000",
 "--screenshot="+output,"http://127.0.0.1:"+server.address().port+"/universe"];
 await new Promise((ok,fail)=>{
  const proc=spawn(chrome,args,{stdio:["ignore","ignore","pipe"]});
  let errors="";
  proc.stderr.on("data",part=>errors+=part.toString());
  const timer=setTimeout(()=>{proc.kill();fail(new Error("Chromium screenshot timeout"))},40000);
  proc.on("error",e=>{clearTimeout(timer);fail(e)});
  proc.on("close",code=>{clearTimeout(timer);code===0?ok():fail(new Error("Chromium screenshot failed: "+errors.slice(-1800)))});
 });
 console.log("Screenshot ready: "+output);
}finally{await new Promise(ok=>server.close(ok));}
