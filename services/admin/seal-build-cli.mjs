import {sealArtifacts} from "./sealed-artifacts.mjs";
import {resolve} from "node:path";
const root=resolve(process.argv[2]||new URL("../../",import.meta.url).pathname);
const version=process.argv[3];
try{const seal=sealArtifacts(root,{forgeVersion:version,...(process.env.GITHUB_ACTIONS==="true"&&process.argv[4]?{commit:process.argv[4]}:{})});
 process.stdout.write("Sealed "+Object.keys(seal.artifacts).length+" artifacts at "+seal.sourceCommit+"\n");
}catch(e){process.stderr.write("Artifact seal failed: "+e.message+"\n");process.exitCode=1}
