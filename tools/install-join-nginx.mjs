#!/usr/bin/env node
// Idempotent, isolated XITA Join public proxy installer.
import {readFileSync,writeFileSync,realpathSync,statSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {patchXitaJoinNginx} from "./join-nginx.mjs";
const sites=[
 "/etc/nginx/sites-enabled/xita.xgr.network.conf",
 "/etc/nginx/sites-enabled/xita.xgr.network",
 "/etc/nginx/sites-available/xita.xgr.network.conf",
 "/etc/nginx/sites-available/xita.xgr.network",
 "/etc/nginx/conf.d/xita.xgr.network.conf"
];
const selected=process.argv[2]||sites.find(p=>existsSync(p)&&readFileSync(p,"utf8").includes("server_name xita.xgr.network"));
if(!selected||!selected.startsWith("/etc/nginx/")||!existsSync(selected))
 throw Error("XITA Join: no approved nginx vhost found");
const file=realpathSync(selected);
if(!file.startsWith("/etc/nginx/")||!statSync(file).isFile())throw Error("XITA Join: unsafe nginx file");
const original=readFileSync(file,"utf8");
const {config,changed,added}=patchXitaJoinNginx(original);
if(!changed){console.log("XITA Join proxy already configured");process.exit(0);}
const mode=statSync(file).mode;
writeFileSync(file,config,{mode});
try{
 execFileSync("nginx",["-t"],{stdio:"pipe"});
 execFileSync("systemctl",["reload","nginx"],{stdio:"pipe"});
 console.log("XITA Join endpoints installed: "+added.join(", "));
}catch(e){
 writeFileSync(file,original,{mode});
 try{execFileSync("nginx",["-t"],{stdio:"pipe"});}catch{}
 throw Error("XITA Join nginx verification failed; prior config restored: "+String(e.message).slice(0,170));
}
