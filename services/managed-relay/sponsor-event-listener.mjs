// A lightweight DB notification consumer. PostgreSQL events are only wake-up
// hints, NEVER authorization to send gas. The existing sponsor worker always
// independently validates the indexed and finalized source evidence.
// The five-minute timer remains a crash/outage fallback.
import {Client} from "pg";
import {spawn} from "node:child_process";
const db=process.env.XITA_SPONSOR_DATABASE_URL;
if(!db)throw Error("Sponsor event listener needs private DB URL");
const client=new Client({connectionString:db,connectionTimeoutMillis:5000});
let scheduled=null,busy=false,pending=false;
function schedule(){
 pending=true;
 if(scheduled||busy||process.env.XITA_INTERCHAIN_SPONSOR_ENABLED!=="true")return;
 scheduled=setTimeout(()=>{
  scheduled=null;
  if(busy||!pending)return;
  pending=false;busy=true;
  const child=spawn("/usr/bin/flock",[
   "-n","/run/lock/xita-fee-wallet.lock",process.execPath,
   new URL("./gas-sponsor.mjs",import.meta.url).pathname],{
    cwd:process.cwd(),env:process.env,stdio:"inherit"
  });
  child.on("error",e=>{console.error("Sponsor trigger error",e.message);
   busy=false;schedule();});
  child.on("exit",code=>{
   busy=false;
   if(code!==0)console.error("Sponsor trigger exit:",code);
   if(pending)schedule();
  });
 },1200);
}
try{
 await client.connect();
 client.on("notification",m=>{
  if(m.channel==="xita_sponsor_tick")schedule();
 });
 client.on("error",e=>{
  console.error("Sponsor listener database disconnected",e.message);
  process.exitCode=1;void client.end().finally(()=>process.exit(1));
 });
 await client.query("LISTEN xita_sponsor_tick");
 schedule(); // also catch an existing pending transfer at worker startup
 setInterval(()=>client.query("SELECT 1").catch(e=>{
  console.error("Sponsor listener ping failed",e.message);
  process.exit(1);
 }),30000).unref();
}catch(e){
 console.error("Cannot attach sponsor listener",e.message);
 process.exitCode=1;await client.end().catch(()=>{});
}
