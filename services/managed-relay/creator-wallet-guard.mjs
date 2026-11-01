// Read-only fail-closed gate for the XGR native fee/sponsor wallet.
// All fee claims, sponsorships and Creator deployments must use the same
// systemd flock and a single creator transaction journal. A missing mempool
// record is NOT proof that a previously signed transaction is safe to replace.
import {readdirSync,readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";
const NAME=/^[a-f0-9-]{36}\.json$/i;
export function assertNoUnresolvedCreatorNonce(env=process.env,{
 list=readdirSync,read=readFileSync,stat=statSync}={}){
 if(env.XITA_CREATOR_SHARED_WALLET!=="true")return;
 const dir=env.XITA_CREATOR_PRIVATE_DIR;
 if(!dir||!dir.startsWith("/")||dir!==resolve(dir)||
    !dir.startsWith("/var/lib/xita/"))
  throw Error("Shared XITA creator journal directory must be configured securely");
 const st=stat(dir);
 if(!st.isDirectory()||(st.mode&0o077)!==0)
  throw Error("Untrusted XITA creator journal directory");
 for(const file of list(dir)){
  if(!file.endsWith(".json"))continue;
  if(!NAME.test(file))throw Error("Unexpected creator journal filename");
  const record=JSON.parse(read(dir+"/"+file,"utf8"));
  if(record?.kind==="token-creator"&&record.phase==="deployment-submitted"){
   if(!/^0x[a-f0-9]{64}$/i.test(record.deployment?.txHash||""))
    throw Error("Unresolved creator nonce lacks durable signed TX evidence");
   throw Error("XGR sponsor wallet nonce reserved by pending Creator ERC-20 deployment");
  }
 }
}