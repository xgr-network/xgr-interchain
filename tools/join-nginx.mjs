// Install only the four explicitly supported public Join endpoints on loopback 4090.
// Never proxy a generic /api/xita/ path or expose the operator's private store.
const upstream="http://127.0.0.1:4090";
const marker="location ^~ /api/xeta/ {";
const routes=[
 {path:"/api/xita/join/status",method:"GET"},
 {path:"/api/xita/join/preview",method:"POST",maxBody:"480k"},
 {path:"/api/xita/join/submit",method:"POST",maxBody:"480k",rate:true},
 {path:"/api/xita/join/confirm",method:"POST",maxBody:"1k",rate:true,timeout:"120s"}
];
function existingLocation(config,item){
 const pattern=new RegExp("(?:^|\\n)\\s*location\\s*=\\s*"+item.path+"\\s*\\{","g");
 const matches=[...config.matchAll(pattern)];
 if(matches.length>1)throw Error("Duplicate XITA Join location: "+item.path);
 if(!matches.length){
  if(new RegExp("(?:^|\\n)\\s*location\\s*=\\s*"+item.path+"(?:\\s|$)").test(config))
   throw Error("Malformed XITA Join location: "+item.path);
  return false;
 }
 const open=config.indexOf("{",matches[0].index);
 let depth=0,end=-1;
 for(let i=open;i<config.length;i++){
  if(config[i]==="{")depth++;
  else if(config[i]==="}"&&--depth===0){end=i;break;}
 }
 if(end<0||depth!==0)throw Error("Unclosed XITA Join location: "+item.path);
 const block=config.slice(open+1,end);
 const proxies=[...block.matchAll(/\bproxy_pass\s+([^;]+);/g)];
 if(proxies.length!==1||proxies[0][1].trim()!==upstream||
    !new RegExp("limit_except\\s+"+item.method+"\\s*\\{\\s*deny all;\\s*\\}").test(block)||
    /\breturn\s+\d{3}\s*;/.test(block))
   throw Error("Unapproved XITA Join proxy or method: "+item.path);
 if(item.maxBody&&!new RegExp("client_max_body_size\\s+"+item.maxBody+"\\s*;").test(block))
   throw Error("Unsafe XITA Join request limit: "+item.path);
 if(item.rate&&!/\blimit_req\s+zone=xita_join_submit\s+burst=3\s+nodelay;/.test(block))
   throw Error("Missing XITA Join submission rate limit: "+item.path);
 return true;
}
export function patchXitaJoinNginx(config){
 if(typeof config!=="string"||!config.includes("server_name xita.xgr.network"))
  throw Error("Wrong XITA nginx virtual host");
 const missing=routes.filter(r=>!existingLocation(config,r));
 if(!missing.length)return {config,changed:false,added:[]};
 if(config.split(marker).length!==2)
  throw Error("Expected exactly one XITA fail-closed API fallback location");
 const blocks=missing.map(r=>
  "    location = "+r.path+" {\n"+
  "        limit_except "+r.method+" { deny all; }\n"+
  (r.maxBody?"        client_max_body_size "+r.maxBody+";\n":"")+
  (r.rate?"        limit_req zone=xita_join_submit burst=3 nodelay;\n":"")+
  "        proxy_pass "+upstream+";\n"+
  "        proxy_connect_timeout 2s;\n"+
  "        proxy_read_timeout "+(r.timeout||"15s")+";\n"+
  "        proxy_set_header Host $host;\n"+
  "        add_header Cache-Control \"no-store\" always;\n"+
  "        add_header X-Content-Type-Options nosniff always;\n"+
  "    }\n\n").join("");
 const next=config.replace(marker,blocks+"    "+marker);
 return {config:next,changed:true,added:missing.map(r=>r.path)};
}
