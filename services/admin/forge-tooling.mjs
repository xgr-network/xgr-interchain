// Resolve Forge for non-login systemd services. An interactive user's PATH
// is not inherited by the XITA Admin process, even when the service runs as
// the same Unix account. Never run a shell or accept executable paths from UI.
import {accessSync,constants,statSync} from "node:fs";
import {userInfo} from "node:os";
import {delimiter,isAbsolute,join} from "node:path";

function isRunnable(file){
 try {
  accessSync(file,constants.X_OK);
  return statSync(file).isFile();
 } catch {return false}
}
export function resolveForgeExecutable({
 env=process.env,
 userHome,
 systemPaths=["/usr/local/bin/forge","/usr/bin/forge"],
 isExecutable=isRunnable
}={}){
 const explicit=env.XITA_FORGE_BIN;
 if(explicit!==undefined){
  if(typeof explicit!=="string"||!isAbsolute(explicit)||!isExecutable(explicit))
   throw Error("XITA_FORGE_BIN must be an absolute path to an executable Forge binary");
  return explicit;
 }
 let actualHome=userHome;
 if(actualHome===undefined){
  try{actualHome=userInfo().homedir}catch{actualHome=""}
 }
 const homes=[actualHome,env.HOME].filter(h=>typeof h==="string"&&isAbsolute(h));
 const candidates=[
  ...homes.map(h=>join(h,".foundry","bin","forge")),
  ...String(env.PATH||"").split(delimiter).filter(isAbsolute).map(p=>join(p,"forge")),
  ...systemPaths
 ];
 const seen=new Set();
 for(const candidate of candidates){
  if(seen.has(candidate))continue;
  seen.add(candidate);
  if(isExecutable(candidate))return candidate;
 }
 throw Error("Foundry Forge is not executable for the XITA Admin service account. "+
  "Install Forge for the service user or configure the server-only XITA_FORGE_BIN "+
  "with its absolute executable path; the web wallet cannot repair this.");
}
