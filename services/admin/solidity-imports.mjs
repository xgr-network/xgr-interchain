// Check the complete production Solidity import closure before Forge builds.
// Missing nested Hyperlane/OpenZeppelin dependencies fail with a usable path,
// rather than an opaque forge compiler resolver stack trace.
import {readFileSync,readdirSync,statSync,existsSync} from "node:fs";
import {dirname,relative,resolve,sep,isAbsolute} from "node:path";

function solidityFiles(dir){
 if(!existsSync(dir))throw Error("Solidity sources missing: "+dir);
 const files=[];
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const p=resolve(dir,entry.name);
  if(entry.isDirectory())files.push(...solidityFiles(p));
  else if(entry.isFile()&&p.endsWith(".sol"))files.push(p);
 }
 return files;
}
export function verifySolidityImports(root){
 root=resolve(root);
 const cfg=readFileSync(resolve(root,"foundry.toml"),"utf8");
 const remaps=[...cfg.matchAll(/"([^"\n=]+)=([^"\n]+)"/g)]
  .map(([,prefix,target])=>({prefix,target:resolve(root,target)}))
  .sort((a,b)=>b.prefix.length-a.prefix.length);
 const scope=resolve(root,"contracts");
 const sources=solidityFiles(scope);
 const done=new Set();
 const missing=[];
 const unknown=[];
 function visit(file){
  if(done.has(file))return;
  done.add(file);
  if(!existsSync(file)||!statSync(file).isFile()){
   missing.push(relative(root,file));return;
  }
  const code=readFileSync(file,"utf8")
   .replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"");
  for(const match of code.matchAll(/\bimport\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']\s*;/g)){
   const spec=match[1];
   let dest;
   if(spec.startsWith("./")||spec.startsWith("../")){
    dest=resolve(dirname(file),spec);
   }else{
    const mapping=remaps.find(m=>spec.startsWith(m.prefix));
    if(!mapping){unknown.push(spec+" (from "+relative(root,file)+")");continue;}
    dest=resolve(mapping.target,spec.slice(mapping.prefix.length));
   }
   if(dest!==root&&!dest.startsWith(root+sep)){
    unknown.push("Import escapes project: "+spec);continue;
   }
   visit(dest);
  }
 }
 for(const src of sources)visit(src);
 if(missing.length||unknown.length){
  const paths=[...new Set(missing)].slice(0,12),unmapped=[...new Set(unknown)].slice(0,8);
  throw Error("Solidity dependencies incomplete: "+
   [...paths.map(p=>"missing "+p),...unmapped.map(p=>"unmapped "+p)].join("; ")+
   ". Deploy is blocked until vendor dependencies are repaired.");
 }
 return {sourceFiles:sources.length,verifiedImports:done.size};
}
