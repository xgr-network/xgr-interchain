// Test-only synthetic deployment catalog. Never inherit real deployment receipts
// from a moving mainnet catalog; no fake on-chain deployment is published.
import {readFileSync} from "node:fs";
const hex=(n,width)=>"0x"+BigInt(n).toString(16).padStart(width,"0");
const receiptHash="0x"+"e".repeat(64);
const roleKeys=["factory","sourceRegistry","mailbox","ism","validatorRegistry"];

export function freshDeployedCatalog({
  names=["xgrchain","base"],routeDestination=null,reverseRoute=false
}={}){
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 // Reset ONLY deployment evidence, retaining the real asset/chain plans.
 // Mainnet deployments evolve independently of these isolated synthetic receipts.
 for(const infra of Object.values(catalog.infrastructure||{})){
  if(!infra?.xitaV315)continue;
  infra.present=false;
  infra.xitaV315.components={};
  infra.xitaV315.receiptPaths=[];
 }
 for(const asset of Object.values(catalog.assets||{})){
  if(!asset?.deployment)continue;
  asset.deployment.present=false;
  asset.deployment.representations=[];
  asset.deployment.routeDeployments=[];
  asset.deployment.receiptPaths=[];
 }
 const receipts=new Map();
 let next=100;
 const record=(chain,component)=>{
  const address=hex(++next,40);
  const transactionHash=hex(++next,64);
  const receiptPath="deployments/receipts/"+chain+"/"+transactionHash.slice(2)+"-"+address.slice(2)+".json";
  const row={address,runtimeCodeKeccak256:receiptHash,receiptPath};
  receipts.set(receiptPath,{kind:"xita-v315-deployment-receipt",network:"mainnet",
   status:"onchain-deployment-verified",component,chain,
   chainId:catalog.chains[chain].chainId,transactionHash,
   address,runtimeCodeKeccak256:receiptHash});
  return row;
 };
 const readReceipt=path=>{
  if(!receipts.has(path))throw Error("Test deployment receipt unavailable");
  return structuredClone(receipts.get(path));
 };
 for(const name of names){
  const infra=catalog.infrastructure[name];
  if(!infra||!catalog.chains[name])throw Error("Unknown test chain "+name);
  infra.present=true;
  infra.xitaV315.components={};
  infra.xitaV315.receiptPaths=[];
  for(const key of [...roleKeys,"executionGateway"]){
   const row=record(name,key);
   infra.xitaV315.components[key]=row;
   infra.xitaV315.receiptPaths.push(row.receiptPath);
  }
 }
 if(routeDestination){
  if(!names.includes("xgrchain")||!names.includes(routeDestination))
   throw Error("Direct test route requires both deployed chains");
  const source="xgrchain",target=routeDestination;
  const xgr=catalog.assets.XGR;
  const sr=record(source,"nativeRouter"),dr=record(target,"syntheticRouter");
  const gateway=record(source,"gateway"),feeVault=record(source,"feeVault");
  const route=xgr.routes.routes.find(r=>r.sourceChain===source&&r.destinationChain===target);
  if(!route)throw Error("Test route missing from canonical route plan");
  const deployed=xgr.deployment;
  deployed.present=true;
  deployed.representations=[
   {chain:source,component:"nativeRouter",...sr},
   {chain:target,component:"syntheticRouter",...dr}
  ];
  deployed.routeDeployments=[{routeName:route.name,sourceChain:source,
   destinationChain:target,routeId:hex(++next,64),
   components:{gateway,feeVault}}];
  deployed.receiptPaths=[sr.receiptPath,dr.receiptPath,gateway.receiptPath,feeVault.receiptPath];
  if(reverseRoute){
   const reverse=xgr.routes.routes.find(r=>r.sourceChain===target&&r.destinationChain===source);
   if(!reverse)throw Error("Reverse test route missing from canonical route plan");
   const reverseGateway=record(target,"gateway"),reverseFeeVault=record(target,"feeVault");
   deployed.routeDeployments.push({routeName:reverse.name,sourceChain:target,
    destinationChain:source,routeId:hex(++next,64),
    components:{gateway:reverseGateway,feeVault:reverseFeeVault}});
   deployed.receiptPaths.push(reverseGateway.receiptPath,reverseFeeVault.receiptPath);
  }
 }
 return {catalog,readReceipt,receipts};
}
