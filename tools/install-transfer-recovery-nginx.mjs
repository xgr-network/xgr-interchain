#!/usr/bin/env node
// Idempotent XITA route installer. Commercial fee mode installs ONLY the
// exact-matched fee quote POST and public sponsor status GET routes.
// The upstream signer remains bound to loopback; no broad write proxy.
import {readFileSync,writeFileSync,existsSync,realpathSync,statSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {patchXitaTransferNginx} from "./transfer-recovery-nginx.mjs";
import {patchInterchainFeeNginx} from "./interchain-fee-nginx.mjs";
import {patchTransferIntakeNginx} from "./transfer-intake-nginx.mjs";
const sites=[
 "/etc/nginx/sites-enabled/xita.xgr.network.conf",
 "/etc/nginx/sites-enabled/xita.xgr.network",
 "/etc/nginx/sites-available/xita.xgr.network.conf",
 "/etc/nginx/sites-available/xita.xgr.network",
 "/etc/nginx/conf.d/xita.xgr.network.conf"
];
function fatal(message){throw Error("XITA transfer recovery nginx: "+message)}
const selected=process.argv[2]||sites.find(p=>existsSync(p)&&readFileSync(p,"utf8").includes("server_name xita.xgr.network"));
if(!selected||!selected.startsWith("/etc/nginx/")||!existsSync(selected))
 fatal("Unable to locate XITA nginx vhost. Set XITA_NGINX_SITE_CONF explicitly.");
const file=realpathSync(selected);
if(!file.startsWith("/etc/nginx/")||!statSync(file).isFile())fatal("Unsafe nginx config location");
const before=readFileSync(file,"utf8");
if(!before.includes("server_name xita.xgr.network"))fatal("Wrong virtual host");
const commercial=process.env.XITA_INTERCHAIN_FEE_NGINX==="1";
const intake=process.env.XITA_TRANSFER_INTAKE_NGINX==="1";
if(commercial&&intake)fatal("Conflicting route-install modes");
const {config:next,changed,added}=intake?
 patchTransferIntakeNginx(before):commercial?
 patchInterchainFeeNginx(before):patchXitaTransferNginx(before);
if(!changed){
 console.log("XITA "+(commercial?"Interchain Fee":"transfer recovery")+" nginx routes already configured: "+file);
 process.exit(0);
}
const mode=statSync(file).mode;
writeFileSync(file,next,{mode});
try{
 execFileSync("nginx",["-t"],{stdio:"pipe"});
 execFileSync("systemctl",["reload","nginx"],{stdio:"pipe"});
 console.log("SUCCESS: XITA proof API nginx locations ready: "+file+"; added="+added.join(", "));
}catch(error){
 writeFileSync(file,before,{mode});
 try{execFileSync("nginx",["-t"],{stdio:"pipe"});}catch{}
 fatal("Nginx configuration invalid; original virtual host restored: "+String(error.message||error).slice(0,180));
}
