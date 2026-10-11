export async function verifyPrepared({entry,chain,rpc}){
 if(!entry||entry.stage!=="prepared"||entry.txHash!=null||entry.chainId!==chain?.chainId)
  throw Error("Only unsent prepared drafts can be discarded");
 const url=chain.rpcUrls?.[0],nonce=entry.transaction?.nonce;
 if(!url?.startsWith("https://")||!/^0x[0-9a-f]+$/i.test(nonce||""))
  throw Error("Invalid chain/nonce evidence");
 const [cid,pending,latest]=await Promise.all([
  rpc(url,"eth_chainId",[]),
  rpc(url,"eth_getTransactionCount",[entry.wallet,"pending"]),
  rpc(url,"eth_getTransactionCount",[entry.wallet,"latest"])]);
 if(![cid,pending,latest].every(x=>/^0x[0-9a-f]+$/i.test(x||""))||
    BigInt(cid)!==BigInt(chain.chainId)||BigInt(pending)!==BigInt(nonce)||BigInt(latest)>BigInt(nonce))
  throw Error("A transaction may have been sent; recover before retry");
}
