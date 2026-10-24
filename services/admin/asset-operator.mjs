// XITA asset transaction coordinator: same wallet, durable journal and
// append-only verified GitHub evidence as chain infrastructure deployments.
// Registered gateway is immediately enabled; transfers remain BLS-secured.
import {resolve,join} from "node:path";
import {readFileSync} from "node:fs";
import {loadChainDeployment} from "../../tools/manifest-layout.mjs";
import {assertCurrentMain,approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {nextAssetRouteTasks,factoryRouteDraft} from "./route-factory-draft.mjs";
import {deploymentIntents} from "./deployment-intents.mjs";
import {persistWalletBroadcastHash,observeCommittedWalletTransaction} from "./deployment-wallet-transaction.mjs";
import {queueDeploymentSync} from "./deployment-auto-sync.mjs";
import {verifyPrepared} from "./prepared-override.mjs";
import {resumeInterruptedDeployments} from "./deployment-auto-resume.mjs";
import {trustedBuild,verifyRuntimeTemplate} from "./trusted-artifacts.mjs";
import {simulateChainDraft} from "./chain-transaction-draft.mjs";
import {publishDeploymentBatch,deploymentReceiptPath} from "./deployment-ledger.mjs";
import {rpcCall} from "./inspector.mjs";
import {selector,keccak256} from "../../apps/web/keccak.mjs";
import {encodeAbi} from "./abi-encoder.mjs";
const ADDR=/^0x[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i,H32=/^0x[0-9a-f]{64}$/i;
const equal=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
import {isVerifiedRouterCreator} from "./wallet-executor.mjs";
const trustedWalletActor=(chain,caller,wallet)=>isVerifiedRouterCreator(chain.chainId,caller,wallet);
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
 // Recover an already mined, but never GitHub-documented Factory router.
 // A Factory CREATE2 call with the same wallet/salt otherwise reverts during gas estimate.
 async function recoverExistingRouter({taskId,wallet}){
  const ctx=await context(taskId),{task,asset,chain,chainInfra,commit,inventory}=ctx;
  if(task.kind!=="router")return null;
  const factory=chainInfra.components.find(x=>x.key==="factory"&&x.status==="documented")?.address;
  if(!liveAddr(factory))return null;
  const proof=loadChainDeployment(root,chain).xitaV315?.components?.factory;
  if(!proof?.receiptPath)return null;
  const factoryReceipt=JSON.parse(readFileSync(join(root,proof.receiptPath),"utf8"));
  if(!equal(factoryReceipt.address,factory)||!Number.isSafeInteger(factoryReceipt.blockNumber))
   throw Error("Factory deployment proof does not match approved manifest");
  const url=chain.rpcUrls[0];
  if(BigInt(await rpc(url,"eth_chainId",[]))!==BigInt(chain.chainId))
   throw Error("Router recovery RPC chain mismatch");
  const current=BigInt(await rpc(url,"eth_blockNumber",[]));
  const topic=keccak256("RouterDeployed(bytes32,address,address)");
  const walletTopic="0x"+"0".repeat(24)+wallet.slice(2).toLowerCase();
  const events=[];
  for(let from=BigInt(factoryReceipt.blockNumber);from<=current;from+=1800n){
   const to=from+1799n>current?current:from+1799n;
   const logs=await rpc(url,"eth_getLogs",[{address:factory,
    fromBlock:"0x"+from.toString(16),toBlock:"0x"+to.toString(16),
    topics:[topic,asset.assetId,null,walletTopic]}]);
   if(!Array.isArray(logs))throw Error("Invalid RouterDeployed event query");
   events.push(...logs.filter(x=>x?.removed!==true&&equal(x.address,factory)&&
    equal(x.topics?.[0],topic)&&equal(x.topics?.[1],asset.assetId)&&
    equal(x.topics?.[3],walletTopic)));
   if(events.length>1)throw Error("Multiple matching routers; operator review required");
  }
  if(events.length!==1)return null;
  const event=events[0],router=wordAddress(event.topics[2]),txHash=event.transactionHash;
  if(!liveAddr(router)||!TX.test(txHash||""))throw Error("Invalid recovered router identity");
  const receipt=await rpc(url,"eth_getTransactionReceipt",[txHash]);
  if(!receipt||BigInt(receipt.status)!==1n||!equal(receipt.transactionHash,txHash)||
     !equal(receipt.from,wallet)||!equal(receipt.blockHash,event.blockHash)||
     BigInt(receipt.blockNumber)!==BigInt(event.blockNumber)||
     !(receipt.logs||[]).some(l=>equal(l.address,factory)&&
      equal(l.transactionHash,txHash)&&equal(l.topics?.[0],topic)&&
      equal(l.topics?.[1],asset.assetId)&&equal(l.topics?.[2],event.topics[2])&&
      equal(l.topics?.[3],walletTopic)))
   throw Error("Recovered router does not have canonical wallet Factory receipt");
  const assetIdentity=await view(rpc,url,factory,"assetIdForRouter(address)",["address"],[router]);
  const creator=wordAddress(await view(rpc,url,factory,"routerCreator(address)",["address"],[router]));
  if(!equal(assetIdentity,asset.assetId)||!equal(creator,wallet))
   throw Error("Recovered router asset or creator mismatch");
  const representation=asset.representations.find(x=>x.chain===chain.name);
  if(!representation||representation.action!=="deploy-once")return null;
  const artifacts=await build(root,commit),artifact=artifacts.artifacts[representation.component];
  if(!artifact)throw Error("Router artifact missing from pinned build");
  const runtime=verifyRuntimeTemplate(artifact,await rpc(url,"eth_getCode",[router,"latest"]));
  const out=await publish(root,[{sourceCommit:commit,chain:chain.name,asset:asset.asset,
   routeName:null,component:representation.component,contractAddress:router,
   txHash,expectedRuntimeKeccak256:runtime,expectedDeployer:wallet,
   provenance:{kind:"factory-router",factory,assetId:asset.assetId}}],{rpc});
  if(!/^[0-9a-f]{40}$/i.test(out.commit||""))throw Error("Router receipt not published");
  const path=deploymentReceiptPath({kind:"xita-v315-deployment-receipt",chain:chain.name,
   transactionHash:txHash,address:router});
  const j=journal(inventory.chains);
  const id=chain.name+":"+asset.asset+":"+representation.component+":none";
  const saved=j.read().entries[id];
  // A mined Factory event supersedes stale prepared/submitted WAL metadata.
  // The exact old intent is retired only AFTER the immutable GitHub receipt exists.
  if(saved)j.documentRecovered(id,saved.createdAt,path);
  let autoSyncQueued=false;
  try{queueDeploymentSync(stateDir,out.commit);autoSyncQueued=true}
  catch(e){console.error("Recovered router sync:",String(e.message||e))}
  return {stage:"documented",address:router,txHash,receiptPath:path,commit:out.commit,
   automaticallyRecovered:true,checkoutUpdateRequired:true,autoSyncQueued};
 }
 async function draft({taskId,wallet}, {reserve=false}={}){
  if(!ADDR.test(wallet||""))throw Error("Wallet required");
  const ctx=await context(taskId),{task,asset,chain,infrastructure,chainInfra,commit,inventory}=ctx;
  const j=journal(inventory.chains);
  const routeName=task.kind==="gateway"?task.id.slice(asset.asset.length+1).replace(/:register$/,""):null;
  const id=chain.name+":"+asset.asset+":"+(task.kind==="router"?
   asset.representations.find(x=>x.chain===chain.name)?.component:"gateway")+":"+(routeName||"none");
  // Only GitHub-recorded representations and routes govern new deployments.
  if(task.blockers.length)throw Error("Other deployments required: "+task.blockers.join(", "));
  if(task.status!=="ready-for-independent-validation")throw Error("Task dependencies incomplete");
  const source=chain;
  const r=asset.routes.find(x=>x.kind==="route-register"&&
    (task.kind==="gateway"?x.name===routeName:x.source===chain.name));
  const other=r?.destination||asset.routes.find(x=>x.kind==="route-register"&&x.destination===chain.name)?.source;
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
    representation,action:"deploy-router",chains:inventory.chains});
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
   if(!trustedWalletActor(chain,wordAddress(creator),wallet))throw Error("Wallet or its approved Base executor must be the source Router creator");
   wordAddress(sourceToken);const destToken=wordAddress(destinationToken);
   // Live on-chain source registry rejects duplicate preparation.
   const prepared=await view(rpc,url,factory,"routeForDomainRegistered(address,uint32)",
    ["address","uint32"],[r.router,destination.domainId]);
   if(BigInt(prepared)!==0n)throw Error("Route already registered on source Factory");
   transaction=factoryRouteDraft({asset,source,destination,
    sourceInfrastructure:chainInfra,destinationInfrastructure:destInfra,
    route:{...r,destinationToken:destToken},action:"register-route"}).transaction;
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
  return {...facts,transaction:entry.transaction,createdAt:entry.createdAt};
 }
 async function preview(args){
  try{
   const d=await draft(args);
   return {id:d.id,asset:d.asset,chain:d.chain,component:d.component,
    routeName:d.routeName,simulation:d.simulation,mode:"read-only-verified-gas"};
  }catch(error){
   if(!/RPC error: execution reverted/i.test(String(error.message||error)))throw error;
   const {task,asset,chain}=await context(args.taskId);
   if(task.kind!=="router")throw error;
   // No publication or wallet action on preview; prepare verifies the event.
   return {id:task.id,asset:asset.asset,chain:chain.name,
    mode:"verify-existing-router",simulation:null};
  }
 }
 async function prepare(args){
  let d;
  try{d=await draft(args,{reserve:true});}
  catch(error){
   if(!/RPC error: execution reverted/i.test(String(error.message||error)))throw error;
   const recovered=await recoverExistingRouter(args);
   if(recovered)return recovered;
   throw error;
  }
  return {id:d.id,chainId:d.chainId,chain:d.chain,component:d.component,
   transaction:d.transaction,createdAt:d.createdAt,simulation:d.simulation,mode:"await-wallet-confirmation"};
 }
 async function hash({id,txHash}){
  if(!TX.test(txHash||""))throw Error("Invalid transaction hash");
  const inventory=approvedWorkInventory(root),j=journal(inventory.chains),entry=j.read().entries[id];
  if(!entry?.asset)throw Error("Unknown asset wallet intent");
  // EIP-1193 hash is committed immediately, even if the RPC has not
  // indexed it. Reconciliation independently verifies exact input and nonce.
  if(!inventory.chains.some(x=>x.chainId===entry.chainId))
   throw Error("Asset wallet intent chain no longer approved");
  return persistWalletBroadcastHash({journal:j,id,txHash});
 }
 async function reconcile({id}){
  const main=await mainCheck(root),inventory=approvedWorkInventory(root);
  const j=journal(inventory.chains),entry=j.read().entries[id];
  if(!entry?.asset)throw Error("Unknown asset intent");
  if(!["submitted","confirmed"].includes(entry.stage))
   throw Error("Wallet broadcast unknown; check nonce/hash without resending");
  // Main may advance during finality. Compare immutable artifact bytes below.
  const chain=inventory.chains.find(x=>x.chainId===entry.chainId),url=chain.rpcUrls[0];
  const observed=await observeCommittedWalletTransaction({rpc,url,entry});
  if(observed.pending)return {stage:"pending",reason:observed.reason,txHash:entry.txHash};
  // Deployed asset receipt is considered only after full sender, chain,
  // nonce, value, target and calldata match the persisted wallet intent.
  const receipt=await rpc(url,"eth_getTransactionReceipt",[entry.txHash]);
  if(!receipt)return {stage:"pending",reason:"receipt",txHash:entry.txHash};
  if(BigInt(receipt.status)!==1n)throw Error("Transaction reverted; manual inspection required");
  const head=await rpc(url,"eth_blockNumber",[]);
  if(BigInt(head)<BigInt(receipt.blockNumber)||
     BigInt(head)-BigInt(receipt.blockNumber)+1n<BigInt(chain.confirmations||1))
   return {stage:"pending",reason:"confirmations",txHash:entry.txHash};
  const built=await build(root,main);
  const artifact=built.artifacts[entry.id.split(":")[2]];
  if(!artifact||artifact.artifactHash!==entry.artifactHash||
     (main===entry.sourceCommit&&artifact.buildHash!==entry.buildHash))
   throw Error("Trusted build differs from original signed intent");
  const factory=entry.factory;
  const gateway=entry.id.split(":")[2]==="gateway";
  const address=eventAddresses(receipt,factory,gateway?
   "RouteRegistered(bytes32,address,address)":"RouterDeployed(bytes32,address,address)",gateway?3:2);
  if(!liveAddr(address))throw Error("Factory created zero contract address");
  const inputs=[];
  async function append(component,contractAddress,provenance){
   const a=built.artifacts[component];
   if(!a)throw Error("Missing pinned artifact: "+component);
   // Latest state only: public RPCs are not required to expose archived state.
    // The canonical receipt, factory event and immutable runtime template are
    // authenticated separately; deployment time is a receipt datum.
    const code=await rpc(url,"eth_getCode",[contractAddress,"latest"]);
   const runtime=verifyRuntimeTemplate(a,code);
   inputs.push({sourceCommit:main,chain:chain.name,asset:entry.asset,
    routeName:gateway?entry.routeName:null,component,contractAddress,
    txHash:entry.txHash,expectedRuntimeKeccak256:runtime,
    expectedDeployer:entry.wallet,provenance});
  }
  if(!gateway){
   const assetOnChain=await view(rpc,url,factory,"assetIdForRouter(address)",["address"],[address]);
   const creator=wordAddress(await view(rpc,url,factory,"routerCreator(address)",["address"],[address]));
   if(!equal(assetOnChain,entry.assetId)||!trustedWalletActor(chain,creator,entry.wallet))
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
  // The published GitHub commit is authoritative. Never run git pull inside
  // the read-only Admin service; a later manage.sh update syncs the checkout.
  const path=deploymentReceiptPath({kind:"xita-v315-deployment-receipt",chain:chain.name,
   transactionHash:entry.txHash,address});
  j.document(id,path);
  let autoSyncQueued=false;
  try{queueDeploymentSync(stateDir,result.commit);autoSyncQueued=true;}
  catch(error){console.error("XITA asset sync needs attention:",String(error.message||error));}
  return {stage:"documented",address,txHash:entry.txHash,receiptPath:path,
    activation:"permissionless-registered",commit:result.commit,checkoutUpdateRequired:true,autoSyncQueued};
 }
 async function cancelPrepared({id,createdAt}){
  const all=approvedWorkInventory(root);
  const j=journal(all.chains);
  const e=j.read().entries[id];
  if(!e||e.createdAt!==createdAt||e.stage!=="prepared")
   throw Error("Only exact prepared draft can be cancelled");
  const chain=all.chains.find(c=>c.chainId===e.chainId);
  if(!chain)throw Error("Unknown chain");
  await mainCheck(root);
  await verifyPrepared({entry:e,chain,rpc});
  return j.cancelPrepared(id,createdAt);
 }
 async function resume({asset}){
  const all=approvedWorkInventory(root);
  if(!Object.hasOwn(all.assets,asset||""))throw Error("Unapproved deployment asset");
  const infrastructure=infrastructureInventory(root,all.chains);
  const {graph,tasks}=nextAssetRouteTasks(all,infrastructure);
  const selected=graph.assets.find(a=>a.asset===asset);
  const outstanding=new Set(tasks.filter(t=>t.asset===asset).map(task=>{
   const representation=selected?.representations.find(x=>x.chain===task.chain);
   const component=task.kind==="gateway"?"gateway":representation?.component;
   if(!component)throw Error("Missing approved router representation");
   const route=task.kind==="gateway"
    ?task.id.slice(asset.length+1).replace(/:register$/,""):"none";
   return task.chain+":"+asset+":"+component+":"+route;
  }));
  return resumeInterruptedDeployments({
   journal:journal(all.chains),chains:all.chains,rpc,reconcile,
   // Already published router/route receipts are authoritative. The task
   // planner no longer lists these, even if an old WAL entry survived.
   include:entry=>entry.asset===asset&&outstanding.has(entry.id)
  });
 }
 const status=()=>journal(approvedWorkInventory(root).chains).read();
 return {preview,prepare,hash,reconcile,cancelPrepared,resume,status};
}
