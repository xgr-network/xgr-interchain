// Pure deterministic gas-budget allocator. Inputs are exclusively RPC-derived
// balances and signer-derived estimates; never accept a user-supplied balance.
// Source native gas, transferred native principal and ERC20 approvals are excluded.
const UINT=/^(0|[1-9][0-9]*)$/;
const STAGES=new Set(["first-delivery","hub-onward","final-delivery"]);
export const GAS_SAFETY_BPS=13000n;
export function walletAwareSponsorship({stages,balances,gasSafetyBps=GAS_SAFETY_BPS}){
 const bps=BigInt(gasSafetyBps);
 if(!Array.isArray(stages)||stages.length<1||stages.length>3||
    !balances||bps<10000n||bps>20000n)
  throw Error("Invalid wallet-aware quote inputs");
 const remaining=new Map(),seen=new Set(),grants=[],quoted=[];
 for(const item of stages){
  const {chain,kind}=item||{},tag=chain+":"+kind;
  if(!/^[a-z][a-z0-9-]{1,39}$/.test(chain||"")||
     !STAGES.has(kind)||seen.has(tag)||!UINT.test(String(item.gasUnits??0))||
     !UINT.test(String(item.gasPriceWei??0))||
     !UINT.test(String(item.nativeFeeWei??0)))
   throw Error("Invalid or duplicate gas stage");
  seen.add(tag);
  if(!remaining.has(chain)){
   if(!UINT.test(String(balances[chain])))
    throw Error("RPC-verified native wallet balance missing for "+chain);
   remaining.set(chain,BigInt(balances[chain]));
  }
  const units=BigInt(item.gasUnits??0),price=BigInt(item.gasPriceWei??0);
  if(units>5000000n||price<=0n||units<21000n)
   throw Error("Unsafe native gas estimate");
  const gas=units*price;
  const buffered=(gas*bps+9999n)/10000n;
  const protocol=BigInt(item.nativeFeeWei??0),required=buffered+protocol;
  if(required<=0n||required>=2n**256n)throw Error("Invalid stage budget");
  const have=remaining.get(chain),walletCovered=have<required?have:required;
  const promised=required-walletCovered;
  remaining.set(chain,have-walletCovered);
  quoted.push({chain,stage:kind,gasWei:gas.toString(),
   bufferedGasWei:buffered.toString(),protocolWei:protocol.toString(),
   requiredWei:required.toString(),walletCoveredWei:walletCovered.toString(),
   shortfallWei:promised.toString()});
  if(promised>0n)grants.push({chain,stage:kind,amountWei:promised.toString()});
 }
 return {stages:quoted,grants,gasSafetyBps:bps.toString()};
}
