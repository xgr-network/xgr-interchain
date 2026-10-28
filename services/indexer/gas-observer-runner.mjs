// Isolated observer: never accesses fee-wallet signing keys.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Pool} from "pg";
import {canonicalRpc} from "./transfer-index.mjs";
import {tickGasObserver} from "./gas-observer.mjs";
const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
if(!process.env.XITA_TRANSFER_WORKER_DATABASE_URL)
 throw Error("Transfer worker database unavailable");
const pool=new Pool({connectionString:process.env.XITA_TRANSFER_WORKER_DATABASE_URL,
 max:3,connectionTimeoutMillis:2500,statement_timeout:15000});
const rpc=canonicalRpc();
let running=true;
process.once("SIGINT",()=>running=false);
process.once("SIGTERM",()=>running=false);
try{
 while(running){
  try{
   const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
   const stats=await tickGasObserver({catalog,pool,rpc});
   if(stats.onward||stats.delivery)console.log("Gas measurements",JSON.stringify(stats));
  }catch(e){console.error("Gas observation tick",String(e.message||e).slice(0,190))}
  if(running)await new Promise(done=>setTimeout(done,12000));
 }
}finally{await pool.end()}
