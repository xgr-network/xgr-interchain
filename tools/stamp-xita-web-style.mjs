// Fingerprint the CSS *inside each published release* before switching the
// live symlink. An app.js update with a browser-cached old /style.css caused
// the compact fee card to render as unstyled inline text in production.
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";

const STYLE_LINK=/href="\/style\.css(?:\?v=[^"]*)?"/g;
export function stylesheetVersion(stylesheet){
 return createHash("sha256").update(stylesheet).digest("hex").slice(0,16);
}
export function stampStylesheetLink(html,stylesheet){
 const matches=[...html.matchAll(STYLE_LINK)];
 if(matches.length!==1)throw Error("Expected exactly one local XITA stylesheet link");
 const version=stylesheetVersion(stylesheet);
 return {html:html.replace(STYLE_LINK,'href="/style.css?v='+version+'"'),version};
}
export function stampRelease(root){
 const css=readFileSync(join(root,"style.css"));
 const page=join(root,"index.html");
 const {html,version}=stampStylesheetLink(readFileSync(page,"utf8"),css);
 writeFileSync(page,html,"utf8");
 return version;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(process.argv.length!==3)throw Error("Usage: node tools/stamp-xita-web-style.mjs ABSOLUTE_RELEASE_DIR");
 const folder=resolve(process.argv[2]);
 if(!folder.startsWith("/")||!folder.includes("/releases/"))
  throw Error("Stylesheet stamping requires the release directory");
 const version=stampRelease(folder);
 console.log("XITA CSS content fingerprint: "+version+" (browser cache busting enabled)");
}
