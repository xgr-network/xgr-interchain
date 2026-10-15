// Pure repeatable edit of the read-only XITA nginx locations. A missing
// /transfer/health is repaired even when /recovery already exists.
const upstream="proxy_pass http://127.0.0.1:4088;";
const marker="location ^~ /api/xeta/ {";
const services=[
 {path:"/api/xeta/v1/transfer/health",readTimeout:5},
 {path:"/api/xeta/v1/transfer/recovery",readTimeout:95}
];
function exactLocation(config,path){
 // Paths are hardcoded literal ASCII route strings, with no regex metacharacters.
 const regex=new RegExp("(?:^|\\n)\\s*location\\s*=\\s*"+path+"\\s*\\{([^{}]*)\\}","g");
 const matches=[...config.matchAll(regex)];
 if(matches.length>1)throw Error("Duplicate XITA location: "+path);
 if(matches.length===0){
  if(new RegExp("(?:^|\\n)\\s*location\\s*=\\s*"+path+"\\b").test(config))
   throw Error("Malformed existing XITA location: "+path);
  return null;
 }
 if(!matches[0][1].includes(upstream))
  throw Error("Existing "+path+" does not use approved read-only upstream");
 return matches[0][0];
}
export function patchXitaTransferNginx(config){
 if(typeof config!=="string"||!config.includes("server_name xita.xgr.network"))
  throw Error("Wrong XITA virtual host");
 const missing=services.filter(item=>!exactLocation(config,item.path));
 let next=config;
 if(missing.length){
  if(config.split(marker).length!==2)
   throw Error("Expected exactly one existing XITA fail-closed API location");
  const blocks=missing.map(({path,readTimeout})=>
   "location = "+path+" {\n"+
   "        "+upstream+"\n"+
   "        proxy_connect_timeout 2s;\n"+
   "        proxy_read_timeout "+readTimeout+"s;\n"+
   "        proxy_set_header Host $host;\n"+
   '        add_header Cache-Control "no-store" always;\n'+
   "    }\n\n    ").join("");
  next=next.replace(marker,blocks+marker);
 }
 const connectMarker="connect-src 'self' https://rpc.xgr.network https://explorer.xgr.network";
 if(next.includes(connectMarker)&&!next.includes("https://base-rpc.publicnode.com"))
  next=next.replace(connectMarker,connectMarker+" https://base-rpc.publicnode.com");
 return {config:next,changed:next!==config,added:missing.map(item=>item.path)};
}
