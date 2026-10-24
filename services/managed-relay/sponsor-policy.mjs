// A single global sponsorship switch applies to ALL currently executable
// XITA routes. Native gas balances, prices and safety budgets remain per
// chain because ETH, XGR and POL cannot be paid on each other's networks.
// Existing explicitly configured per-chain budgets take precedence.
// Otherwise derive conservative native-wei caps from fresh backend prices.
import {executableTransferRoutes} from "../../apps/web/route-availability.js";
import {COINGECKO_GAS_COIN_IDS,usdPrice12,ceilDiv} from "./fee-quote.mjs";

const WEI=10n**18n;
const UNIT_LIMIT=1200000n;
const DEFAULT_CAP_USD_12=usdPrice12("0.20");
const DEFAULT_DAILY_USD_12=usdPrice12("0.60");
const DEFAULT_RESERVE_USD_12=usdPrice12("0.50");
const POSITIVE=/^[1-9][0-9]*$/;
const keys=["MAX_GRANT_WEI","DAILY_MAX_WEI","MIN_RESERVE_WEI","GAS_UNITS"];
const prop={MAX_GRANT_WEI:"maxGrantWei",DAILY_MAX_WEI:"dailyMaxWei",
 MIN_RESERVE_WEI:"minReserveWei",GAS_UNITS:"gasUnits"};

export function globallySponsoredChains(catalog){
 return [...new Set(executableTransferRoutes(catalog).flatMap(r=>[r.source,r.destination]))];
}

export function sponsorPoliciesForCatalog({catalog,env=process.env,prices={}}={}){
 if(env.XITA_INTERCHAIN_SPONSOR_ENABLED!=="true")return {};
 const out={};
 for(const chain of globallySponsoredChains(catalog)){
  const prefix="XITA_SPONSOR_"+chain.toUpperCase().replace(/-/g,"_")+"_";
  const provided=keys.filter(key=>env[prefix+key]!==undefined&&String(env[prefix+key]).trim()!=="");
  let cfg;
  if(provided.length){
   // A partially specified override cannot quietly enable an unsafe policy.
   if(provided.length!==keys.length)
    throw Error("Incomplete sponsor budget override for "+chain);
   cfg=Object.fromEntries(keys.map(key=>[prop[key],String(env[prefix+key]).trim()]));
   if(!Object.values(cfg).every(v=>POSITIVE.test(v)))
    throw Error("Invalid sponsor budget override for "+chain);
  }else{
   const id=COINGECKO_GAS_COIN_IDS[chain],coin=prices[id];
   // Never invent token prices or native policy for a newly added chain.
   if(!coin||!Number.isFinite(coin.usd)||coin.usd<=0)
    throw Error("No fresh native gas price for sponsored chain "+chain);
   const rate=usdPrice12(coin.usd);
   cfg={
    maxGrantWei:(DEFAULT_CAP_USD_12*WEI/rate).toString(),
    dailyMaxWei:(DEFAULT_DAILY_USD_12*WEI/rate).toString(),
    minReserveWei:ceilDiv(DEFAULT_RESERVE_USD_12*WEI,rate).toString(),
    gasUnits:UNIT_LIMIT.toString()
   };
  }
  if(Object.values(cfg).some(v=>!POSITIVE.test(v))||
   BigInt(cfg.gasUnits)<21000n||BigInt(cfg.gasUnits)>5000000n||
   BigInt(cfg.dailyMaxWei)<BigInt(cfg.maxGrantWei))
   throw Error("Unsafe sponsor budget for "+chain);
  out[chain]=cfg;
 }
 return out;
}
