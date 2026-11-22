export function assetRouteCards(assets,eligibleRoutes){
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
  const complete=routes.filter(route=>route.status==="deployed").length;
  const open=complete<routes.length;
  const status=!open?"deployed":
   routes.some(route=>route.status!=="not-deployed")?"partial":"not-deployed";
  return [{asset,routes,complete,open,status}];
 });
}
export function matchesAssetRouteCard({asset,routes,status,open},filter,query){
 const matches=filter==="all"||(filter==="open"?open:status===filter);
 return matches&&[asset.name,asset.symbol,asset.key,asset.canonicalChain,
  ...routes.flatMap(route=>[route.source,route.destination])]
  .join(" ").toLowerCase().includes(query);
}
