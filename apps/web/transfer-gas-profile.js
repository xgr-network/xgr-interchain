// Gas profiling is keyed by observed EVM behavior, not token name.
// All inputs come from GitHub-receipted route/contract deployment metadata.
const HASH=/^0x[0-9a-f]{64}$/i;
const ROLES=Object.freeze({nativeRouter:"native",collateralRouter:"collateral",
 syntheticRouter:"synthetic"});
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
export const DEFAULT_GAS_UNITS=1200000n;
// The quote allocator applies an additional 30% native gas margin. Gas units
// therefore carry only the remaining learning margin: effective total
// buffer decreases linearly from 2.0x at sample 1 to 1.3x at sample 20.
export const GAS_PROFILE_MIN_SAMPLES=1;
export const GAS_PROFILE_FULL_CONFIDENCE_SAMPLES=20;
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
 const key=[chain,stage,src,dst,operation,
  executor.runtimeCodeKeccak256.toLowerCase(),
  router.runtimeCodeKeccak256.toLowerCase()].join("|");
 return {chain,kind:onward?"onward":"delivery",stage,operation,
  sourceRepresentation:src,destinationRepresentation:dst,key};
}
export function quotedGasUnits(profile,{minimum=GAS_PROFILE_MIN_SAMPLES,
 fallback=DEFAULT_GAS_UNITS}={}){
 if(!profile||!Number.isInteger(Number(profile.sample_count))||
    Number(profile.sample_count)<minimum)return BigInt(fallback);
 const n=Math.min(Number(profile.sample_count),GAS_PROFILE_FULL_CONFIDENCE_SAMPLES);
 const value=BigInt(profile.p95_gas_units);
 if(value<21000n||value>5000000n)return BigInt(fallback);
 // Ratio of target overall margin to the allocator's 1.3x buffer.
 // n=1 => 2/1.3; n>=20 => 1.3/1.3. Integer arithmetic rounds up.
 const factorBps=20000n-((BigInt(n-1)*7000n)/19n);
 const estimated=(value*factorBps+12999n)/13000n;
 return estimated<=5000000n?estimated:5000000n;
}
