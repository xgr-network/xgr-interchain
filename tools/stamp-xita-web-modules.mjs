// Stamp each module edge with the release SHA. Browsers must never mix the
// new app.js with an older cached dependency after an atomic symlink switch.
import {readFileSync,readdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const SHA=/^[0-9a-f]{40}$/i;
const IMPORT=/((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'])(\.\/[^"'?\s]+\.js)(["'])/g;
const ENTRY=/(<script\s+type="module"\s+src="\/app\.js)(?:\?v=[^"]*)?("\s*><\/script>)/g;
export function stampModuleImports(text,sha){
 if(!SHA.test(sha))throw Error("Invalid release sha");
 return text.replace(IMPORT,(all,prefix,path,quote)=>prefix+path+"?v="+sha+quote);
}
export function stampModuleEntrypoint(html,sha){
 if(!SHA.test(sha))throw Error("Invalid release sha");
 const matches=[...html.matchAll(ENTRY)];
 if(matches.length!==1)throw Error("Expected exactly one module entrypoint");
 return html.replace(ENTRY,(_all,begin,end)=>begin+"?v="+sha+end);
}
export function stampModuleRelease(root,sha){
 if(!SHA.test(sha))throw Error("Invalid release sha");
 let stamped=0;
 for(const entry of readdirSync(root,{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith(".js"))continue;
  const path=join(root,entry.name),before=readFileSync(path,"utf8");
  const after=stampModuleImports(before,sha);
  if(before!==after){writeFileSync(path,after,"utf8");stamped++}
 }
 const index=join(root,"index.html");
 writeFileSync(index,stampModuleEntrypoint(readFileSync(index,"utf8"),sha),"utf8");
 return stamped;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const root=process.argv[2],sha=process.argv[3];
 if(process.argv.length!==4||!root?.startsWith("/")||!root.includes("/releases/"))
  throw Error("Usage: stamp-xita-web-modules.mjs ABSOLUTE_RELEASE_DIR SHA");
 console.log("XITA versioned JS modules: "+stampModuleRelease(root,sha));
}
