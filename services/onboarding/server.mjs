import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {loadCatalog} from "../../tools/validate-manifests.mjs";
import {buildManifestBundle} from "./manifests.mjs";
const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const REPO="xgr-network/xgr-interchain";
const reply=(res,status,data)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data));};
async function readBody(req){
 if(!req.headers["content-type"]?.startsWith("application/json"))throw Error("JSON required");
 let bytes=0,body="";
 for await(const block of req){bytes+=block.length;if(bytes>480000)throw Error("Payload too large");body+=block.toString("utf8");}
 return JSON.parse(body);
}
async function github(path,method="GET",body,token=process.env.XITA_JOIN_WRITER_TOKEN){
 if(!token)throw Error("Writer credential not configured");
 const response=await fetch("https://api.github.com/repos/"+REPO+path,{
  method,signal:AbortSignal.timeout(12000),cache:"no-store",
  headers:{"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Authorization":"Bearer "+token,"Content-Type":"application/json"},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 if(!response.ok)throw Error("GitHub rejected request ("+response.status+")");
 return response.json();
}
export async function publishDraft(bundle,{expectedMain,githubCall=github}={}){
 if(!/^[0-9a-f]{40}$/.test(expectedMain||""))throw Error("Invalid Git revision");
 const head=await githubCall("/git/ref/heads/main");
 if(head.object?.sha!==expectedMain)throw Error("Main changed; request new preview");
 const base=await githubCall("/git/commits/"+expectedMain);
 const entries=[];
 for(const [path,content] of Object.entries(bundle.files)){
  if(path!=="apps/web/catalog.json"&&!path.startsWith("config/assets/"+bundle.key+"/")&&path!=="deployments/mainnet/assets/"+bundle.key+".json")
   throw Error("Unsafe path");
  if(path!=="apps/web/catalog.json"){
   // If an asset has already been admitted since the preview, the server
   // requires another manifest validation against the CURRENT checkout.
   const file=await githubCall("/contents/"+path+"?ref=main").catch(e=>{
    if(e.message.includes("(404)"))return null;
    throw e;
   });
   if(file)throw Error("Asset manifest already exists");
  }
  entries.push({path,mode:"100644",type:"blob",content});
 }
 if(bundle.logo){
  const blob=await githubCall("/git/blobs","POST",{content:bundle.logo.base64,encoding:"base64"});
  entries.push({path:bundle.logo.path,mode:"100644",type:"blob",sha:blob.sha});
 }
 const branch="alliance/"+bundle.key.toLowerCase()+"-"+randomUUID().slice(0,8);
 const tree=await githubCall("/git/trees","POST",{base_tree:base.tree.sha,tree:entries});
 const commit=await githubCall("/git/commits","POST",{message:"onboard: propose "+bundle.key,tree:tree.sha,parents:[expectedMain]});
 await githubCall("/git/refs","POST",{ref:"refs/heads/"+branch,sha:commit.sha});
 const pr=await githubCall("/pulls","POST",{title:"Join XITA: "+bundle.summary.name+" ("+bundle.key+")",head:branch,base:"main",draft:true,
  body:"Public directory proposal. No approval, deployment or live bridge implied. Verify canonical ERC-20 contract and review token representations before merging."});
 return {number:pr.number,url:pr.html_url,status:"draft"};
}
export async function handleJoin(req,res,{submit=publishDraft}={}){
 const path=new URL(req.url,"http://localhost").pathname;
 if(req.method==="GET"&&path==="/api/xita/join/status")
  return reply(res,200,{ok:true,available:false,note:"Public PR submissions need verified identity and operator configuration"});
 if(req.method!=="POST"||!["/api/xita/join/preview","/api/xita/join/submit"].includes(path))return reply(res,404,{ok:false});
 try{
  const input=await readBody(req),bundle=buildManifestBundle(input,loadCatalog(root));
  if(path.endsWith("/preview"))return reply(res,200,{ok:true,summary:bundle.summary,files:Object.keys(bundle.files),assetId:bundle.assetId});
  // A public endpoint must NOT accept a shared secret pasted into the website.
  // Until a signed GitHub/OAuth or wallet ownership session is installed,
  // submissions are intentionally disabled, even with a GitHub writer token.
  return reply(res,503,{ok:false,error:"Verified project identity required. Export the application draft for review."});
 }catch(error){return reply(res,422,{ok:false,error:String(error.message||error).slice(0,180)})}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 createServer((req,res)=>{void handleJoin(req,res)}).listen(Number(process.env.XITA_JOIN_PORT||4090),"127.0.0.1");
}
