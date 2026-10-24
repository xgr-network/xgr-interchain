import test from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {freshDeployedCatalog} from "./test-deployments.mjs";

// This must remain executable even if a badly configured private key happens
// to exist in the parent process. The isolated preview worker must IGNORE it.
process.env.XITA_INTERCHAIN_PREVIEW_ONLY="1";
process.env.XITA_INTERCHAIN_FEE_PRIVATE_KEY="NOT_A_PRIVATE_KEY";
const {handler,loadCatalogSnapshot,sourceExecutionAddressesFromCatalog}=
 await import("./server.mjs");

async function response(method,url,body="",options={}){
 const req=Readable.from(body?[body]:[]);
 req.method=method;req.url=url;
 const data={status:null,headers:null,body:null};
 const res={
  writeHead(status,headers){data.status=status;data.headers=headers;},
  end(value){data.body=JSON.parse(value)}
 };
 await handler(req,res,options);
 return data;
}
test("preview-only mode reads public catalog and answers health without a signer",async()=>{
 const r=await response("GET","/api/xita/v1/managed/health");
 assert.equal(r.status,200);
 assert.equal(r.body.ok,true);
 assert.ok(Array.isArray(r.body.enabledChains));
 assert.equal(r.body.sponsorship.available,false);
});
test("preview-only mode refuses signed quotes before even parsing a transfer",async()=>{
 const r=await response("POST","/api/xita/v1/managed/quote","{}");
 assert.equal(r.status,403);
 assert.match(r.body.error,/Signing disabled/);
 assert.equal(r.headers["cache-control"],"no-store");
});
test("unsigned preview endpoint is explicitly routed but requires a valid request",async()=>{
 const r=await response("POST","/api/xita/v1/managed/preview","{}");
 assert.equal(r.status,503);
 assert.equal(r.body.ok,false);
 assert.match(r.body.error,/Unsupported source\/destination/);
});

test("new receipt-backed Arbitrum route and adapter become visible without restarting preview service",async()=>{
 const {catalog:original}=freshDeployedCatalog({names:["xgrchain","arbitrum"],routeDestination:"arbitrum"});
 const route=deployedRoutes(original).find(r=>
  r.asset==="XGR"&&r.source==="xgrchain"&&r.destination==="arbitrum");
 assert.ok(route,"current catalog must document XGR to Arbitrum");
 const old=JSON.parse(JSON.stringify(original));
 old.assets.XGR.deployment.routeDeployments=
  old.assets.XGR.deployment.routeDeployments.filter(r=>
   !(r.sourceChain==="xgrchain"&&r.destinationChain==="arbitrum"));
 const adapter=old.infrastructure.arbitrum.xitaV315.components.executionGateway;
 assert.ok(adapter?.receiptPath);
 delete old.infrastructure.arbitrum.xitaV315.components.executionGateway;
 old.infrastructure.arbitrum.xitaV315.receiptPaths=
  old.infrastructure.arbitrum.xitaV315.receiptPaths.filter(p=>p!==adapter.receiptPath);
 const dir=mkdtempSync(join(tmpdir(),"xita-fee-live-catalog-"));
 const file=join(dir,"catalog.json");
 const opts={loadCatalog:()=>loadCatalogSnapshot(file)};
 try{
  writeFileSync(file,JSON.stringify(old));
  assert.equal(deployedRoutes(loadCatalogSnapshot(file)).some(r=>
   r.routeId===route.routeId),false);
  const before=await response("GET","/api/xita/v1/managed/health","",opts);
  assert.equal(before.status,200);
  assert.equal(before.body.enabledChains.includes("arbitrum"),false);
  // The deployment sync replaces catalog.json; same process, next request.
  writeFileSync(file,JSON.stringify(original));
  const fresh=loadCatalogSnapshot(file);
  assert.ok(deployedRoutes(fresh).some(r=>r.routeId===route.routeId));
  const after=await response("GET","/api/xita/v1/managed/health","",opts);
  assert.equal(after.status,200);
  assert.equal(after.body.enabledChains.includes("arbitrum"),true);
  assert.equal(sourceExecutionAddressesFromCatalog(fresh,{
   env:{},previewOnly:true}).arbitrum.toLowerCase(),
   original.infrastructure.arbitrum.xitaV315.components.executionGateway.address.toLowerCase());
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("adapter discovery supports any future configured chain, without editing service source",()=>{
 const config={chains:{xgrchain:{},futurechain:{}},infrastructure:{
  futurechain:{xitaV315:{components:{executionGateway:{address:"0x"+"1".repeat(40)}}}}
 }};
 const discovered=sourceExecutionAddressesFromCatalog(config,{env:{},previewOnly:true});
 assert.deepEqual(Object.keys(discovered).sort(),["futurechain","xgrchain"]);
 assert.equal(discovered.futurechain,"0x"+"1".repeat(40));
});
