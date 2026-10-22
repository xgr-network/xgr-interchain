#!/usr/bin/env node
// Verified ILN route catalog recovery when a source registry's Solidity
// activationBlock() uses L1 block.number (Arbitrum), not the L2 RPC height.
// This utility NEVER rewrites discovery cursors, sends a transaction,
// constructs a signing payload, or bypasses canonical route validation.
// Requires a stopped XGR validator for --apply; restart loads this hint and
// checks the same canonical on-chain source Registry again.
import {readFile,mkdir,writeFile,rename,stat,unlink} from "node:fs/promises";
import {resolve,join} from "node:path";
import {randomBytes} from "node:crypto";
import {fileURLToPath} from "node:url";
import {JsonRpcProvider,Contract,Interface,getAddress} from "ethers";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const ADDR=/^0x[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i;
const ILN=new Interface(["event RouteAdded(uint32 indexed destinationDomain,bytes32 indexed routeId,address indexed gateway,address sourceRouter,address destinationRouter,uint256 validatorFeeWei,uint64 nonce)","function getRoute(uint32,bytes32) view returns (uint64,uint32,address,address,address,address,address,uint256,bool)"]);
export function checkedRoute({catalog,source,route,registryReceipt,routeReceipt,chainID,event,onchain}){
 const info=catalog?.chains?.[source],registry=catalog?.infrastructure?.[source]?.xitaV315?.components?.sourceRegistry;
 const dst=catalog?.chains?.[route?.destination];
 if(!info||!registry||!dst||chainID!==info.chainId||!ADDR.test(registry.address)||
   !TX.test(registryReceipt?.transactionHash)||!TX.test(routeReceipt?.transactionHash)||
   registryReceipt.status!==1||routeReceipt.status!==1||
   Number(registryReceipt.blockNumber)!==Number(onchain.registryBlock)||
   !onchain.registryCode||onchain.registryCode==="0x"||
   Number(routeReceipt.blockNumber)<=Number(registryReceipt.blockNumber)||
   Number(routeReceipt.blockNumber)>Number(onchain.head)||
   !event||!onchain.record||!onchain.record.enabled)
  throw Error("Canonical registry/route deployment verification failed");
 const compare=(x,y)=>String(x).toLowerCase()===String(y).toLowerCase();
 if(!compare(event.routeId,route.routeId)||Number(event.destinationDomain)!==dst.domainId||
   !compare(event.gateway,route.gateway)||
   !compare(event.sourceRouter,route.sourceRouter)||
   !compare(event.destinationRouter,route.destinationRouter)||
   Number(onchain.record.sourceChainId)!==info.chainId||
   Number(onchain.record.sourceDomain)!==info.domainId||
   !compare(onchain.record.gateway,route.gateway)||
   !compare(onchain.record.sourceRouter,route.sourceRouter)||
   !compare(onchain.record.destinationRouter,route.destinationRouter)||
   !ADDR.test(onchain.record.mailbox)||!ADDR.test(onchain.record.merkleTreeHook)||
   BigInt(onchain.record.fee)<=0n)throw Error("Source registry route identity or fee mismatch");
 return {sourceNetwork:source,sourceDomain:info.domainId,
  destinationDomain:dst.domainId,routeId:route.routeId.toLowerCase(),
  gateway:route.gateway.toLowerCase()};
}
async function main(){
 const args=process.argv.slice(2),value=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:null};
 const source=value("--source"),dataDir=value("--data-dir"),apply=args.includes("--apply");
 if(!/^[a-z][a-z0-9-]{0,30}$/.test(source||"")||!dataDir||!dataDir.startsWith("/")||
   (args.length!==(apply?5:4))||args.some(a=>a==="--replace"))
  throw Error("Usage: node tools/verify-iln-route-catalog.mjs --source arbitrum --data-dir /absolute/validator/datadir [--apply]");
 const catalog=JSON.parse(await readFile(join(root,"apps/web/catalog.json"),"utf8"));
 const infrastructure=catalog.infrastructure?.[source]?.xitaV315,registry=infrastructure?.components?.sourceRegistry;
 const info=catalog.chains?.[source];if(!info||!registry)throw Error("Source infrastructure not documented");
 const registryReceipt=JSON.parse(await readFile(join(root,registry.receiptPath),"utf8"));
 if(registryReceipt.component!=="sourceRegistry"||registryReceipt.chain!==source||
  registryReceipt.address.toLowerCase()!==registry.address.toLowerCase())
  throw Error("Incorrect receipt for source registry");
 const {deployedRoutes}=await import("../apps/web/route-availability.js");
 const routes=deployedRoutes(catalog).filter(r=>r.source===source);
 const provider=new JsonRpcProvider(info.rpcUrls[0],info.chainId,{staticNetwork:true});
 const chainID=Number((await provider.getNetwork()).chainId);
 const head=await provider.getBlockNumber();
 const chainRegistry=new Contract(registry.address,ILN,provider);
 const registryCode=await provider.getCode(registry.address);
 const registryTx=await provider.getTransactionReceipt(registryReceipt.transactionHash);
 const found=[];
 for(const route of routes){
  const deployment=(catalog.assets?.[route.asset]?.deployment?.routeDeployments||[]).find(
   r=>r.routeName===route.name&&r.routeId.toLowerCase()===route.routeId.toLowerCase());
  if(!deployment)throw Error("Documented route receipt missing");
  const receipt=JSON.parse(await readFile(join(root,deployment.components.gateway.receiptPath),"utf8"));
  const tx=await provider.getTransactionReceipt(receipt.transactionHash);
  const logs=tx?.logs?.filter(log=>log.address.toLowerCase()===registry.address.toLowerCase())||[];
  const events=[];
  for(const log of logs){try{const parsed=ILN.parseLog(log);if(parsed?.name==="RouteAdded")events.push({
   destinationDomain:Number(parsed.args.destinationDomain),routeId:parsed.args.routeId,
   gateway:parsed.args.gateway,sourceRouter:parsed.args.sourceRouter,
   destinationRouter:parsed.args.destinationRouter});}catch{}}
  const event=events.find(e=>e.routeId.toLowerCase()===route.routeId.toLowerCase());
  const raw=await chainRegistry.getRoute(catalog.chains[route.destination].domainId,route.routeId);
  const record={sourceChainId:raw[0],sourceDomain:raw[1],gateway:raw[2],
   sourceRouter:raw[3],mailbox:raw[4],merkleTreeHook:raw[5],
   destinationRouter:raw[6],fee:raw[7],enabled:raw[8]};
  const hint=checkedRoute({catalog,source,route,registryReceipt:registryTx,routeReceipt:tx,
   chainID,event,onchain:{registryBlock:registryReceipt.blockNumber,registryCode,head,record}});
  found.push(hint);
 }
 console.log(JSON.stringify({status:apply?"verified":"verified-dry-run",source,
  registryBlock:registryReceipt.blockNumber,head,routes:found},null,2));
 if(!apply)return;
 const directory=join(dataDir,"interchain","iln","route-catalog",source);
 await mkdir(directory,{recursive:true,mode:0o770});
 for(const hint of found){
  const name=hint.destinationDomain+"-"+hint.routeId.slice(2)+".json",file=join(directory,name);
  const body=JSON.stringify(hint);
  try{
   const present=await readFile(file,"utf8");
   if(present!==body)throw Error("Conflicting catalog file: "+file);
   continue;
  }catch(e){if(e.code!=="ENOENT")throw e}
  const tmp=file+".tmp-"+process.pid+"-"+randomBytes(4).toString("hex");
  try{await writeFile(tmp,body,{encoding:"utf8",mode:0o660,flag:"wx"});await rename(tmp,file)}
  finally{await unlink(tmp).catch(()=>{})}
 }
 console.log("Verified route discovery hints installed; restart ONLY this validator and check xgr_getILNIndexerStatus.");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(err=>{console.error("ERROR:",err.message);process.exitCode=1});
}
