import test from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";

// This must remain executable even if a badly configured private key happens
// to exist in the parent process. The isolated preview worker must IGNORE it.
process.env.XITA_INTERCHAIN_PREVIEW_ONLY="1";
process.env.XITA_INTERCHAIN_FEE_PRIVATE_KEY="NOT_A_PRIVATE_KEY";
const {handler}=await import("./server.mjs");

async function response(method,url,body=""){
 const req=Readable.from(body?[body]:[]);
 req.method=method;req.url=url;
 const data={status:null,headers:null,body:null};
 const res={
  writeHead(status,headers){data.status=status;data.headers=headers;},
  end(value){data.body=JSON.parse(value)}
 };
 await handler(req,res);
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
