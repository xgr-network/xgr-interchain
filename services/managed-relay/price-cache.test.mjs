import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {PRICE_CACHE_KIND,readCachedGasPrices,refreshGasPriceCache} from "./price-cache.mjs";
const now=Date.UTC(2026,9,22,7,30),sec=Math.floor(now/1000);
const body=(age=0)=>({ethereum:{usd:2500,eur:2200,last_updated_at:sec-age},
 xgr:{usd:0.0001,eur:0.00009,last_updated_at:sec-age},
 "polygon-ecosystem-token":{usd:0.35,eur:0.31,last_updated_at:sec-age}});
test("one backend refresh persists one shared quote-safe snapshot",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"xita-price-")),path=join(dir,"prices.json");
 try{
  let requests=0;
  const fetcher=async(url)=>{requests++;assert.match(url,/simple\/price/);
   assert.match(url,/ethereum/);return {ok:true,json:async()=>body()}};
  const updated=await refreshGasPriceCache({path,now,fetcher});
  assert.equal(requests,1);
  assert.equal(updated.coins.length,3);
  const saved=JSON.parse(await readFile(path,"utf8"));
  assert.equal(saved.kind,PRICE_CACHE_KIND);
  assert.equal(saved.prices.ethereum.eur,2200);
  assert.equal((await readCachedGasPrices({path,now:now+5*60000})).ethereum.usd,2500);
  assert.equal((await readCachedGasPrices({path,now:now+5*60000})).ethereum.eur,2200);
  await assert.rejects(()=>readCachedGasPrices({path,now:now+16*60000}),/stale/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test("CoinGecko HTTP 503 never erases a good cached snapshot",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"xita-price-")),path=join(dir,"prices.json");
 try{
  await refreshGasPriceCache({path,now,fetcher:async()=>({ok:true,json:async()=>body()})});
  const before=await readFile(path,"utf8");
  await assert.rejects(()=>refreshGasPriceCache({path,now:now+120000,
   fetcher:async()=>({ok:false,status:503})}),/HTTP 503/);
  assert.equal(await readFile(path,"utf8"),before);
  assert.ok((await readCachedGasPrices({path,now:now+120000})).xgr);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test("partial refresh keeps only independent timestamp-valid coins",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"xita-price-")),path=join(dir,"prices.json");
 try{
  await refreshGasPriceCache({path,now,fetcher:async()=>({ok:true,json:async()=>body()})});
  await refreshGasPriceCache({path,now:now+180000,fetcher:async()=>({
   ok:true,json:async()=>({ethereum:{usd:2550,last_updated_at:sec+180}})
  })});
  const r=await readCachedGasPrices({path,now:now+180000});
  assert.equal(r.ethereum.usd,2550);assert.equal(r.xgr.usd,0.0001);
 }finally{await rm(dir,{recursive:true,force:true})}
});
