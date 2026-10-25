// Immutable quote-time funding calculation. Never use native token principal
// as available gas. One balance snapshot per chain is consumed ONCE.
const UINT=/^(0|[1-9][0-9]*)$/;
const STAGES=new Set(["first-delivery","hub-onward","onward-protocol-fee","final-delivery"]);
export function walletAwareSponsorship({stages,balances,enabled,gasSafetyBps=13000n}){
 if(!Array.isArray(stages)||stages.length<1||!balances||
    BigInt(gasSafetyBps)<10000n||BigInt(gasSafetyBps)>20000n)
  throw Error("Invalid sponsorship quote input");
 const available=new Map(),grants=[],fullStages=[];
 for(const item of stages){
  const {chain,kind}=item;
  if(!/^[a-z][a-z0-9-]{1,39}$/.test(chain||"")||
     !STAGES.has(kind)||!UINT.test(String(item.gasUnits??0))||
     !UINT.test(String(item.gasPriceWei??0))||
     !UINT.test(String(item.nativeFeeWei??0)))
    throw Error("Invalid native gas quote stage");
  if(!available.has(chain)){
   if(!UINT.test(String(balances[chain])))
    throw Error("Wallet balance missing for "+chain);
   available.set(chain,BigInt(balances[chain]));
  }
  const gas=BigInt(item.gasUnits)*BigInt(item.gasPriceWei);
  const protectedGas=(gas*BigInt(gasSafetyBps)+9999n)/10000n;
  const protocol=BigInt(item.nativeFeeWei??0);
  const required=protectedGas+protocol;
  const remaining=available.get(chain);
  const selfPay=remaining<required?remaining:required;
  const deficit=required-selfPay;
  available.set(chain,remaining-selfPay);
  fullStages.push({chain,kind,requiredWei:required.toString(),
   walletCoveredWei:selfPay.toString(),shortfallWei:deficit.toString()});
  if(enabled&&deficit>0n)grants.push({chain,stage:kind,amountWei:deficit.toString()});
 }
 return {stages:fullStages,grants,
  // Fallback when disabled: original commercial pricing, no guarantee.
  totalCoveredWeiByChain:Object.fromEntries([...available].map(([c,v])=>[c,v.toString()])),
  gasSafetyBps:String(gasSafetyBps)};
}
