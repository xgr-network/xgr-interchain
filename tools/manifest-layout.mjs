// Canonical filesystem model shared by catalog, admin, onboarding and recorder.
// Only a verified mainnet receipt may populate deployments/. Missing files mean
// not deployed; they are not placeholders to manufacture positive status.
import {existsSync,readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";
const SLUG=/^[a-z][a-z0-9-]*$/;
const SYMBOL=/^[A-Z][A-Z0-9]{0,15}$/;
const ID=/^0x[0-9a-f]{64}$/i;
const ROUTE=/^0x[0-9a-f]{64}$/i;
const read=(root,p)=>JSON.parse(readFileSync(join(root,p),"utf8"));
export function chainConfigPath(name){
 if(!SLUG.test(name))throw Error("Invalid chain slug");
 return "config/chains/"+name+"/chain.json";
}
export function chainBootstrapPath(name){
 if(!SLUG.test(name))throw Error("Invalid chain slug");
 return "config/chains/"+name+"/bootstrap.json";
}
export function chainDeploymentPath(name){
 if(!SLUG.test(name))throw Error("Invalid chain slug");
 return "deployments/chains/"+name+".json";
}
export function assetConfigFolder(key,assetId){
 if(!SYMBOL.test(key)||!ID.test(assetId))throw Error("Invalid asset folder identity");
 return "config/assets/"+assetId.slice(2,4).toLowerCase()+"/"+key;
}
export function assetDeploymentFolder(key,assetId){
 if(!SYMBOL.test(key)||!ID.test(assetId))throw Error("Invalid asset deployment identity");
 return "deployments/assets/"+assetId.slice(2,4).toLowerCase()+"/"+key;
}
export function listAssetFolders(root){
 const base=join(root,"config/assets"),items=[],seen=new Set();
 for(const shard of readdirSync(base,{withFileTypes:true})){
  if(!shard.isDirectory())continue;
  if(!/^[0-9a-f]{2}$/.test(shard.name))throw Error("Invalid asset shard: "+shard.name);
  for(const entry of readdirSync(join(base,shard.name),{withFileTypes:true})){
   if(!entry.isDirectory())continue;
   const path="config/assets/"+shard.name+"/"+entry.name;
   const asset=read(root,path+"/asset.json");
   if(asset.asset!==entry.name||!ID.test(asset.assetId||"")||
      assetConfigFolder(entry.name,asset.assetId)!==path)
    throw Error("Asset directory does not match its canonical ID: "+path);
   if(seen.has(entry.name))throw Error("Duplicate token directory: "+entry.name);
   seen.add(entry.name);
   items.push({key:entry.name,assetId:asset.assetId,path,asset});
  }
 }
 return items.sort((a,b)=>a.key.localeCompare(b.key));
}
export function loadChainDeployment(root,chain){
 const path=chainDeploymentPath(chain.name);
 if(!existsSync(join(root,path)))return {
  schemaVersion:1,kind:"infrastructure-deployment",network:"mainnet",
  chain:chain.name,chainId:chain.chainId,domainId:chain.domainId,
  xitaV315:{schemaVersion:1,components:{},receiptPaths:[]},present:false
 };
 const value=read(root,path);
 return {...value,present:true};
}
export function loadAssetDeployment(root,key,assetId){
 const base=assetDeploymentFolder(key,assetId);
 const representationsPath=base+"/representations.json";
 const representationRecord=existsSync(join(root,representationsPath))?read(root,representationsPath):null;
 const routesDir=base+"/routes";
 const routeRecords=[];
 if(existsSync(join(root,routesDir)))for(const entry of readdirSync(join(root,routesDir),{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith(".json"))throw Error("Unexpected route entry in "+routesDir);
  const route=read(root,routesDir+"/"+entry.name);
  if(!ROUTE.test(route.routeId||"")||entry.name!==route.routeId.slice(2).toLowerCase()+".json")
   throw Error("Deployment route filename != routeId: "+entry.name);
  routeRecords.push(route);
 }
 const receiptPaths=[
  ...(representationRecord?.representations||[]).map(x=>x.receiptPath),
  ...routeRecords.flatMap(x=>x.receiptPaths||[])
 ];
 if(receiptPaths.some(x=>typeof x!=="string")||new Set(receiptPaths).size!==receiptPaths.length)
  throw Error("Duplicate or invalid asset deployment receipt reference: "+key);
 return {
  schemaVersion:3,kind:"asset-deployment",network:"mainnet",asset:key,assetId,
  sourceManifest:assetConfigFolder(key,assetId)+"/asset.json",
  receiptPaths:receiptPaths.sort(),
  representations:representationRecord?.representations||[],
  routeDeployments:routeRecords.sort((a,b)=>a.routeId.localeCompare(b.routeId)),
  present:Boolean(representationRecord||routeRecords.length)
 };
}
