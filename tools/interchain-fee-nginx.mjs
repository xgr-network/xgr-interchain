// Patch exactly two public XITA service endpoints, no broad proxy prefix.
// No access to quote or sponsor keys; the upstream is loopback-only.
const MARKER="location ^~ /api/xeta/ {";
const PATHS=Object.freeze([
 {path:"/api/xita/v1/managed/health",method:"GET",timeout:4},
 {path:"/api/xita/v1/managed/quote",method:"POST",timeout:15}
]);
const upstream="proxy_pass http://127.0.0.1:4092;";
export function patchInterchainFeeNginx(config){
 if(typeof config!=="string"||
   !config.includes("server_name xita.xgr.network"))
  throw Error("Wrong XITA virtual host");
 let next=config;
 const added=[];
 for(const {path,method,timeout} of PATHS){
  const matches=[...next.matchAll(new RegExp(
   String.raw`(?:^|\n)\s*location\s*=\s*`+path+String.raw`\s*\{`,"g"))];
  if(matches.length>1)throw Error("Duplicate Interchain Fee API route: "+path);
  if(matches.length===1){
   const from=next.indexOf("{",matches[0].index);
   let depth=0,end=-1;
   for(let i=from;i<next.length;i++){
    if(next[i]==="{")depth++;
    if(next[i]==="}"&&--depth===0){end=i;break;}
   }
   if(end<0)throw Error("Malformed Interchain Fee API location");
   const block=next.slice(from,end+1);
   if(!block.includes(upstream)||
     !block.includes("limit_except "+method+" { deny all; }"))
    throw Error("Unapproved Interchain Fee API proxy or HTTP methods: "+path);
   continue;
  }
  if(next.split(MARKER).length!==2)
   throw Error("Expected exactly one fail-closed XITA API location");
  const text=[
   "location = "+path+" {",
   "    limit_except "+method+" { deny all; }",
   ...(method==="POST"?["    client_max_body_size 4k;"]:[]),
   "    "+upstream,
   "    proxy_connect_timeout 2s;",
   "    proxy_read_timeout "+timeout+"s;",
   "    proxy_set_header Host $host;",
   '    add_header Cache-Control "no-store" always;',
   '    add_header X-Content-Type-Options nosniff always;',
   "}",
   ""
  ].join("\n");
  next=next.replace(MARKER,text+"\n"+MARKER);
  added.push(path);
 }
 // Current public catalog uses dedicated RPC hosts for each chain.
 // Restrict the CSP to these exact HTTPS origins; never allow *.
 const required=[
  "https://gateway.tenderly.co",
  "https://base.gateway.tenderly.co",
  "https://polygon-bor-rpc.publicnode.com",
  "https://arbitrum-one-rpc.publicnode.com"
 ];
 const policy=next.match(/connect-src\\s+([^;"]*)/);
 if(policy){
  let updated=policy[0];
  for(const host of required){
   if(!updated.split(/\\s+/).includes(host))updated+=" "+host;
  }
  if(updated!==policy[0])next=next.replace(policy[0],updated);
 }
 return {config:next,changed:next!==config,added};
}
