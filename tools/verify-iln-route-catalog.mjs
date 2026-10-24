#!/usr/bin/env node
// Recover permissionless ILN route discovery from independently verified CURRENT
// Arbitrum registry state, without any historical receipt, log or state RPC.
// The stored discovery hint is NOT trusted by the XGR Node, which checks the
// active source registry again before adding the route to its live worker.
// Default: dry-run. --apply must only be run while this validator is stopped.
import {readFile,mkdir,writeFile,rename,unlink} from "node:fs/promises";
import {resolve,join} from "node:path";
import {randomBytes} from "node:crypto";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const require=createRequire(new URL("../services/indexer/package.json",import.meta.url));
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const match=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const fail=field=>{throw Error("ILN route verification failed: "+field)};
const assert=(ok,field)=>{if(!ok)fail(field)};
function equalInteger(actual,expected){
 try{return BigInt(actual)===BigInt(expected)}catch{return false}
}
function positive(value){try{return BigInt(value)>0n}catch{return false}}

export function checkedRoute({catalog,source,route,registryReceipt,routeReceipt,chainID,onchain}){
 const info=catalog?.chains?.[source];
 const src=catalog?.infrastructure?.[source]?.xitaV315?.components?.sourceRegistry;
 const dst=catalog?.chains?.[route?.destination];
 const deployment=(catalog?.assets?.[route?.asset]?.deployment?.routeDeployments||[]).find(
  r=>r.routeName===route?.name&&match(r.routeId,route?.routeId)&&
   r.sourceChain===source&&r.destinationChain===route.destination);
 const gateway=deployment?.components?.gateway;
 assert(Boolean(info&&src&&dst&&gateway),"documented source and destination configuration");
 assert(equalInteger(chainID,info.chainId),"RPC chainId mismatch");
 assert(ADDRESS.test(src.address||"")&&ADDRESS.test(gateway.address||"")&&
  match(gateway.address,route.gateway),"documented registry/Gateway addresses");
 assert(HASH.test(src.runtimeCodeKeccak256||"")&&HASH.test(gateway.runtimeCodeKeccak256||""),
  "missing documented runtime code hashes");
 assert(registryReceipt?.status==="onchain-deployment-verified"&&
  registryReceipt.component==="sourceRegistry"&&registryReceipt.chain===source&&
  equalInteger(registryReceipt.chainId,info.chainId)&&
  match(registryReceipt.address,src.address)&&
  match(registryReceipt.runtimeCodeKeccak256,src.runtimeCodeKeccak256)&&
  HASH.test(registryReceipt.transactionHash||"")&&
  Number.isSafeInteger(registryReceipt.blockNumber),"source Registry deployment receipt");
 assert(routeReceipt?.status==="onchain-deployment-verified"&&
  routeReceipt.component==="gateway"&&routeReceipt.chain===source&&
  equalInteger(routeReceipt.chainId,info.chainId)&&
  match(routeReceipt.address,route.gateway)&&
  match(routeReceipt.runtimeCodeKeccak256,gateway.runtimeCodeKeccak256)&&
  match(routeReceipt.provenance?.routeId,route.routeId)&&
  HASH.test(routeReceipt.transactionHash||"")&&
  Number.isSafeInteger(routeReceipt.blockNumber)&&
  routeReceipt.blockNumber>=registryReceipt.blockNumber,"Gateway deployment receipt");
 assert(Number.isSafeInteger(onchain?.head)&&
  onchain.head-routeReceipt.blockNumber+1>=Math.max(1,info.confirmations||1),
  "source route not finalized according to the current L2 head");
 assert(match(onchain?.registryCodeHash,src.runtimeCodeKeccak256),
  "Registry current runtime code hash mismatch");
 assert(match(onchain?.gatewayCodeHash,gateway.runtimeCodeKeccak256),
  "Gateway current runtime code hash mismatch");
 const record=onchain?.record;
 assert(Boolean(record?.enabled),"route not enabled in current Registry state");
 assert(equalInteger(record.sourceChainId,info.chainId),"route sourceChainId mismatch");
 assert(equalInteger(record.sourceDomain,info.domainId),"route sourceDomain mismatch");
 assert(match(record.gateway,route.gateway),"route Gateway mismatch");
 assert(match(record.sourceRouter,route.sourceRouter),"route sourceRouter mismatch");
 assert(match(record.destinationRouter,route.destinationRouter),
  "route destinationRouter mismatch");
 assert(ADDRESS.test(record.mailbox||"")&&!/^0x0{40}$/i.test(record.mailbox||""),
  "route Mailbox missing");
 assert(ADDRESS.test(record.dispatchHook||"")&&
  !/^0x0{40}$/i.test(record.dispatchHook||""),"route DispatchHook missing");
 assert(positive(record.fee),"route validator fee not positive");
 return {
  sourceNetwork:source,
  sourceDomain:info.domainId,
  destinationDomain:dst.domainId,
  routeId:route.routeId.toLowerCase(),
  gateway:route.gateway.toLowerCase()
 };
}
async function main(){
 const args=process.argv.slice(2);
 const value=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:null};
 const source=value("--source"),dataDir=value("--data-dir"),apply=args.includes("--apply");
 if(!/^[a-z][a-z0-9-]{0,30}$/.test(source||"")||!dataDir||
  !dataDir.startsWith("/")||args.length!==(apply?5:4))
  throw Error("Usage: node tools/verify-iln-route-catalog.mjs --source arbitrum --data-dir /absolute/validator/datadir [--apply]");
 // Only known options. No caller-controlled URL, address or route override.
 if(args.some((x,i)=>i%2===0&&!["--source","--data-dir","--apply"].includes(x))||
  !args.includes("--source")||!args.includes("--data-dir"))
  throw Error("Unknown route recovery argument");
 const catalog=JSON.parse(await readFile(join(root,"apps/web/catalog.json"),"utf8"));
 const info=catalog.chains?.[source];
 const registry=catalog.infrastructure?.[source]?.xitaV315?.components?.sourceRegistry;
 if(!info||!registry)throw Error("Source registry not documented in catalog");
 const registryReceipt=JSON.parse(await readFile(join(root,registry.receiptPath),"utf8"));
 const {deployedRoutes}=await import("../apps/web/route-availability.js");
 const routes=deployedRoutes(catalog).filter(r=>r.source===source);
 if(routes.length===0)throw Error("No verified deployed source routes to recover");
 // Dependencies load ONLY when CLI executes. Pure checkedRoute tests require none.
 const {JsonRpcProvider,Contract,Interface,keccak256}=require("ethers");
 const abi=new Interface([
  "function getRoute(uint32,bytes32) view returns (uint64,uint32,address,address,address,address,address,uint256,bool)"
 ]);
 const provider=new JsonRpcProvider(info.rpcUrls[0],info.chainId,{staticNetwork:true});
 // Do NOT accept the configured chain id as proof of RPC identity.
 const actualChainId=Number(BigInt(await provider.send("eth_chainId",[])));
 const head=await provider.getBlockNumber();
 const registryCode=await provider.getCode(registry.address);
 const registryCodeHash=registryCode!=="0x"?keccak256(registryCode):null;
 const contract=new Contract(registry.address,abi,provider);
 const found=[];
 for(const route of routes){
  const dep=(catalog.assets?.[route.asset]?.deployment?.routeDeployments||[]).find(
   r=>r.routeName===route.name&&match(r.routeId,route.routeId));
  if(!dep)throw Error("Missing documented route deployment for "+route.name);
  const routeReceipt=JSON.parse(await readFile(
   join(root,dep.components.gateway.receiptPath),"utf8"));
  const gatewayCode=await provider.getCode(route.gateway);
  const gatewayCodeHash=gatewayCode!=="0x"?keccak256(gatewayCode):null;
  let raw;
  try{raw=await contract.getRoute(catalog.chains[route.destination].domainId,route.routeId)}
  catch(error){throw Error("Unable to read current Registry route "+route.name+": "+
    String(error?.shortMessage||error?.message||error).slice(0,240))}
  const record={sourceChainId:raw[0],sourceDomain:raw[1],gateway:raw[2],
   sourceRouter:raw[3],mailbox:raw[4],dispatchHook:raw[5],
   destinationRouter:raw[6],fee:raw[7],enabled:raw[8]};
  const hint=checkedRoute({catalog,source,route,registryReceipt,routeReceipt,
   chainID:actualChainId,onchain:{head,registryCodeHash,gatewayCodeHash,record}});
  found.push(hint);
 }
 console.log(JSON.stringify({status:apply?"verified-for-apply":"verified-dry-run",
  source,head,routeCount:found.length,routes:found},null,2));
 if(!apply)return;
 const directory=join(dataDir,"interchain","iln","route-catalog",source);
 await mkdir(directory,{recursive:true,mode:0o770});
 for(const hint of found){
  const name=hint.destinationDomain+"-"+hint.routeId.slice(2)+".json";
  const file=join(directory,name),body=JSON.stringify(hint);
  try{
   const existing=await readFile(file,"utf8");
   if(existing!==body)throw Error("Conflicting route catalog file: "+file);
   continue;
  }catch(e){if(e.code!=="ENOENT")throw e}
  const temp=file+".tmp-"+process.pid+"-"+randomBytes(4).toString("hex");
  try{await writeFile(temp,body,{encoding:"utf8",mode:0o660,flag:"wx"});await rename(temp,file)}
  finally{await unlink(temp).catch(()=>{})}
 }
 console.log("SUCCESS: verified ILN discovery hints installed; restart only this validator and verify xgr_getILNIndexerStatus.");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(err=>{console.error("ERROR:",err.message);process.exitCode=1});
}
