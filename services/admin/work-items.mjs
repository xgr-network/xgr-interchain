// Generic read-only execution graph derived only from approved main.
export function buildWorkItems(inventory,infrastructure){
 const chains=new Map(infrastructure.map(c=>[c.name,c]));
 const items=[];
 for(const chain of infrastructure){
  const core=Boolean(chain.hyperlane.mailbox&&chain.hyperlane.merkleTreeHook);
  for(const part of chain.components){
   if(part.status==="documented")continue;
   const blockers=[];
   if(!core)blockers.push("Hyperlane Mailbox/Hook nicht dokumentiert");
   const previous=chain.components.slice(0,chain.components.indexOf(part));
   if(previous.some(p=>p.status!=="documented"))blockers.push("Vorherige Chain-Komponenten fehlen");
   blockers.push("Verifizierter Build und Wallet-Transaktions-Executor fehlen");
   items.push({kind:"chain",id:chain.name+":"+part.key,chain:chain.name,
    title:chain.name+" / "+part.key,status:"blocked",reason:blockers.join("; "),component:part.key});
  }
 }
 for(const asset of Object.values(inventory.assets)){
  for(const route of asset.routes){
   if(route.status==="deployed")continue;
   const missing=[route.source,route.destination].filter(n=>chains.get(n)?.status!=="documented");
   items.push({kind:"route",id:asset.key+":"+route.name,asset:asset.key,assetId:asset.assetId,
    title:asset.key+" / "+route.source+" → "+route.destination,chain:route.source,
    status:"blocked",reason:missing.length?"Chain-Infrastruktur fehlt: "+missing.join(", "):
      "Router/Gateway-Factory-Transaktionen und BLS-Gegenstellenprüfung ausstehend"});
  }
 }
 return items;
}
