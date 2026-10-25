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
