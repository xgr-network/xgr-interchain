// Pure, repeatable edit of the XITA read-only Nginx locations.
// Wallet history, stats, health and recovery all live on loopback 4088.
// The generic ^~ /api/xeta/ fallback remains fail-closed.
const upstream="http://127.0.0.1:4088";
const marker="location ^~ /api/xeta/ {";
const services=[
 {path:"/api/xeta/v1/transfer/health",readTimeout:5},
 {path:"/api/xeta/v1/transfer/recovery",readTimeout:95},
 {path:"/api/xeta/v1/transfers/wallet",readTimeout:15},
 {path:"/api/xeta/v1/transfers/stats",readTimeout:15},
 // Shared same-origin read-only RPC bridge. POST is for bounded JSON-RPC reads
 // only; the backend explicitly rejects eth_sendTransaction and private APIs.
 {path:"/api/xeta/v1/rpc/read",readTimeout:20,method:"POST"}
];
function exactLocation(config,path,method="GET"){
 // Every path is a hardcoded ASCII literal; none has regex metacharacters.
 const regex=new RegExp("(?:^|\\n)\\s*location\\s*=\\s*"+path+"\\s*\\{","g");
 const matches=[...config.matchAll(regex)];
 if(matches.length>1)throw Error("Duplicate XITA location: "+path);
 if(matches.length===0){
  // Reject a partly written or malformed exact location instead of
  // appending a duplicate whose precedence would depend on Nginx parsing.
  if(new RegExp("(?:^|\\n)\\s*location\\s*=\\s*"+path+"(?:\\s|$)").test(config))
   throw Error("Malformed existing XITA location: "+path);
  return false;
 }
 // Nginx's limit_except GET { deny all; } has a nested block. Do not
 // mistake it for a missing location (the old flat-brace regex did).
 const open=config.indexOf("{",matches[0].index);
 let depth=0,end=-1;
 for(let i=open;i<config.length;i++){
  if(config[i]==="{")depth++;
  else if(config[i]==="}"&&--depth===0){end=i;break;}
 }
 if(end<0||depth!==0)throw Error("Unclosed XITA location: "+path);
 const body=config.slice(open+1,end);
 if(method==="POST"&&(!/limit_except\s+POST\s*\{\s*deny all;\s*\}/.test(body)||
    !/client_max_body_size\s+8k;/.test(body)))
  throw Error("Unsafe existing read-only RPC nginx location: "+path);
 const proxies=[...body.matchAll(/\bproxy_pass\s+([^;]+);/g)];
 if(proxies.length!==1||proxies[0][1].trim()!==upstream||
    /\breturn\s+\d{3}\s*;/.test(body))
  throw Error("Existing "+path+" does not use approved read-only upstream");
 return true;
}
// Approved public RPC origins from the deployed, reviewed chain catalog.
// Nginx emits this CSP at the HTTPS vhost, so catalog changes do not silently
// expand browser network permissions without a corresponding review.
export const browserRpcOrigins=Object.freeze([
 "https://base-rpc.publicnode.com",
 "https://gateway.tenderly.co",
 "https://base.gateway.tenderly.co",
 "https://bsc-rpc.publicnode.com",
 "https://arbitrum-one-rpc.publicnode.com"
]);
export function patchXitaBrowserRpcCsp(config){
 const header=/^([ \t]*add_header[ \t]+Content-Security-Policy[ \t]+")([^"\r\n]+)("[ \t]+always;[ \t]*)$/gm;
 const matches=[...config.matchAll(header)];
 if(matches.length!==1)throw Error("Expected exactly one XITA Content-Security-Policy header");
 const [whole,begin,policy,end]=matches[0];
 const clauses=[...policy.matchAll(/(?:^|;)\s*connect-src\s+([^;]*)/g)];
 if(clauses.length!==1)throw Error("Expected exactly one XITA CSP connect-src directive");
 const values=clauses[0][1].trim().split(/\s+/);
 if(!values.includes("'self'"))throw Error("XITA CSP connect-src missing self");
 const additions=browserRpcOrigins.filter(origin=>!values.includes(origin));
 if(!additions.length)return config;
 const updated=policy.replace(/(\bconnect-src\s+)([^;]+)/,(_all,start,value)=>
  start+value.trimEnd()+" "+additions.join(" "));
 return config.replace(whole,begin+updated+end);
}
export function patchXitaTransferNginx(config){
 if(typeof config!=="string"||!config.includes("server_name xita.xgr.network"))
  throw Error("Wrong XITA virtual host");
 const missing=services.filter(item=>!exactLocation(config,item.path,item.method));
 let next=config;
 if(missing.length){
  if(config.split(marker).length!==2)
   throw Error("Expected exactly one existing XITA fail-closed API location");
  const blocks=missing.map(({path,readTimeout,method="GET"})=>
   "location = "+path+" {\n"+
   "        limit_except "+method+" { deny all; }\n"+
   (method==="POST"?"        client_max_body_size 8k;\n":"")+
   "        proxy_pass "+upstream+";\n"+
   "        proxy_connect_timeout 2s;\n"+
   "        proxy_read_timeout "+readTimeout+"s;\n"+
   "        proxy_set_header Host $host;\n"+
   '        add_header Cache-Control "no-store" always;\n'+
   "    }\n\n    ").join("");
  next=next.replace(marker,blocks+marker);
 }
 next=patchXitaBrowserRpcCsp(next);
 return {config:next,changed:next!==config,added:missing.map(item=>item.path)};
}
