// XITA asset transaction coordinator: same wallet, durable journal and
// append-only verified GitHub evidence as chain infrastructure deployments.
// Prepared gateway is NOT an active BLS-confirmed route.
import {resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {assertCurrentMain,approvedWorkInventory,checkedLocalMain} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {nextAssetRouteTasks,factoryRouteDraft} from "./route-factory-draft.mjs";
import {deploymentIntents} from "./deployment-intents.mjs";
import {trustedBuild,verifyRuntimeTemplate} from "./trusted-artifacts.mjs";
import {simulateChainDraft} from "./chain-transaction-draft.mjs";
import {publishDeploymentBatch,deploymentReceiptPath} from "./deployment-ledger.mjs";
import {rpcCall} from "./inspector.mjs";
import {selector,keccak256} from "../../apps/web/keccak.mjs";
import {encodeAbi} from "./abi-encoder.mjs";
const ADDR=/^0x[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i,H32=/^0x[0-9a-f]{64}$/i;
const equal=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const liveAddr=a=>ADDR.test(a||"")&&!/^0x0{40}$/i.test(a);
function wordAddress(data){
 if(!H32.test(data||"")||BigInt(data)>=1n<<160n)throw Error("Invalid on-chain address getter");
 return "0x"+BigInt(data).toString(16).padStart(40,"0");
}
async function view(rpc,url,address,signature,types=[],values=[]){
 return rpc(url,"eth_call",[{to:address,data:selector(signature)+encodeAbi(types,values).slice(2)},"latest"]);
}
async function checkRuntime(rpc,url,addr,artifact){
 const code=await rpc(url,"eth_getCode",[addr,"latest"]);
 return verifyRuntimeTemplate(artifact,code);
}
function eventAddresses(receipt,factory,signature,index){
 const found=(receipt.logs||[]).filter(l=>equal(l.address,factory)&&
  equal(l.topics?.[0],keccak256(signature)));
 if(found.length!==1||!H32.test(found[0].topics?.[index]||""))
  throw Error("Missing or ambiguous authenticated Factory event");
 return wordAddress(found[0].topics[index]);
}
function safeComponent(task){return task.kind==="router"?
  task.id.endsWith(":representation")?"router":"router":"gateway";}
export function createAssetOperator({root,stateDir,rpc=rpcCall,mainCheck=assertCurrentMain,
 build=trustedBuild,publish=publishDeploymentBatch}){
 const journal=chains=>deploymentIntents({directory:resolve(stateDir,"wallet-intents"),chains});
 async function context(taskId){
  const commit=await mainCheck(root),inventory=approvedWorkInventory(root);
  const infrastructure=infrastructureInventory(root,inventory.chains);
  const {graph,tasks}=nextAssetRouteTasks(inventory,infrastructure);
  const task=tasks.find(t=>t.id===taskId);
  if(!task)throw Error("Route or router already documented, invalid or no longer configured");
  const asset=graph.assets.find(x=>x.asset===task.asset);
  const chain=inventory.chains.find(x=>x.name===task.chain);
  if(!asset||!chain)throw Error("Unknown configured Asset/Chain");
  const chainInfra=infrastructure.find(x=>x.name===chain.name);
  return {commit,inventory,infrastructure,graph,task,asset,chain,chainInfra};
 }
 async function draft({taskId,wallet}, {reserve=false}={}){
  if(!ADDR.test(wallet||""))throw Error("Wallet required");
  const ctx=await context(taskId),{task,asset,chain,infrastructure,chainInfra,commit,inventory}=ctx;
  const j=journal(inventory.chains);
  const routeName=task.kind==="gateway"?task.id.slice(asset.asset.length+1).replace(/:prepare$/,""):null;
  const id=chain.name+":"+asset.asset+":"+(task.kind==="router"?
   asset.representations.find(x=>x.chain===chain.name)?.component:"gateway")+":"+(routeName||"none");
  if(j.read().entries[id])throw Error("Existing asset transaction must be recovered, never broadcast twice");
  if(task.blockers.length)throw Error("Other deployments required: "+task.blockers.join(", "));
  if(task.status!=="ready-for-independent-validation")throw Error("Task dependencies incomplete");
  const source=chain;
  const r=asset.routes.find(x=>x.kind==="route-prepare"&&
    (task.kind==="gateway"?x.name===routeName:x.source===chain.name));
  const other=r?.destination||asset.routes.find(x=>x.kind==="route-prepare"&&x.destination===chain.name)?.source;
  const destination=inventory.chains.find(x=>x.name===other);
  if(!destination)throw Error("Canonical hub counterpart missing");
  const destInfra=infrastructure.find(x=>x.name===destination.name);
  const url=chain.rpcUrls[0],remoteUrl=destination.rpcUrls[0];
  const [a,b]=await Promise.all([rpc(url,"eth_chainId",[]),rpc(remoteUrl,"eth_chainId",[])]);
  if(BigInt(a)!==BigInt(chain.chainId)||BigInt(b)!==BigInt(destination.chainId))
   throw Error("Source/destination RPC chain identity mismatch");
  const factory=chainInfra.components.find(x=>x.key==="factory")?.address;
  const srcRegistry=chainInfra.components.find(x=>x.key==="sourceRegistry")?.address;
  if(!liveAddr(factory)||!liveAddr(srcRegistry))throw Error("Missing verified Factory or Registry");
  const factRegistry=wordAddress(await view(rpc,url,factory,"registry()"));
  if(!equal(factRegistry,srcRegistry))throw Error("Factory points to different on-chain Registry");
  const artifactSet=await build(root,commit);
  let transaction;
  if(task.kind==="router"){
   const representation=asset.representations.find(x=>x.chain===chain.name);
   if(!representation||representation.action!=="deploy-once")throw Error("Router already deployed");
   const d=factoryRouteDraft({asset,source,destination,
    sourceInfrastructure:chainInfra,destinationInfrastructure:destInfra,
    representation,action:"deploy-router"});
   transaction=d.transaction;
  }else{
   if(!r?.routeId||!liveAddr(r.router)||!liveAddr(r.remoteRouter)||r.gateway)
    throw Error("Both proven Router addresses must exist before route preparation");
   const [localId,remoteId,creator,sourceToken,destinationToken]=await Promise.all([
    view(rpc,url,factory,"assetIdForRouter(address)",["address"],[r.router]),
    view(rpc,remoteUrl,destInfra.components.find(x=>x.key==="factory").address,
     "assetIdForRouter(address)",["address"],[r.remoteRouter]),
    view(rpc,url,factory,"routerCreator(address)",["address"],[r.router]),
    view(rpc,url,r.router,"token()"),
    view(rpc,remoteUrl,r.remoteRouter,"token()")
   ]);
   if(!equal(localId,asset.assetId)||!equal(remoteId,asset.assetId))
    throw Error("Router's on-chain asset identity does not match canonical catalog");
   if(!equal(wordAddress(creator),wallet))throw Error("Wallet must be the source Router creator");
   wordAddress(sourceToken);const destToken=wordAddress(destinationToken);
   // Live on-chain source registry rejects duplicate preparation.
   const prepared=await view(rpc,url,factory,"routeForDomainPrepared(address,uint32)",
    ["address","uint32"],[r.router,destination.domainId]);
   if(BigInt(prepared)!==0n)throw Error("Route already prepared on source Factory");
   transaction=factoryRouteDraft({asset,source,destination,
    sourceInfrastructure:chainInfra,destinationInfrastructure:destInfra,
    route:{...r,destinationToken:destToken},action:"prepare-route"}).transaction;
  }
  const prepared={chain:chain.name,chainId:chain.chainId,component:task.kind==="router"?"router":"gateway",
   transaction};
  const simulation=await simulateChainDraft(prepared,{rpc,url,from:wallet});
  const facts={id,taskId,asset:asset.asset,assetId:asset.assetId,routeName,
   chain:chain.name,chainId:chain.chainId,factory,commit,
   component:task.kind==="router"?
    asset.representations.find(x=>x.chain===chain.name).component:"gateway",
   routeId:task.kind==="gateway"?r.routeId:null,
   wallet,
   simulation:{gasEstimateWei:simulation.gasEstimateWei,gasLimit:simulation.gasLimit,
    gasPriceWei:simulation.gasPriceWei,totalWorstCaseWei:simulation.totalWorstCaseWei},
   artifactSet,transaction:simulation.transaction};
  if(!reserve)return facts;
  const nonce=await rpc(url,"eth_getTransactionCount",[wallet,"pending"]);
  if(!/^0x[0-9a-f]+$/i.test(nonce||""))throw Error("Invalid pending wallet nonce");
  const entry=j.prepare({id,chainId:chain.chainId,sourceCommit:commit,wallet,
   buildHash:artifactSet.artifacts[facts.component].buildHash,
   artifactHash:artifactSet.artifacts[facts.component].artifactHash,
   parameters:{},asset:asset.asset,assetId:asset.assetId,routeName,routeId:facts.routeId,
   factory,validatorSnapshot:null,
   transaction:{...simulation.transaction,nonce}});
  return {...facts,transaction:entry.transaction};
 }
 async function preview(args){
  const d=await draft(args);
  return {id:d.id,asset:d.asset,chain:d.chain,component:d.component,
   routeName:d.routeName,simulation:d.simulation,mode:"read-only-verified-gas"};
 }
 async function prepare(args){
  const d=await draft(args,{reserve:true});
  return {id:d.id,chainId:d.chainId,chain:d.chain,component:d.component,
   transaction:d.transaction,simulation:d.simulation,mode:"await-wallet-confirmation"};
 }
 async function hash({id,txHash}){
  if(!TX.test(txHash||""))throw Error("Invalid transaction hash");
  const inventory=approvedWorkInventory(root),j=journal(inventory.chains),entry=j.read().entries[id];
  if(!entry?.asset)throw Error("Unknown asset wallet intent");
  const chain=inventory.chains.find(x=>x.chainId===entry.chainId);
  const tx=await rpc(chain.rpcUrls[0],"eth_getTransactionByHash",[txHash]);
  if(!tx||!equal(tx.from,entry.wallet)||!equal(tx.input,entry.transaction.data)||
     !equal(tx.to,entry.transaction.to)||BigInt(tx.value)!==BigInt(entry.transaction.value)||
     BigInt(tx.nonce)!==BigInt(entry.transaction.nonce))
   throw Error("Signed transaction does not match immutable asset intent");
  return j.attachHash(id,txHash);
 }
 async function reconcile({id}){
  const main=await mainCheck(root),inventory=approvedWorkInventory(root);
  const j=journal(inventory.chains),entry=j.read().entries[id];
  if(!entry?.asset)throw Error("Unknown asset intent");
  if(entry.stage==="documented")return {stage:"documented",receiptPath:entry.receiptPath};
  if(!["submitted","confirmed"].includes(entry.stage))
   throw Error("Wallet broadcast unknown; check nonce/hash without resending");
  if(main!==entry.sourceCommit)
   throw Error("GitHub main changed; reconcile existing confirmed receipts manually, never resubmit");
  const chain=inventory.chains.find(x=>x.chainId===entry.chainId),url=chain.rpcUrls[0];
  const tx=await rpc(url,"eth_getTransactionByHash",[entry.txHash]);
  if(!tx||!equal(tx.from,entry.wallet)||!equal(tx.input,entry.transaction.data)||
     !equal(tx.to,entry.transaction.to)||BigInt(tx.nonce)!==BigInt(entry.transaction.nonce))
   throw Error("On-chain asset transaction differs from persisted intent");
  const receipt=await rpc(url,"eth_getTransactionReceipt",[entry.txHash]);
  if(!receipt)throw Error("Transaction not confirmed; retry reconciliation without broadcast");
  if(BigInt(receipt.status)!==1n)throw Error("Transaction reverted; manual inspection required");
  const built=await build(root,entry.sourceCommit);
  const artifact=built.artifacts[entry.id.split(":")[2]];
  if(!artifact||artifact.buildHash!==entry.buildHash||artifact.artifactHash!==entry.artifactHash)
   throw Error("Trusted build differs from original signed intent");
  const factory=entry.factory;
  const gateway=entry.id.split(":")[2]==="gateway";
  const address=eventAddresses(receipt,factory,gateway?
   "RoutePrepared(bytes32,address,address)":"RouterDeployed(bytes32,address,address)",gateway?3:2);
  if(!liveAddr(address))throw Error("Factory created zero contract address");
  const inputs=[];
  async function append(component,contractAddress,provenance){
   const a=built.artifacts[component];
   if(!a)throw Error("Missing pinned artifact: "+component);
   const code=await rpc(url,"eth_getCode",[contractAddress,"0x"+BigInt(receipt.blockNumber).toString(16)]);
   const runtime=verifyRuntimeTemplate(a,code);
   inputs.push({sourceCommit:entry.sourceCommit,chain:chain.name,asset:entry.asset,
    routeName:gateway?entry.routeName:null,component,contractAddress,
    txHash:entry.txHash,expectedRuntimeKeccak256:runtime,
    expectedDeployer:entry.wallet,provenance});
  }
  if(!gateway){
   const assetOnChain=await view(rpc,url,factory,"assetIdForRouter(address)",["address"],[address]);
   const creator=wordAddress(await view(rpc,url,factory,"routerCreator(address)",["address"],[address]));
   if(!equal(assetOnChain,entry.assetId)||!equal(creator,entry.wallet))
    throw Error("Factory router identity or origin wallet mismatch");
   await append(entry.id.split(":")[2],address,{kind:"factory-router",factory,assetId:entry.assetId});
  }else{
   const routeId=await view(rpc,url,address,"routeId()");
   if(!equal(routeId,entry.routeId))throw Error("Prepared Gateway does not match directed route ID");
   const vault=wordAddress(await view(rpc,url,address,"feeVault()"));
   if(!liveAddr(vault))throw Error("Gateway FeeVault absent");
   const vaultGateway=wordAddress(await view(rpc,url,vault,"gateway()"));
   const vaultRoute=await view(rpc,url,vault,"routeId()");
   if(!equal(vaultGateway,address)||!equal(vaultRoute,entry.routeId))
    throw Error("FeeVault is not immutably bound to Gateway/route");
   await append("gateway",address,{kind:"factory-gateway",factory,routeId:entry.routeId});
   await append("feeVault",vault,{kind:"factory-feevault",factory,routeId:entry.routeId,gateway:address});
  }
  if(entry.stage==="submitted")j.confirm(id,entry.txHash,{contractAddress:address,
   runtimeKeccak:inputs[0].expectedRuntimeKeccak256});
  const result=await publish(root,inputs,{rpc});
  if(!/^[0-9a-f]{40}$/i.test(result.commit||""))throw Error("Receipt publication not confirmed");
  if(checkedLocalMain(root)!==entry.sourceCommit)throw Error("Main changed during receipt publication");
  execFileSync("git",["pull","--ff-only","origin","main"],{
   cwd:root,encoding:"utf8",timeout:30000,maxBuffer:524288});
  if(checkedLocalMain(root)!==result.commit.toLowerCase())throw Error("Checkout differs from published receipt commit");
  const path=deploymentReceiptPath({kind:"xita-v315-deployment-receipt",chain:chain.name,
   transactionHash:entry.txHash,address});
  j.document(id,path);
  return {stage:"documented",address,txHash:entry.txHash,receiptPath:path,
    activation:"pending-BLS-safety-attestation"};
 }
 const status=()=>journal(approvedWorkInventory(root).chains).read();
 return {preview,prepare,hash,reconcile,status};
}
