// Resolve the ACTUAL quote writer database login from the root-owned systemd
// EnvironmentFile. Never print/log the connection URL or its password.
// PostgreSQL validates the role and grants only the required quote privileges.
// The deployed xita_transfer_worker is the explicitly consolidated XITA runtime writer.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export function quoteWriterRoleFromEnvironment(content,expectedDatabase="xita"){
 const matches=String(content).split(/\r?\n/).filter(line=>
  /^\s*XITA_TAX_QUOTE_DATABASE_URL\s*=/.test(line));
 if(matches.length!==1)throw Error("Exactly one signer quote database URL must be configured");
 let raw=matches[0].slice(matches[0].indexOf("=")+1).trim();
 if((raw.startsWith('"')&&raw.endsWith('"'))||
    (raw.startsWith("'")&&raw.endsWith("'")))raw=raw.slice(1,-1);
 let address;
 try{address=new URL(raw)}catch{throw Error("Invalid signer quote database URL");}
 if(!["postgres:","postgresql:"].includes(address.protocol))
  throw Error("Signer quote database must use PostgreSQL");
 let role,database;
 try{
  role=decodeURIComponent(address.username);
  database=decodeURIComponent(address.pathname.slice(1));
 }catch{throw Error("Invalid signer quote database credentials syntax");}
 if(database!==expectedDatabase)throw Error("Signer quote database and target migration differ");
 if(!/^xita_[a-z][a-z0-9_]{1,50}$/.test(role)||
  ["xita_indexer_reader","xita_sponsor_worker",
   "xita_sponsor_status_reader","xita_tax_accounting_reader"].includes(role))
  throw Error("Signer quote database must use a permitted restricted XITA writer role");
 return role;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const envPath=process.argv[2]||"/etc/xita/interchain-fee.env";
 const db=process.argv[3]||"xita";
 try{process.stdout.write(quoteWriterRoleFromEnvironment(readFileSync(envPath,"utf8"),db)+"\n")}
 catch(error){process.stderr.write("XITA quote writer role check failed: "+error.message+"\n");process.exitCode=1;}
}
