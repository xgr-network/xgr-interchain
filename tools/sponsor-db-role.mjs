// Operator-only: resolve the ACTUAL PostgreSQL login used by the native
// sponsor worker. The root-owned EnvironmentFile is read locally; passwords,
// URLs, and connection strings are never emitted or sent to the Admin UI.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export function sponsorWorkerRoleFromEnvironment(content,expectedDatabase="xita"){
 const matches=String(content).split(/\r?\n/).filter(line=>
  /^\s*XITA_SPONSOR_DATABASE_URL\s*=/.test(line));
 if(matches.length!==1)throw Error("Exactly one sponsor database URL must be configured");
 let raw=matches[0].slice(matches[0].indexOf("=")+1).trim();
 if((raw.startsWith('"')&&raw.endsWith('"'))||
    (raw.startsWith("'")&&raw.endsWith("'")))raw=raw.slice(1,-1);
 let address;
 try{address=new URL(raw)}catch{throw Error("Invalid sponsor database URL")}
 if(!["postgres:","postgresql:"].includes(address.protocol))
  throw Error("Sponsor database must use PostgreSQL");
 let role,database;
 try{role=decodeURIComponent(address.username);
  database=decodeURIComponent(address.pathname.slice(1));
 }catch{throw Error("Invalid sponsor database identity")}
 if(database!==expectedDatabase)
  throw Error("Sponsor database and migration target differ");
 // The deployed consolidated transfer worker is supported for recovery.
 // New installations should use the dedicated sponsor worker role.
 if(!["xita_sponsor_worker","xita_transfer_worker"].includes(role))
  throw Error("Sponsor database must use an approved restricted XITA worker login");
 return role;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const envPath=process.argv[2]||"/etc/xita/interchain-fee.env";
  const db=process.argv[3]||"xita";
  process.stdout.write(sponsorWorkerRoleFromEnvironment(readFileSync(envPath,"utf8"),db)+"\n");
 }catch(e){
  process.stderr.write("XITA sponsor DB role check failed: "+e.message+"\n");
  process.exitCode=1;
 }
}
