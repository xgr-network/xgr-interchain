#!/usr/bin/env node
// One-time, idempotent installation of one strictly READ-ONLY XITA route.
// Never adds a write endpoint or changes another virtual host.
import {readFileSync,writeFileSync,existsSync,realpathSync,statSync} from "node:fs";
import {execFileSync} from "node:child_process";
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
const signature="location = /api/xeta/v1/transfer/recovery";
if(before.includes(signature)){console.log("XITA transfer recovery proxy is already configured: "+file);process.exit(0)}
const marker="location ^~ /api/xeta/ {";
const count=before.split(marker).length-1;
if(count!==1)fatal("Expected exactly one existing XITA fail-closed API location");
const stanza=`location = /api/xeta/v1/transfer/health {
        proxy_pass http://127.0.0.1:4088;
        proxy_connect_timeout 2s;
        proxy_read_timeout 5s;
        proxy_set_header Host $host;
        add_header Cache-Control "no-store" always;
    }

    location = /api/xeta/v1/transfer/recovery {
        proxy_pass http://127.0.0.1:4088;
        proxy_connect_timeout 2s;
        proxy_read_timeout 95s;
        proxy_set_header Host $host;
        add_header Cache-Control "no-store" always;
    }

    `;
let next=before.replace(marker,stanza+marker);
// One specifically configured Base RPC is needed by the public balance, source
// and recovery preflight. Do not open connect-src to arbitrary external origins.
const connectMarker="connect-src 'self' https://rpc.xgr.network https://explorer.xgr.network";
if(next.includes(connectMarker)&&!next.includes("https://base-rpc.publicnode.com"))
 next=next.replace(connectMarker,connectMarker+" https://base-rpc.publicnode.com");

const mode=statSync(file).mode;
writeFileSync(file,next,{mode});
try{
 execFileSync("nginx",["-t"],{stdio:"pipe"});
 execFileSync("systemctl",["reload","nginx"],{stdio:"pipe"});
 console.log("SUCCESS: XITA unsigned destination recovery proxy installed: "+file);
}catch(error){
 writeFileSync(file,before,{mode});
 try{execFileSync("nginx",["-t"],{stdio:"pipe"});}catch{}
 fatal("Nginx configuration invalid; original virtual host restored: "+String(error.message||error).slice(0,180));
}
