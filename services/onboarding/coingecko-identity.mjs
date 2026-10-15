// Fail-closed token identity gate used by Join, review and PR CI.
// A CoinGecko coin ID alone does NOT prove the original contract identity.
export const platforms=Object.freeze({
  base:"base", polygon:"polygon-pos", arbitrum:"arbitrum-one"
});
const ADDR=/^0x[0-9a-fA-F]{40}$/;
const ID=/^[a-z0-9][a-z0-9-]{0,99}$/;
function reject(reason){throw new Error("CoinGecko identity check: "+reason);}
export function assertCoinGeckoIdentity(input,coin){
  if(!input||!ID.test(input.coingeckoId||""))reject("valid coin ID required");
  const platform=platforms[input.canonicalChain];
  if(!platform)reject("the original blockchain is not yet supported by CoinGecko contract verification");
  if(!ADDR.test(input.canonicalAddress||"")||/^0x0{40}$/i.test(input.canonicalAddress))reject("valid original ERC-20 address required");
  if(!coin||typeof coin!=="object"||coin.id!==input.coingeckoId)reject("profile ID mismatch");
  if(typeof coin.symbol!=="string"||coin.symbol.toUpperCase()!==input.symbol?.toUpperCase())
    reject("token symbol does not match CoinGecko");
  const fromMap=coin.platforms?.[platform];
  const fromDetails=coin.detail_platforms?.[platform]?.contract_address;
  if(!ADDR.test(fromMap||"")&&!ADDR.test(fromDetails||""))reject("original chain and token contract not listed on CoinGecko");
  if(fromMap&&fromDetails&&fromMap.toLowerCase()!==fromDetails.toLowerCase())
    reject("inconsistent CoinGecko contract records");
  const verifiedAddress=fromDetails||fromMap;
  if(verifiedAddress.toLowerCase()!==input.canonicalAddress.toLowerCase())
    reject("contract address mismatch for "+input.canonicalChain);
  const d=coin.detail_platforms?.[platform]?.decimal_place;
  if(d!==null&&d!==undefined&&Number.isInteger(d)&&d!==input.decimals)
    reject("decimals differ from CoinGecko");
  return {coingeckoId:coin.id,platform,address:verifiedAddress.toLowerCase(),symbol:coin.symbol.toUpperCase(),checkedAt:new Date().toISOString()};
}
export async function verifyCoinGecko(input,{fetcher=fetch,apiKey=process.env.XITA_COINGECKO_API_KEY}={}){
  // Ensure an unsupported chain/invalid ID never even sends a network request.
  if(!ID.test(input?.coingeckoId||""))reject("valid coin ID required");
  if(!platforms[input.canonicalChain])reject("unsupported canonical chain");
  const endpoint="https://api.coingecko.com/api/v3/coins/"+input.coingeckoId+
    "?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false";
  let response;
  try{
    response=await fetcher(endpoint,{method:"GET",signal:AbortSignal.timeout(10000),redirect:"error",
      headers:{"Accept":"application/json",...(apiKey?{"x-cg-demo-api-key":apiKey}:{})}});
  }catch{reject("CoinGecko service unavailable; retry later");}
  if(!response.ok)reject("CoinGecko HTTP "+response.status+"; review is blocked");
  if(Number(response.headers?.get?.("content-length")||0)>1000000)reject("CoinGecko payload too large");
  let coin;
  try{const body=await response.text();if(body.length>1000000)reject("CoinGecko payload too large");coin=JSON.parse(body);}
  catch{reject("invalid CoinGecko JSON");}
  return assertCoinGeckoIdentity(input,coin);
}
