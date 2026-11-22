const ROUTERS=new Set(["nativeRouter","syntheticRouter","collateralRouter"]);

export function assetRouteCards(assets,eligibleRoutes,assetTasks){
 const routesByAsset=new Map();
 for(const route of eligibleRoutes){
  const names=routesByAsset.get(route.asset)??new Set();
  names.add(route.name);
  routesByAsset.set(route.asset,names);
 }
 return Object.values(assets).flatMap(asset=>{
  const names=routesByAsset.get(asset.key);
  if(!names)return [];
  const routes=asset.routes.filter(route=>names.has(route.name));
  if(!routes.length)return [];
  const routesByTask=new Map(routes.map(route=>[asset.key+":"+route.name+":register",route]));
  const tasks=assetTasks.filter(task=>task.asset===asset.key).map(task=>
   ({...task,route:routesByTask.get(task.id)}));
  const routers=Object.values(asset.representations).flatMap(rep=>
   rep.deployedContracts.filter(record=>ROUTERS.has(record.component)).map(record=>
    ({chain:rep.chain,component:record.component,address:record.address})));
  const gateways=routes.flatMap(route=>route.instances.filter(instance=>
   instance.status==="deployed"&&instance.gateway&&instance.feeVault).map(instance=>
    ({route,gateway:instance.gateway,feeVault:instance.feeVault})));
  const complete=routes.filter(route=>route.status==="deployed").length;
  const status=complete===routes.length?"deployed":
   routes.some(route=>route.status!=="not-deployed")?"partial":"not-deployed";
  return [{asset,routeCount:routes.length,complete,status,tasks,routers,gateways}];
 });
}

export function filterAssetRouteCards(cards,filter,query){
 const q=query.trim().toLowerCase();
 const matches=(...fields)=>fields.some(field=>field?.toLowerCase().includes(q));
 return cards.flatMap(card=>{
  const {asset}=card;
  const assetMatch=matches(asset.name,asset.symbol,asset.key);
  const chainMatches=(...chains)=>assetMatch||matches(...chains);
  const tasks=filter==="deployed"?[]:card.tasks.filter(task=>
   (filter!=="partial"||task.route?.status==="partial")&&
   chainMatches(task.chain,task.route?.source,task.route?.destination));
  const showDocumented=filter==="all"||filter==="deployed";
  const routers=showDocumented?card.routers.filter(router=>chainMatches(router.chain)):[];
  const gateways=showDocumented?card.gateways.filter(({route})=>
   chainMatches(route.source,route.destination)):[];
  if(!tasks.length&&!routers.length&&!gateways.length)return [];
  return [{...card,tasks,routers,gateways,
   showBatch:tasks.length>0&&tasks.length===card.tasks.length}];
 });
}
