// Passive BSC diagnostics only. No RPC requests, keys, hashes, amounts or
// public endpoints are created by the meter. All output stays in service logs.
const PROVIDERS=Object.freeze({
 "bsc-rpc.publicnode.com":"publicnode",
 "public.1rpc.io":"1rpc",
 "bsc.drpc.org":"drpc",
 "bnb.api.onfinality.io":"onfinality"
});
const WINDOW_MS=5*60*1000;
const safeMethod=method=>/^eth_[A-Za-z0-9]{1,48}$/.test(method||"")?method:"other";
const labelProvider=url=>{
 try{return PROVIDERS[new URL(url).hostname.toLowerCase()]||"other";}
 catch{return "other";}
};
export function createBscRpcUsage({component,now=Date.now,emit=console.log,
 windowMs=WINDOW_MS}={}){
 if(typeof component!=="string"||!/^[a-z][a-z0-9-]{1,48}$/.test(component)||
   typeof now!=="function"||typeof emit!=="function"||
   !Number.isSafeInteger(windowMs)||windowMs<1000)
  throw Error("Invalid passive RPC meter");
 let began=now(),attempts=0;
 const aggregate=new Map();
 function flush(end=now()){
  if(!attempts){began=end;return null;}
  const data={kind:"xita-bsc-rpc-usage-v1",component,chainId:56,
   from:new Date(began).toISOString(),to:new Date(end).toISOString(),
   attempts,breakdown:[...aggregate.values()].sort((a,b)=>
    a.provider.localeCompare(b.provider)||a.method.localeCompare(b.method))};
  emit("[xita-rpc-usage] "+JSON.stringify(data));
  aggregate.clear();attempts=0;began=end;
  return data;
 }
 function record({chainId,url,method,httpStatus=null,ok=false}){
  if(Number(chainId)!==56)return;
  const t=now();
  if(attempts&&t-began>=windowMs)flush(t);
  if(!attempts)began=t;
  const provider=labelProvider(url),rpcMethod=safeMethod(method);
  const key=provider+"|"+rpcMethod;
  if(!aggregate.has(key))aggregate.set(key,{provider,method:rpcMethod,
   attempts:0,ok:0,http429:0,http403:0,http5xx:0,rpcError:0,networkError:0});
  const row=aggregate.get(key);
  row.attempts++;attempts++;
  if(ok)row.ok++;
  else if(httpStatus===429)row.http429++;
  else if(httpStatus===403)row.http403++;
  else if(Number.isInteger(httpStatus)&&httpStatus>=500)row.http5xx++;
  else if(httpStatus===null)row.networkError++;
  else row.rpcError++;
 }
 return {record,flush};
}
// One already-planned HTTP request is observed, never duplicated. In
// particular, do not clone or consume the response body or inspect calldata.
export async function meteredPublicRead({read,fetcher,usage,chainId,url,method,params}){
 let attempted=false,httpStatus=null;
 const wrapped=async(...args)=>{
  attempted=true;
  const response=await fetcher(...args);
  if(Number.isInteger(response?.status))httpStatus=response.status;
  return response;
 };
 try{
  const result=await read(url,method,params,wrapped);
  if(attempted)usage?.record({chainId,url,method,httpStatus,ok:true});
  return result;
 }catch(error){
  if(attempted)usage?.record({chainId,url,method,httpStatus,ok:false});
  throw error;
 }
}
