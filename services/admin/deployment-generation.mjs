// Direct-BLS development reset generation boundary. Never carry pre-reset WAL
// deployment intents into the new Direct-BLS contract inventory.
// Commit da3f311 completed the explicit XITA development hard reset.
import {spawnSync} from "node:child_process";
export const RESET_COMMIT="da3f31163b5a4c23af77042acbba3939f1ca477f";
export function isPreResetIntent(root,entry,{run}={}){
 const git=run||((args)=>{
  const r=spawnSync("git",["-C",root,...args],{timeout:2500,stdio:"ignore"});
  return r.status;
 });
 if(!/^[a-f0-9]{40}$/i.test(entry?.sourceCommit||""))return false;
 // Both commits must exist: unknown ancestry is NEVER permission to discard.
 if(git(["cat-file","-e",RESET_COMMIT+"^{commit}"])!==0||
    git(["cat-file","-e",entry.sourceCommit+"^{commit}"])!==0)return false;
 return git(["merge-base","--is-ancestor",RESET_COMMIT,entry.sourceCommit])===1;
}
