// Operator-invoked receipt audit only. Never imported by any XITA service,
// indexer or recurring worker; the production read model is XGR Node-only.
import {publicRead} from "../apps/web/wallet-transfers.js";
import {rpcCandidates} from "../services/indexer/rpc-provider-policy.mjs";
export function canonicalRpc({fetcher=globalThis.fetch,archiveProbe=null,
 baseUrls=process.env.XITA_BASE_ARCHIVE_RPC_URLS||"",now=Date.now}={}){
 const validated=new Map(),retryByProvider=new Map();
 return async(chain,method,params)=>{
  if(!Number.isSafeInteger(chain?.chainId)||chain.chainId<1)
   throw Error("Invalid canonical chain config");
  let last=null,skipped=0;
  for(const url of rpcCandidates(chain,{baseUrls})){
   const key=String(chain.chainId)+"|"+url;
   const retry=retryByProvider.get(key);
   if(retry&&retry.until>now()){skipped++;continue;}
   let identityVerified=false;
   try{
    const ok=validated.get(key);
    if(!ok||ok.expire<=now()){
     const id=await publicRead(url,"eth_chainId",[],fetcher);
     if(typeof id!=="string"||!/^0x[0-9a-f]+$/i.test(id)||
       BigInt(id)!==BigInt(chain.chainId))throw Error("RPC chain identity mismatch");
     identityVerified=true;
     if(chain.chainId===8453&&typeof archiveProbe==="function"){
      const archive=await archiveProbe(url,{fetcher,ms:7000});
      if(!archive?.ok)throw Error("Base historical RPC unsupported: "+
       String(archive?.error||"not qualified").slice(0,100));
     }
     validated.set(key,{expire:now()+300000});
    }
    // Canonical completeness is checked by the caller. Never reinterpret
    // an eth_getLogs failure or unsupported range as an empty log set.
    const value=await publicRead(url,method,params,fetcher);
    retryByProvider.delete(key);
    return value;
   }catch(error){
    if(identityVerified||/identity mismatch/.test(String(error?.message||"")))
     validated.delete(key);
    last=error;
    const count=Math.min(5,(retry?.failures||0)+1);
    // 15/30/60/120 second bounded backoff on transport, 429 and missing
    // historical methods. It is per chain AND URL, never route-scoped.
    retryByProvider.set(key,{failures:count,
     until:now()+Math.min(120000,15000*2**(count-1))});
   }
  }
  throw Error("All "+String(chain.name||chain.chainId)+" RPC endpoints failed: "+
   (skipped>0?"provider cooldown; ":"")+
   String(last?.message||"retry after cooldown").slice(0,125));
 };
}

