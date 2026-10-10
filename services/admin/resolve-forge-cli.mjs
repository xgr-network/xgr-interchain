import {resolveForgeExecutable} from "./forge-tooling.mjs";
try{
 process.stdout.write(resolveForgeExecutable()+"\n");
}catch(e){
 process.stderr.write("ERROR: "+e.message+"\n");
 process.exitCode=1;
}
