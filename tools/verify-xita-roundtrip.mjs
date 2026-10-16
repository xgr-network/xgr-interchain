#!/usr/bin/env node
// Read-only receipt audit, independent of relayer and PostgreSQL.
import {readFileSync} from "node:fs";
import {fileURLToPath,pathToFileURL} from "node:url";
import {dirname,resolve} from "node:path";
import {findWalletSourceTx} from "../apps/web/wallet-transfers.js";
import {canonicalRpc} from "../services/indexer/transfer-index.mjs";
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
export function roundtripArguments(args){
 if(!Array.isArray(args)||![2,4].includes(args.length))
  throw Error("usage: node tools/verify-xita-roundtrip.mjs xgrchain SOURCE_TX [base RETURN_TX]");
 const targets=[];
 for(let i=0;i<args.length;i+=2){
  const sourceChain=args[i],txHash=args[i+1];
  if(!["xgrchain","base"].includes(sourceChain)||!HASH.test(txHash||""))
   throw Error("Invalid source chain or transaction hash");
  targets.push({sourceChain,txHash:txHash.toLowerCase()});
 }
 if(targets.length===2&&(targets[0].sourceChain!=="xgrchain"||
   targets[1].sourceChain!=="base"))throw Error("Expected XGRChain -> Base -> XGRChain");
 return targets;
}
export async function verifyTransfer({catalog,sourceChain,txHash,rpc=canonicalRpc(),evidenceLookup=findWalletSourceTx}){
 const chain=catalog?.chains?.[sourceChain];
 if(!chain||!HASH.test(txHash||""))throw Error("Invalid canonical source transfer");
 const tx=await rpc(chain,"eth_getTransactionByHash",[txHash]);
 if(!ADDRESS.test(tx?.from||""))throw Error("Source transaction missing canonical sender");
 const evidence=await evidenceLookup({catalog,sourceChain,txHash,account:tx.from,
  rpc:(url,method,params)=>{
   const cfg=Object.values(catalog.chains).find(c=>c.rpcUrls?.includes(url));
   if(!cfg)throw Error("Unknown RPC endpoint in canonical catalog");
   return rpc(cfg,method,params);
  }});
 if(evidence?.sourceChain!==sourceChain||
  evidence.txHash?.toLowerCase()!==txHash.toLowerCase()||
  evidence.account?.toLowerCase()!==tx.from.toLowerCase()||
  !["xgrchain","base"].includes(evidence.destinationChain))
   throw Error("Receipt identity mismatch");
 return {sourceChain,sourceTxHash:txHash.toLowerCase(),account:evidence.account,
  route:evidence.routeName,routeId:evidence.routeId,asset:evidence.asset,
  destinationChain:evidence.destinationChain,messageId:evidence.messageId,
  status:evidence.status,sourceConfirmed:evidence.confirmed===true,
  destinationDelivered:evidence.delivered===true,
  destinationUnknown:evidence.delivered===null,validatorFeeWei:evidence.validatorFeeWei??null};
}
export function classifyRoundtrip(legs){
 if(!legs.length||legs.some(x=>x.asset!=="XGR"))return "INVALID";
 if(legs.length===2&&(legs[0].destinationChain!=="base"||
  legs[1].destinationChain!=="xgrchain"||
  legs[0].account.toLowerCase()!==legs[1].account.toLowerCase()))return "INVALID";
 if(legs.length===2&&legs.every(x=>x.sourceConfirmed&&x.destinationDelivered))
  return "ROUNDTRIP_DELIVERED";
 if(legs[0].sourceConfirmed&&legs[0].destinationDelivered)return "FORWARD_DELIVERED";
 if(legs[0].sourceConfirmed)return "SOURCE_LOCK_CONFIRMED_DELIVERY_PENDING";
 return "SOURCE_NOT_CONFIRMED";
}
export async function auditRoundtrip({catalog,args,rpc}){
 const legs=[];
 for(const target of roundtripArguments(args))
  legs.push(await verifyTransfer({catalog,...target,rpc}));
 return {schema:"xita-roundtrip-receipt-audit-v1",
  source:"canonical-onchain-receipts-and-destination-mailboxes",
  status:classifyRoundtrip(legs),legs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
  const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
  const audit=await auditRoundtrip({catalog,args:process.argv.slice(2)});
  console.log(JSON.stringify(audit,null,2));
  if(audit.status==="INVALID")process.exitCode=1;
 }catch(e){console.error("READ_ONLY_AUDIT_FAILED:",String(e.message||e));process.exitCode=1;}
}
