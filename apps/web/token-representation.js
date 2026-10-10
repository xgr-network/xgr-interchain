// Display semantics come from the canonical XITA asset manifest, never from
// a token symbol prefix, coin price, or a presumed deployed bridge.
export function representationFor(token,chainKey) {
 const rep=token?.representations?.find(item=>item.chain===chainKey);
 const symbol=rep?.symbol||token?.id||"Token";
 switch(rep?.representation){
  case "native":return {kind:"native",label:"Native coin",symbol,description:"Native asset on this blockchain"};
  case "collateral":return {kind:"canonical",label:"Original ERC-20",symbol,description:"Canonical collateral token on its home chain"};
  case "synthetic":return {kind:"wrapped",label:"Wrapped",symbol,description:"Synthetic token representation; deployment and activation require independent verification"};
  default:return {kind:"unknown",label:"Unclassified",symbol,description:"Token representation not verified in the catalog"};
 }
}
