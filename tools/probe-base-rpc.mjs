#!/usr/bin/env node
// Qualify Chainlist Base providers using actual historical methods (not just chainId).
import {pathToFileURL} from "node:url";
export const providers=[
"https://base.llamarpc.com",
"https://base.rpc.subquery.network/public",
"https://gateway.tenderly.co/public/base",
"https://base.gateway.tenderly.co",
"https://base-mainnet.public.blastapi.io",
"https://base.meowrpc.com",
"https://1rpc.io/base",
"https://base-pokt.nodies.app",
"https://base.drpc.org",
"https://base.api.onfinality.io/public",
"https://gateway.subquery.network/rpc/base",
"https://base-rpc.publicnode.com",
"https://mainnet.base.org",
"https://base.lava.build",
"https://rpcfree.com/base-rpc",
"https://base.blockpi.network/v1/rpc/public"
];
const BLOCK="0x3230b4a",FROM="0x3230ab5";
const GATEWAY="0x376a852700b5e9f965fef28380395d3d20dba0b1";
export async function rpc(url,method,params,{fetcher=fetch,ms=9000}={}){
 const r=await fetcher(url,{method:"POST",headers:{"content-type":"application/json"},
 body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(ms)});
 const d=await r.json();if(!r.ok||d.error||!Object.hasOwn(d,"result"))
  throw Error("HTTP "+r.status+" RPC "+(d.error?.code??"?")+" "+String(d.error?.message||"missing result").slice(0,130));
 return d.result;
}
export async function probe(url,options={}){
 const status={url,chain:false,historicalBlock:false,historicalLogs:false,historicalState:false,ok:false};
 try{
  if(BigInt(await rpc(url,"eth_chainId",[],options))!==8453n)throw Error("wrong chain ID");
  status.chain=true;
  const b=await rpc(url,"eth_getBlockByNumber",[BLOCK,false],options);
  if(!/^0x[0-9a-f]{64}$/i.test(b?.hash||""))throw Error("invalid historical block hash");
  status.historicalBlock=true;
  const logs=await rpc(url,"eth_getLogs",[{address:GATEWAY,fromBlock:FROM,toBlock:BLOCK}],options);
  if(!Array.isArray(logs))throw Error("historical logs not an array");
  status.historicalLogs=true;
  // XGR validator discovery scans up to 1,000 source-chain blocks per call.
  // Test that real range separately, before advertising validator readiness.
  const validatorTo="0x"+(Number.parseInt(FROM,16)+999).toString(16);
  try{
   const big=await rpc(url,"eth_getLogs",[{address:GATEWAY,fromBlock:FROM,toBlock:validatorTo}],options);
   status.validatorWindow1000=Array.isArray(big);
  }catch(error){
   status.validatorWindow1000=false;
   status.validatorError=String(error?.message||error).slice(0,140);
  }
  const c=await rpc(url,"eth_call",[{to:"0x4200000000000000000000000000000000000006",data:"0x18160ddd"},"latest"],options);
  if(!/^0x[0-9a-f]{64}$/i.test(c||""))throw Error("current state unavailable");
  status.historicalState=true;status.ok=true;
 }catch(e){status.error=String(e.message||e).slice(0,175);}
 return status;
}
export async function run(list=providers,options={}){
 const results=[];
 for(let i=0;i<list.length;i+=4)results.push(...await Promise.all(list.slice(i,i+4).map(u=>probe(u,options))));
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const results=await run();
 for(const x of results)console.log(JSON.stringify(x));
 console.log("QUALIFIED_BASE_ARCHIVE_RPC",JSON.stringify(results.filter(x=>x.ok).map(x=>x.url)));
 if(!results.some(x=>x.ok))process.exitCode=2;
}
