import {verifySolidityImports} from "./solidity-imports.mjs";
import {resolve} from "node:path";
const root=resolve(process.argv[2]||new URL("../../",import.meta.url).pathname);
try{
 const report=verifySolidityImports(root);
 process.stdout.write("Complete Solidity imports: "+report.verifiedImports+" source files checked\n");
}catch(e){
 process.stderr.write("ERROR: "+e.message+"\n");
 process.exitCode=1;
}
