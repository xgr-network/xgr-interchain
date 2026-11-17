#!/usr/bin/env node
// Permissionless, READ-ONLY preparation of an unsigned Mailbox.process call.
// This does NOT sign or broadcast, hold custody, use the XITA relayer, or
// depend on any historical source RPC. Inputs MUST be the original complete
// Hyperlane Dispatch message bytes and its matching current Direct-BLS quorum.
// Never paste keys, seed phrases or raw signed transactions into this tool.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {resolveRecoveryRoute} from "../../services/indexer/transfer-recovery.mjs";
import {prepareDirectILN} from "./recover-iln.mjs";

const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const HASH=/^0x[0-9a-f]{64}$/i;
const ROUTE=/^[a-z0-9_-]{1,72}$/;
const ASSET=/^[A-Za-z0-9_-]{1,48}$/;
export function configurePermissionlessRecovery({
 catalog,routeName,asset,messageId,sourceTxHash,messageHex,xgrRpc
}){
 if(!ROUTE.test(routeName||"")||!ASSET.test(asset||"")||
   !HASH.test(messageId||"")||!HASH.test(sourceTxHash||"")||
   typeof messageHex!=="string"||
   !/^0x(?:[0-9a-f]{2}){77,65536}$/i.test(messageHex))
  throw Error("Complete original Dispatch bytes and valid canonical source identity required");
 const resolved=resolveRecoveryRoute(catalog,routeName,messageId,asset,sourceTxHash);
 const local=xgrRpc||"http://127.0.0.1:8545";
 if(!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(local))
  throw Error("Attestation/Destination XGR RPC must be a local loopback node");
 if(Number(resolved.destinationChainId)!==1643)
  throw Error("This manual reconstruction tool is currently limited to XGRChain destination");
 return {...resolved.env,
  XITA_RECOVERY_SOURCE_MESSAGE_HEX:messageHex,
  ATTESTATION_RPC_URL:local,
  DESTINATION_RPC_URL:local};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [routeName,asset,messageId,sourceTxHash]=process.argv.slice(2);
  const messageHex=process.env.XITA_RECOVERY_SOURCE_MESSAGE_HEX||"";
  const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
  const env=configurePermissionlessRecovery({
   catalog,routeName,asset,messageId,sourceTxHash,messageHex,
   xgrRpc:process.env.XITA_RECOVERY_XGR_RPC_URL
  });
  Object.assign(process.env,env);
  const result=await prepareDirectILN(messageId);
  console.log(JSON.stringify(result));
  if(result.status!=="READY_UNSIGNED_CALL"&&result.status!=="ALREADY_DELIVERED")
   process.exitCode=2;
 }catch(error){
  console.error("PERMISSIONLESS_RECOVERY_NOT_READY:"+String(error?.message||error).slice(0,400));
  process.exitCode=1;
 }
}
