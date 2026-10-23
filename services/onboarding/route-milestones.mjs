// Applicant notifications use the same receipt-backed, Execution Gateway-qualified
// inventory as Transfer Tokens. Never treat a unilateral route as bidirectional.
import {executableTransferRoutes} from "../../apps/web/route-availability.js";

const HUB="xgrchain";
const ID=/^0x[0-9a-f]{64}$/i;
const pair=(source,destination)=>source+"->"+destination;
const noMilestones=()=>({firstRoute:null,allComplete:false,plannedNetworks:[],completedNetworks:[]});

export function routeMilestones(catalog,symbol,assetId,readyRoutes=executableTransferRoutes(catalog)){
 const empty=noMilestones();
 const entry=catalog?.assets?.[symbol];
 if(!ID.test(assetId||"")||!entry||
    String(entry.metadata?.assetId||"").toLowerCase()!==assetId.toLowerCase()||
    String(entry.deployment?.assetId||"").toLowerCase()!==assetId.toLowerCase()||
    entry.routes?.routingHub!==HUB||entry.routes?.protocol!=="XITA-v3.1.5")return empty;
 const origin=entry.metadata?.canonical?.chain;
 const planned=entry.routes?.routes;
 const representations=new Set(entry.metadata?.representations?.map(r=>r.chain)||[]);
 if(!origin||!representations.has(origin)||!Array.isArray(planned)||!planned.length||
    !Array.isArray(readyRoutes)||!catalog?.chains?.[HUB])return empty;
 const intended=new Set(),spokes=new Set(),routeNames=new Set();
 for(const row of planned){
  const from=row?.sourceChain,to=row?.destinationChain;
  if(!row?.name||routeNames.has(row.name)||!from||!to||from===to||
     (from!==HUB&&to!==HUB)||!catalog.chains[from]||!catalog.chains[to]||
     !representations.has(from)||!representations.has(to))return empty;
  const key=pair(from,to);
  if(intended.has(key))return empty;
  intended.add(key);routeNames.add(row.name);
  spokes.add(from===HUB?to:from);
 }
 for(const network of spokes){
  if(!intended.has(pair(network,HUB))||!intended.has(pair(HUB,network)))return empty;
 }
 if(origin!==HUB&&!spokes.has(origin))return empty;
 const ready=new Set(readyRoutes.filter(r=>
   r?.asset===symbol&&String(r.assetId||"").toLowerCase()===assetId.toLowerCase()&&
   intended.has(pair(r.source,r.destination))
 ).map(r=>pair(r.source,r.destination)));
 const complete=[...spokes].filter(network=>
   ready.has(pair(network,HUB))&&ready.has(pair(HUB,network))).sort();
 const firstNetwork=origin!==HUB?(complete.includes(origin)?origin:null):complete[0]||null;
 const firstRoute=firstNetwork?{
  source:origin===HUB?HUB:firstNetwork,
  destination:origin===HUB?firstNetwork:HUB,
  network:firstNetwork
 }:null;
 const plannedNetworks=[...spokes].sort();
 return {firstRoute,
  allComplete:!!firstRoute&&plannedNetworks.length>0&&
    complete.length===plannedNetworks.length&&
    [...intended].every(route=>ready.has(route)),
  plannedNetworks,completedNetworks:complete};
}
