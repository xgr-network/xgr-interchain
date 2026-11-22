// Narrow public analytics POST route: no unrestricted Admin proxy.
const route="/api/xita/analytics/hit";
const marker="location ^~ /api/xeta/ {";
export function patchXitaAnalyticsNginx(config){
 if(typeof config!=="string"||!config.includes("server_name xita.xgr.network"))
  throw Error("Wrong XITA virtual host");
 const occurrence=config.split("location = "+route+" {").length-1;
 if(occurrence>1)throw Error("Duplicate XITA analytics location");
 if(occurrence===1){
  const start=config.indexOf("location = "+route+" {");
  const end=config.indexOf("    }\n",start);
  if(end<0)throw Error("Unclosed analytics location");
  const block=config.slice(start,end);
  if(!/limit_except POST \{ deny all; \}/.test(block)||
    !/proxy_pass http:\/\/127\.0\.0\.1:4087;/.test(block)||
    !/proxy_set_header X-Real-IP \$remote_addr;/.test(block)||
    !/proxy_set_header X-Xita-Analytics-Proxy v1;/.test(block)||
    !/proxy_set_header X-Forwarded-For "";/.test(block))
   throw Error("Unsafe analytics location; refuse overwrite");
  return {config,changed:false};
 }
 if(config.includes("location = "+route))throw Error("Malformed analytics location");
 if(config.split(marker).length!==2)throw Error("Expected one fail-closed API location");
 const block=[
  "# Public analytics intake only; no basic auth or generic Admin API exposure.",
  "    location = "+route+" {",
  "        limit_except POST { deny all; }",
  "        client_max_body_size 2k;",
  "        proxy_pass http://127.0.0.1:4087;",
  "        proxy_http_version 1.1;",
  "        proxy_connect_timeout 2s;",
  "        proxy_read_timeout 4s;",
  "        proxy_set_header Host $host;",
  "        proxy_set_header X-Real-IP $remote_addr;",
  '        proxy_set_header X-Forwarded-For "";',
  "        proxy_set_header X-Xita-Analytics-Proxy v1;",
  '        proxy_set_header Authorization "";',
  '        add_header Cache-Control "no-store" always;',
  "    }","","    "
 ].join("\n");
 return {config:config.replace(marker,block+marker),changed:true};
}
