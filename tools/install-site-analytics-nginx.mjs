#!/usr/bin/env node
// Idempotent and rollback-safe Nginx installer for first-party analytics intake.
import {readFileSync,writeFileSync,existsSync,realpathSync,statSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {patchXitaAnalyticsNginx} from "./site-analytics-nginx.mjs";
const sites=[
 "/etc/nginx/sites-enabled/xita.xgr.network.conf",
 "/etc/nginx/sites-enabled/xita.xgr.network",
 "/etc/nginx/sites-available/xita.xgr.network.conf",
 "/etc/nginx/sites-available/xita.xgr.network",
 "/etc/nginx/conf.d/xita.xgr.network.conf"
];
const selected=process.argv[2]||sites.find(p=>existsSync(p)&&readFileSync(p,"utf8").includes("server_name xita.xgr.network"));
if(!selected||!selected.startsWith("/etc/nginx/")||!existsSync(selected))
 throw Error("XITA analytics: approved nginx vhost not found");
const path=realpathSync(selected);
if(!path.startsWith("/etc/nginx/")||!statSync(path).isFile())throw Error("Unsafe Nginx path");
const before=readFileSync(path,"utf8");
const {config,changed}=patchXitaAnalyticsNginx(before);
if(!changed){console.log("XITA analytics route already installed");process.exit(0)}
writeFileSync(path,config,{mode:statSync(path).mode});
try{
 execFileSync("nginx",["-t"],{stdio:"pipe"});
 execFileSync("systemctl",["reload","nginx"],{stdio:"pipe"});
 console.log("XITA analytics POST route installed");
}catch(e){
 writeFileSync(path,before);
 try{execFileSync("nginx",["-t"],{stdio:"pipe"})}catch{}
 throw Error("XITA analytics Nginx validation failed; reverted: "+String(e.message||e));
}
