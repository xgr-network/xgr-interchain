// Gas profiling is keyed by observed EVM behavior, not token name.
// All inputs come from GitHub-receipted route/contract deployment metadata.
const HASH=/^0x[0-9a-f]{64}$/i;
const ROLES=Object.freeze({nativeRouter:"native",collateralRouter:"collateral",
 syntheticRouter:"synthetic"});
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
export const DEFAULT_GAS_UNITS=1200000n;
export const GAS_PROFILE_MIN_SAMPLES=20;
export const GAS_PROFILE_MAX_SAMPLES=1000;
export function transferGasProfile(catalog,route,stage){
 if(!route||!["first-delivery","hub-onward","final-delivery"].includes(stage))
  return null;
 const reps=catalog?.assets?.[route.asset]?.deployment?.representations||[];
 const rep=(chain,addr)=>{
  const matches=reps.filter(x=>x.chain===chain&&same(x.address,addr)&&
   ROLES[x.component]&&HASH.test(x.runtimeCodeKeccak256||""));
  return matches.length===1?matches[0]:null;
 };
 const from=rep(route.source,route.sourceRouter);
 const to=rep(route.destination,route.destinationRouter);
 if(!from||!to)return null;
 const src=ROLES[from.component],dst=ROLES[to.component];
 const onward=stage==="hub-onward";
 if(onward&&route.source!=="xgrchain")return null;
 const chain=onward?route.source:route.destination;
 const core=catalog?.infrastructure?.[chain]?.xitaV315?.components;
 const executor=onward?core?.executionGateway:core?.mailbox;
 const router=onward?from:to;
 const operation=onward?(src==="synthetic"?"burn":"lock"):
  (dst==="synthetic"?"mint":"unlock");
 if(!HASH.test(executor?.runtimeCodeKeccak256||""))return null;
 // Code hashes separate upgrades, operation/representations separate gas paths.
 const key=[chain,onward?"onward":"delivery",src,dst,operation,
  executor.runtimeCodeKeccak256.toLowerCase(),
  router.runtimeCodeKeccak256.toLowerCase()].join("|");
 return {chain,kind:onward?"onward":"delivery",stage,operation,
  sourceRepresentation:src,destinationRepresentation:dst,key};
}
export function quotedGasUnits(profile,{minimum=GAS_PROFILE_MIN_SAMPLES,
 fallback=DEFAULT_GAS_UNITS}={}){
 if(!profile||Number(profile.sample_count)<minimum)return BigInt(fallback);
 const value=BigInt(profile.p95_gas_units);
 return value>=21000n&&value<=5000000n?value:BigInt(fallback);
}
