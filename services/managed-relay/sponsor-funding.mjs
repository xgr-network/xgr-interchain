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


// N-07: A new wallet-bound quote is a LIABILITY alongside every previously
// signed but not yet safely settled gas grant. Check the entire outstanding
// liability under the SAME per-chain PostgreSQL advisory lock used to append
// the quote, using fresh on-chain wallet balance evidence obtained inside it.
// Confirmed grants are omitted from outstanding (their gas has been spent),
// but remain charged against the rolling daily grant budget.
export function sponsorCapacityCovered({
 balanceWei,gasPriceWei,minReserveWei,currentOutstandingWei="0",
 currentOutstandingCount=0,newCommitments=[],spentTodayWei="0",
 dailyMaxWei,gasUnitsPerGrant=120000n
}={}){
 const values=[balanceWei,gasPriceWei,minReserveWei,currentOutstandingWei,
  spentTodayWei,dailyMaxWei,gasUnitsPerGrant];
 if(values.some(v=>!UINT.test(String(v)))||
    BigInt(gasPriceWei)===0n||BigInt(dailyMaxWei)===0n||
    BigInt(gasUnitsPerGrant)<21000n||BigInt(gasUnitsPerGrant)>120000n||
    !Number.isSafeInteger(currentOutstandingCount)||currentOutstandingCount<0||
    currentOutstandingCount>1000000||
    !Array.isArray(newCommitments)||newCommitments.length>3||
    newCommitments.some(v=>!UINT.test(String(v))||BigInt(v)<=0n))
  throw Error("Invalid atomic sponsorship capacity evidence");
 const fresh=newCommitments.reduce((sum,v)=>sum+BigInt(v),0n);
 const outstanding=BigInt(currentOutstandingWei);
 const pending=BigInt(currentOutstandingCount)+BigInt(newCommitments.length);
 const liability=outstanding+fresh;
 const spent=BigInt(spentTodayWei);
 return {
  funded:BigInt(balanceWei)>=BigInt(minReserveWei)+liability+
   pending*BigInt(gasPriceWei)*BigInt(gasUnitsPerGrant),
  withinDaily:spent+liability<=BigInt(dailyMaxWei),
  liabilityWei:liability.toString(),
  dailyLiabilityWei:(spent+liability).toString()
 };
}
