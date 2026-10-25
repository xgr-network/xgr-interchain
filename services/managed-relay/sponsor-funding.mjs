// Native funding evidence for a signed, wallet-bound sponsorship promise.
// This function accepts already independently verified RPC bigints. A stale
// monitor heartbeat is not a source of balance evidence or a substitute.
const UINT=/^(0|[1-9][0-9]*)$/;
export function sponsorFundingCovered({balanceWei,gasPriceWei,minReserveWei,
 commitments=[],defaultMaxGrantWei="0",gasUnitsPerGrant=120000n}){
 if(!Array.isArray(commitments)||commitments.length>3||
    ![balanceWei,gasPriceWei,minReserveWei,defaultMaxGrantWei,gasUnitsPerGrant]
      .every(x=>UINT.test(String(x)))||BigInt(gasPriceWei)<=0n||
    BigInt(gasUnitsPerGrant)<21000n||BigInt(gasUnitsPerGrant)>120000n||
    commitments.some(v=>!UINT.test(String(v))))
  throw Error("Invalid live sponsor funding evidence");
 const total=commitments.length?
  commitments.reduce((sum,n)=>sum+BigInt(n),0n):BigInt(defaultMaxGrantWei);
 const payoutCount=commitments.length||1;
 return BigInt(balanceWei)>=BigInt(minReserveWei)+total+
  BigInt(gasPriceWei)*BigInt(gasUnitsPerGrant)*BigInt(payoutCount);
}
