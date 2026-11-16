import test from "node:test";
import assert from "node:assert/strict";
import {approvedRPC,finalityTag,probeProvider,probeChainProviders,summarizeProviders} from "./rpc-provider-health.mjs";

const bsc={name:"bsc",chainId:56,rpcUrls:[
 "https://bsc-rpc.publicnode.com","https://bsc.drpc.org","https://bnb.api.onfinality.io/public"]};
const hex=x=>"0x"+x.toString(16);
function fakeFetcher({status=200,invalidFinalityHosts=[],rateLimitedHosts=[],sourceBlock=99}={}){
 const seen=[];
 const fetcher=async(url,options)=>{
  const host=new URL(url).host,body=JSON.parse(options.body);
  seen.push({host,method:body.method,params:body.params});
  if(rateLimitedHosts.includes(host))return {ok:false,status:429};
  let result=body.method==="eth_chainId"?"0x38":
   body.method==="eth_getBlockByNumber"?
    invalidFinalityHosts.includes(host)?null:{number:hex(sourceBlock),hash:"0x"+"a".repeat(64)}:
   body.method==="eth_blockNumber"?hex(sourceBlock+10):null;
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result})};
 };
 return {fetcher,seen};
}
test("catalog-only RPC URL validation; never forwards injected credentials",()=>{
 assert.equal(approvedRPC("https://bsc-rpc.publicnode.com").operator,"PublicNode");
 assert.equal(approvedRPC("https://bsc.drpc.org").operator,"dRPC");
 assert.equal(approvedRPC("https://bnb.api.onfinality.io/public").operator,"OnFinality");
 for(const bad of ["http://example.org","https://name:secret@bsc.drpc.org",
  "https://bsc.drpc.org/?token=secret","https://bsc.drpc.org/#x"])
  assert.equal(approvedRPC(bad),null);
});
test("each configured BSC provider is tested with native finalized head",async()=>{
 const {fetcher,seen}=fakeFetcher();
 const value=await probeChainProviders(bsc,{fetcher,cacheMs:0});
 assert.equal(value.providers.length,3);
 assert.equal(value.reachable,3);
 assert.equal(value.possibleOperators,3);
 assert.equal(value.state,"ok");
 assert.equal(value.sourceWitness,"not-checked");
 assert.equal(value.providers.every(v=>v.finalityTag==="finalized"),true);
 assert.equal(seen.filter(v=>v.method==="eth_getBlockByNumber").length,3);
 assert.equal(seen.filter(v=>v.method==="eth_getBlockByNumber")
  .every(v=>v.params[0]==="finalized"),true);
});
test("one working operator cannot claim healthy readiness",async()=>{
 const {fetcher}=fakeFetcher({invalidFinalityHosts:["bsc.drpc.org"],
  rateLimitedHosts:["bnb.api.onfinality.io"]});
 const v=await probeChainProviders(bsc,{fetcher,cacheMs:0});
 assert.equal(v.state,"degraded");
 assert.equal(v.possibleOperators,1);
 assert.equal(v.providers[1].state,"unavailable");
 assert.equal(v.providers[2].state,"rate-limited");
});
test("different URLs from one operator cannot satisfy two-operator gate",()=>{
 const v=summarizeProviders("test",56,[{operator:"A",state:"ok",finalityHead:123},
  {operator:"A",state:"ok",finalityHead:123},{operator:"B",state:"unavailable"}]);
 assert.equal(v.possibleOperators,1);
 assert.equal(v.state,"degraded");
});
test("XGR latest is a chain-availability probe, not an independent source witness",()=>{
 assert.equal(finalityTag(1643),"latest");
 assert.equal(finalityTag(42161),"safe");
 const s=summarizeProviders("xgrchain",1643,[{operator:"XGR",state:"ok",finalityHead:12}]);
 assert.equal(s.state,"ok");
 assert.equal(s.sourceWitness,"not-checked");
});
