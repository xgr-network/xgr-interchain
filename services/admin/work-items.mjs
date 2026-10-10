// Generic read-only execution graph derived only from approved main.
export function buildWorkItems(inventory,infrastructure,bootstrap=[]){
 const chains=new Map(infrastructure.map(c=>[c.name,c]));
 const items=[];
 const planByChain=new Map(bootstrap.map(p=>[p.chain,p]));
 for(const chain of infrastructure){
  const core=Boolean(chain.hyperlane.mailbox&&chain.hyperlane.merkleTreeHook);
  for(const part of chain.components){
   if(part.status==="documented")continue;
   const blockers=[];
   if(!core)blockers.push("Hyperlane Mailbox/Hook nicht dokumentiert");
   const previous=chain.components.slice(0,chain.components.indexOf(part));
   if(previous.some(p=>p.status!=="documented"))blockers.push("Vorherige Chain-Komponenten fehlen");
   const plan=planByChain.get(chain.name);
   if(part.key==="validatorRegistry"&&plan&&!plan.ready)blockers.push(...plan.missing);
   blockers.push("Verifizierter Build und Wallet-Transaktions-Executor fehlen");
   items.push({kind:"chain",id:chain.name+":"+part.key,chain:chain.name,
    title:chain.name+" / "+part.key,status:"blocked",reason:blockers.join("; "),component:part.key});
  }
 }
 for(const plan of bootstrap){
  items.push({kind:"validator-bootstrap",id:plan.chain+":validator-bootstrap",chain:plan.chain,
   title:plan.chain+" / Validator-PoP & Reserve",status:"blocked",reason:plan.ready?"On-chain Validation und Wallet-Executor ausstehend":plan.missing.join("; ")});
  items.push({kind:"fee-bootstrap",id:plan.chain+":source-fee",chain:plan.chain,
   title:plan.chain+" / Source-Chain-Gebühr",status:"blocked",reason:plan.proposedFeeWei?("Initiale Fee "+plan.proposedFeeWei+" Wei: Factory-Konstruktor und Registry-Verifikation ausstehend (kein Quorum)"):"Source-Chain-Fee in config/bootstrap fehlt"});
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
