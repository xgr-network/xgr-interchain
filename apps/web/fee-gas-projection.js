// Display-only downstream wallet gas projection for the XITA transfer card.
// Sponsor worker's real grant amount is verified after the paid source TX and
// covers only a wallet deficit; UI credits are never promises or accounting.
// Match gas-sponsor.mjs 130% gas safety margin, not the separate 10% service markup.
export const GAS_SAFETY_BPS=13000n;
const BASE_BPS=10000n;
const CHAIN=/^[a-z][a-z0-9-]{0,39}$/;
const gasWei=(stage)=>{
 const units=BigInt(stage?.gasUnits??0),price=BigInt(stage?.gasPriceWei??0);
 if(units<0n||units>5000000n||price<0n||
    (units>0n&&price===0n))throw Error("Invalid downstream gas stage");
 if(units===0n)return {raw:0n,buffered:0n};
 const raw=units*price;
 return {raw,buffered:(raw*GAS_SAFETY_BPS+BASE_BPS-1n)/BASE_BPS};
};
export function downstreamGasProjection(stages,sponsor={enabled:false,chains:{}}){
 if(!Array.isArray(stages))throw Error("Downstream gas stages unavailable");
 const byChain=new Map();
 for(const stage of stages){
  if(!CHAIN.test(stage?.chain||""))throw Error("Invalid gas stage chain");
  const cost=gasWei(stage);
  if(cost.raw===0n)continue; // Protocol fees are included in the initial signed fee.
  const prior=byChain.get(stage.chain)||{chain:stage.chain,rawWei:0n,gasWithBufferWei:0n};
  prior.rawWei+=cost.raw;
  prior.gasWithBufferWei+=cost.buffered;
  byChain.set(stage.chain,prior);
 }
 return [...byChain.values()].map(item=>{
  const eligible=Boolean(sponsor?.enabled===true&&sponsor?.chains?.[item.chain]===true);
  const potentialSponsorWei=eligible?item.gasWithBufferWei:0n;
  return {...item,eligible,potentialSponsorWei,
   conditionalNetWei:item.gasWithBufferWei-potentialSponsorWei};
 });
}
