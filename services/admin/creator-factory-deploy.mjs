// Exactly-once, wallet-signed deployment of the zero-constructor XGR Creator Factory.
// Separate from the ILN router factory; backend has no private key.
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,openSync,closeSync,fsyncSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {readSealedArtifacts} from "./sealed-artifacts.mjs";
import {assertCurrentMain,approvedWorkInventory} from "./main-gate.mjs";
import {rpcCall} from "./inspector.mjs";
import {keccak256} from "../../apps/web/keccak.mjs";
const A=/^0x[a-f0-9]{40}$/i,T=/^0x[a-f0-9]{64}$/i,S=/^[a-f0-9]{40}$/i,H=/^0x(?:[a-f0-9]{2})+$/i;
const same=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const shaCode=hex=>keccak256(Buffer.from(hex.slice(2),"hex"));
export function creatorFactoryArtifact(raw){
 const ctor=raw?.abi?.find(x=>x.type==="constructor");
 const init=raw?.bytecode?.object,code=raw?.deployedBytecode?.object;
 if((ctor?.inputs||[]).length||!H.test(init||"")||!H.test(code||"")||
    init.length<100||code.length<100||init.includes("__")||
    Object.values(raw?.deployedBytecode?.immutableReferences||{}).flat().length)
  throw Error("Invalid, unlinked or constructor-bearing Creator Factory artifact");
 const initSize=(init.length-2)/2,codeSize=(code.length-2)/2;
 if(initSize>49152||codeSize>24576)throw Error("Creator Factory exceeds EVM initcode/runtime limits");
 return {init,code,runtimeHash:shaCode(code)};
}
export function creatorFactoryManifest(proof){
 if(!A.test(proof?.address||"")||!T.test(proof?.deploymentTxHash||"")||
    !T.test(proof?.runtimeCodeKeccak256||""))throw Error("Unverified Creator Factory manifest");
 return {schemaVersion:1,kind:"xita-creator-factory-v1",status:"receipt-verified",
  chainId:1643,address:proof.address.toLowerCase(),
  runtimeCodeKeccak256:proof.runtimeCodeKeccak256.toLowerCase(),
  deploymentTxHash:proof.deploymentTxHash.toLowerCase()};
}
function journalPath(stateDir){return join(stateDir,"creator-factory-deploy.json");}
function readJournal(stateDir){
 try{return JSON.parse(readFileSync(journalPath(stateDir),"utf8"))}
 catch(e){if(e.code==="ENOENT")return null;throw e}
}
function writeJournal(stateDir,s){
 mkdirSync(stateDir,{mode:0o700,recursive:true});
 const f=journalPath(stateDir),tmp=f+"."+randomUUID()+".tmp";
 writeFileSync(tmp,JSON.stringify(s,null,2)+"\n",{flag:"wx",mode:0o600});
 const fd=openSync(tmp,"r");try{fsyncSync(fd)}finally{closeSync(fd)}
 renameSync(tmp,f);
 const dirFd=openSync(stateDir,"r");try{fsyncSync(dirFd)}finally{closeSync(dirFd)}
 return s;
}
function localFactory(root){
 const f=join(root,"config/creator/factory.json");
 if(!existsSync(f))return null;
 const data=JSON.parse(readFileSync(f,"utf8"));
 if(data.kind!=="xita-creator-factory-v1"||data.chainId!==1643||
    data.status!=="receipt-verified"||!A.test(data.address||""))
  throw Error("Main Creator Factory manifest invalid");
 return data;
}
export async function verifyCreatorFactoryReceipt({rpc=rpcCall,urls,txHash,init,code,wallet,confirmations=2}){
 if(!T.test(txHash||"")||!A.test(wallet||"")||!H.test(init||"")||
    !H.test(code||"")||!Array.isArray(urls)||urls.length!==2)
  throw Error("Creator Factory evidence inputs invalid");
 const expected=shaCode(code);
 const results=await Promise.all(urls.map(async url=>{
  const [chain,receipt,transaction,head]=await Promise.all([
   rpc(url,"eth_chainId",[]),rpc(url,"eth_getTransactionReceipt",[txHash]),
   rpc(url,"eth_getTransactionByHash",[txHash]),rpc(url,"eth_blockNumber",[])]);
  if(BigInt(chain)!==1643n)throw Error("Creator Factory RPC chain ID differs");
  if(!receipt||!transaction)return null;
  if(BigInt(receipt.status||0)!==1n||!same(receipt.transactionHash,txHash)||
     receipt.to!==null||transaction.to!==null||
     !same(receipt.from,wallet)||!same(transaction.from,wallet)||
     !same(transaction.hash,txHash)||!same(transaction.input??transaction.data,init)||
     BigInt(transaction.value??0)!==0n||!A.test(receipt.contractAddress||""))
   throw Error("Creator Factory transaction is not the approved wallet deployment");
  const block=BigInt(receipt.blockNumber||0);
  if(block<=0n||BigInt(head)<block+BigInt(confirmations)-1n)return null;
  const [canonical,installed]=await Promise.all([
   rpc(url,"eth_getBlockByNumber",[receipt.blockNumber,false]),
   rpc(url,"eth_getCode",[receipt.contractAddress,"latest"])]);
  if(!same(canonical?.hash,receipt.blockHash)||!same(installed,code)||
     !same(shaCode(installed||"0x"),expected))
   throw Error("Creator Factory block or deployed runtime does not match audited build");
  return {address:receipt.contractAddress.toLowerCase(),
   deploymentTxHash:txHash.toLowerCase(),runtimeCodeKeccak256:expected.toLowerCase(),
   blockNumber:Number(block),blockHash:receipt.blockHash};
 }));
 if(results.some(x=>x===null))return {phase:"pending",reason:"pending-or-insufficient-confirmations"};
 if(JSON.stringify(results[0])!==JSON.stringify(results[1]))
  throw Error("Independent XGR RPCs disagree on factory contract/receipt");
 return {phase:"verified",proof:results[0]};
}
export function creatorFactoryDeployment({root,stateDir,main=assertCurrentMain,
 rpc=rpcCall,publish,artifactForCommit=commit=>creatorFactoryArtifact(
  readSealedArtifacts(root,commit).raws.XITAStarterTokenCreator),
 factoryInMain=()=>localFactory(root)}){
 let busy=false;
 const atomic=async fn=>{if(busy)throw Error("Factory operation already in progress");
  busy=true;try{return await fn()}finally{busy=false}};
 const build=artifactForCommit;
 const check=async()=>{
  const commit=await main(root);
  if(!S.test(commit||""))throw Error("Approved GitHub main unavailable");
  const chain=approvedWorkInventory(root).chains.find(c=>c.name==="xgrchain");
  if(chain?.chainId!==1643||!Array.isArray(chain.rpcUrls)||chain.rpcUrls.length<2)
   throw Error("XGRChain needs two configured RPCs");
  const urls=chain.rpcUrls.slice(0,2);
  if(urls[0]===urls[1]||urls.some(url=>!/^https:\/\//.test(url)))
   throw Error("Two independent HTTPS XGR RPCs required");
  const ids=await Promise.all(urls.map(url=>rpc(url,"eth_chainId",[])));
  if(ids.some(id=>BigInt(id)!==1643n))throw Error("XGR RPC chain mismatch");
  return {commit,urls,artifact:build(commit)};
 };
 async function status(){
  const last=readJournal(stateDir),documented=factoryInMain();
  return {phase:documented?"documented":last?.phase||"ready",
   documented,txHash:last?.txHash||null,pr:last?.pr||null,
   createdAt:last?.createdAt||null,wallet:last?.wallet||null};
 }
 async function prepare({wallet}={}){
  return atomic(async()=>{
   if(!A.test(wallet||""))throw Error("Connect a valid EVM wallet");
   const {commit,urls,artifact}=await check();
   if(factoryInMain())throw Error("Creator Factory already deployed in main");
   const last=readJournal(stateDir);
   if(last&&!["cancelled"].includes(last.phase))
    throw Error("Existing Creator Factory intent must be reconciled, never sign a second deployment");
   const quotes=await Promise.all(urls.map(async url=>{
    const args=[{from:wallet,data:artifact.init,value:"0x0"}];
    const [estimated,price,balance]=await Promise.all([
     rpc(url,"eth_estimateGas",args),rpc(url,"eth_gasPrice",[]),
     rpc(url,"eth_getBalance",[wallet,"latest"])]);
    const gas=BigInt(estimated)*120n/100n+1n,gp=BigInt(price);
    if(gas<21000n||gas>10000000n||BigInt(balance)<gas*gp)
     throw Error("Creator Factory gas estimate, limit or wallet balance unacceptable");
    return {gas,gp};
   }));
   const pending=await Promise.all(urls.map(url=>rpc(url,"eth_getTransactionCount",[wallet,"pending"])));
   if(pending[0]!==pending[1])throw Error("XGR RPCs disagree on pending wallet nonce");
   const gas=quotes[0].gas>quotes[1].gas?quotes[0].gas:quotes[1].gas;
   const gp=quotes[0].gp>quotes[1].gp?quotes[0].gp:quotes[1].gp;
   const entry={schemaVersion:1,phase:"prepared",createdAt:new Date().toISOString(),
    sourceCommit:commit,buildHash:artifact.runtimeHash,wallet:wallet.toLowerCase(),
    txHash:null,pr:null,transaction:{from:wallet,to:null,data:artifact.init,
     value:"0x0",gas:"0x"+gas.toString(16),nonce:pending[0]}};
   writeJournal(stateDir,entry);
   return {phase:"prepared",chainId:1643,createdAt:entry.createdAt,sourceCommit:commit,
    transaction:entry.transaction,totalWorstCaseWei:(gas*gp).toString()};
  });
 }
 async function hash({txHash}={}){
  return atomic(async()=>{
   if(!T.test(txHash||""))throw Error("Invalid Factory transaction hash");
   const row=readJournal(stateDir);
   if(!row||!["prepared","submitted"].includes(row.phase)||
      (row.phase==="submitted"&&!same(row.txHash,txHash)))
    throw Error("Cannot replace a submitted Creator Factory transaction");
   writeJournal(stateDir,{...row,phase:"submitted",txHash:txHash.toLowerCase()});
   return {phase:"submitted",txHash:txHash.toLowerCase()};
  });
 }
 async function cancel({createdAt}={}){
  return atomic(async()=>{
   const row=readJournal(stateDir);
   if(row?.phase!=="prepared"||row.createdAt!==createdAt)
    throw Error("Only the exact unsigned Factory intent can be cancelled");
   writeJournal(stateDir,{...row,phase:"cancelled"});
   return {phase:"cancelled"};
  });
 }
 async function reconcile(){
  return atomic(async()=>{
   const row=readJournal(stateDir);
   if(!row||!["submitted","verified","pr-created"].includes(row.phase))
    throw Error("No Creator Factory transaction awaiting reconciliation");
   const current=await check(),documented=factoryInMain();
   if(documented)return {phase:"documented",documented};
   if(!same(current.artifact.runtimeHash,row.buildHash)||
      !same(current.artifact.init,row.transaction.data))
    throw Error("Factory artifact changed since wallet signing; manual review needed");
   let proof=row.proof;
   if(!proof){
    const result=await verifyCreatorFactoryReceipt({rpc,urls:current.urls,txHash:row.txHash,
     init:current.artifact.init,code:current.artifact.code,wallet:row.wallet});
    if(result.phase!=="verified")return result;
    proof=result.proof;
    writeJournal(stateDir,{...row,phase:"verified",proof});
   }
   if(row.pr)return {phase:"pr-created",pr:row.pr,proof};
   if(typeof publish!=="function")throw Error("Factory GitHub publisher not configured");
   const pr=await publish({manifest:creatorFactoryManifest(proof),sourceCommit:current.commit});
   if(!Number.isSafeInteger(pr?.number)||!/^https:\/\/github.com\/xgr-network\/xgr-interchain\/pull\/\d+$/.test(pr.url||""))
    throw Error("Factory publisher returned invalid PR");
   writeJournal(stateDir,{...row,phase:"pr-created",proof,pr});
   return {phase:"pr-created",pr,proof};
  });
 }
 return {status,prepare,hash,cancel,reconcile};
}
