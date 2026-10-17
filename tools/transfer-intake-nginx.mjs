// Exact-match, POST-only untrusted TX hash intake on its own loopback port.
// Existing read-only indexer routes and fail-closed /api/xeta/ remain unchanged.
const path="/api/xeta/v1/transfers/announce";
const marker="location ^~ /api/xeta/ {";
const upstream="proxy_pass http://127.0.0.1:4089;";
const proposed=`location = ${path} {
    client_max_body_size 512;
    proxy_pass http://127.0.0.1:4089;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_connect_timeout 2s;
    proxy_read_timeout 5s;
    add_header Cache-Control "no-store" always;
}
`;
export function patchTransferIntakeNginx(config){
 if(typeof config!=="string"||!config.includes("server_name xita.xgr.network"))
  throw Error("Wrong XITA virtual host");
 const matches=[...config.matchAll(/(?:^|\n)\s*location\s*=\s*\/api\/xeta\/v1\/transfers\/announce\s*\{([^{}]*)\}/g)];
 if(matches.length>1)throw Error("Duplicate TX intake nginx route");
 if(matches.length===1){
  const body=matches[0][1];
  if(!body.includes(upstream)||!body.includes("X-Real-IP $remote_addr")||
      !body.includes("client_max_body_size 512"))
   throw Error("Unsafe existing TX intake upstream or limits");
  return {config,changed:false,added:[]};
 }
 if(config.includes("location = "+path)||config.includes("location ^~ "+path))
  throw Error("Malformed existing TX intake nginx route");
 if(config.split(marker).length!==2)
  throw Error("Expected exactly one fail-closed XITA API location");
 return {config:config.replace(marker,proposed+"\n"+marker),
  changed:true,added:[path]};
}
