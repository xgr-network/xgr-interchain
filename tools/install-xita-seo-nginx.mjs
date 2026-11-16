#!/usr/bin/env node
// Narrow SEO configuration installer. Refuses unknown routing layouts; rollback on nginx failure.
import {readFileSync,writeFileSync,realpathSync,statSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {patchXitaSeoNginx} from "./xita-seo-nginx.mjs";

const sites=[
 "/etc/nginx/sites-enabled/xita.xgr.network.conf",
 "/etc/nginx/sites-enabled/xita.xgr.network",
 "/etc/nginx/sites-available/xita.xgr.network.conf",
 "/etc/nginx/sites-available/xita.xgr.network",
 "/etc/nginx/conf.d/xita.xgr.network.conf"
];
const selected=process.argv[2]||sites.find(p=>existsSync(p)&&readFileSync(p,"utf8").includes("server_name xita.xgr.network"));
if(!selected||!selected.startsWith("/etc/nginx/")||!existsSync(selected))
 throw Error("XITA SEO: approved nginx vhost not found");
const file=realpathSync(selected);
if(!file.startsWith("/etc/nginx/")||!statSync(file).isFile())throw Error("XITA SEO: unsafe vhost path");
const original=readFileSync(file,"utf8");
const {config,changed}=patchXitaSeoNginx(original);
if(!changed){console.log("XITA SEO routing already installed");process.exit(0)}
const mode=statSync(file).mode;
writeFileSync(file,config,{mode});
try{
 execFileSync("nginx",["-t"],{stdio:"pipe"});
 execFileSync("systemctl",["reload","nginx"],{stdio:"pipe"});
 console.log("XITA SEO routing installed and nginx reloaded");
}catch(e){
 writeFileSync(file,original,{mode});
 try{execFileSync("nginx",["-t"],{stdio:"pipe"})}catch{}
 throw Error("XITA SEO nginx check/reload failed; previous config restored: "+String(e.message).slice(0,180));
}
