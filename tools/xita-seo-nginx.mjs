// Replace ONLY the known legacy XITA SPA fallback. Preserve all existing API,
// TLS, security, wallet and admin proxy location blocks without modification.
export const legacyFallback = "location / { try_files $uri $uri/ /index.html; }";
export const seoFallback = `    # Public crawlable content; the same HTML is served to users and bots.
    location = / { try_files /index.html =404; }
    location = /faq { try_files /faq.html =404; }
    location = /join { try_files /join.html =404; }
    location = /markets { try_files /markets.html =404; }
    location = /contact { try_files /contact.html =404; }
    location = /robots.txt { default_type text/plain; try_files /robots.txt =404; }
    location = /sitemap.xml { default_type application/xml; try_files /sitemap.xml =404; }

    # Nonindexable SPA entrypoints: never render wallet-specific data in HTML.
    location = /transfer { try_files /noindex.html =404; }
    location = /my-transfers { try_files /noindex.html =404; }
    location = /profile-update { try_files /noindex.html =404; }
    location = /join/submitted { try_files /noindex.html =404; }
    location = /join/confirm { try_files /noindex.html =404; }
    location = /createtoken { try_files /noindex.html =404; }
    location = /createtoken/submitted { try_files /noindex.html =404; }
    location = /createtoken/confirm { try_files /noindex.html =404; }
    location = /xgr { try_files /noindex.html =404; }
    location ~ "^/token/[a-z0-9-]{1,80}$" { try_files /noindex.html =404; }
    location = /universe { return 301 /; }
    location = /plan-route { return 302 /transfer$is_args$args; }

    # Unknown paths return a real HTTP 404 instead of a soft-404 SPA shell.
    location / { try_files $uri =404; }`;
const publicPaths=["/faq","/join","/markets","/contact","/robots.txt","/sitemap.xml"];
export function patchXitaSeoNginx(config){
 if(typeof config!=="string"||!config.includes("server_name xita.xgr.network"))
  throw Error("Wrong XITA Nginx virtual host");
 const legacy=config.split(legacyFallback).length-1;
 const already=config.includes("location = /faq { try_files /faq.html =404; }");
 if(already){
  if(legacy>0||!config.includes("location / { try_files $uri =404; }")||
   !publicPaths.every(p=>config.includes("location = "+p+" {")))
   throw Error("Partial or conflicting XITA SEO routing; review manually");
  return {config,changed:false};
 }
 if(legacy!==1)throw Error("Expected exactly one known legacy XITA SPA fallback");
 if(publicPaths.some(p=>config.includes("location = "+p+" {")))
  throw Error("Existing public location requires manual review");
 if(config.includes("location = /transfer {")||config.includes("location ~ ^/token/"))
  throw Error("Existing application routing requires manual review");
 return {config:config.replace(legacyFallback,seoFallback),changed:true};
}
