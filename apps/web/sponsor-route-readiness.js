// Commercial sponsorship follows the actual two-hop XGR hub route, not a
// global all-chains readiness bit. No unsupported direct spoke-to-spoke hop.
const CHAIN=/^[a-z][a-z0-9-]{1,39}$/;
export function requiredSponsorChains(source,destination){
 if(!CHAIN.test(source||"")||!CHAIN.test(destination||"")||source===destination)
  throw Error("Invalid sponsor route");
 const first=source!=="xgrchain"&&destination!=="xgrchain"?"xgrchain":destination;
 return first===destination?[first]:[first,destination];
}
export function sponsorRouteReady(sponsorship,source,destination){
 if(sponsorship?.enabled!==true)return false;
 return requiredSponsorChains(source,destination).every(chain=>
  sponsorship.chains?.[chain]===true);
}

const WEI_DECIMAL=/^(0|[1-9][0-9]*)$/;
// Only actually PROMISED positive grants need a live funded sponsor on that
// chain. A route may have two hops but its wallet already pays one or both.
export function requiredCommittedSponsorChains(commitments){
 if(!Array.isArray(commitments)||commitments.length>3)
  throw Error("Invalid sponsor quote commitments");
 const chains=new Set();
 for(const grant of commitments){
  if(!grant||!CHAIN.test(grant.chain||"")||
     !WEI_DECIMAL.test(String(grant.amountWei??""))||
     BigInt(grant.amountWei)>=2n**256n)
   throw Error("Invalid sponsor quote commitment");
  if(BigInt(grant.amountWei)>0n)chains.add(grant.chain);
 }
 return [...chains];
}
