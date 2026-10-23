// Validate actual, sealed production Foundry constructor ABIs against the
// Admin's exact trusted-template layout before anyone spends mainnet gas.
// This is an OFFLINE check: no wallet access or RPC transaction is needed.
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {artifactTemplate,SOURCE,trustedConstructorTypes} from "./trusted-artifacts.mjs";
import {chainDraftConstructorTypes} from "./chain-transaction-draft.mjs";
import {readSealedArtifacts,NAMES} from "./sealed-artifacts.mjs";

const root=resolve(process.argv[2]||".");
const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
const {seal,raws}=readSealedArtifacts(root,commit);
const keys=Object.entries(SOURCE);
const names=new Set(keys.map(([,name])=>name));
if(names.size!==NAMES.length||NAMES.some(name=>!names.has(name)))
 throw Error("Trusted component inventory is inconsistent with sealed production artifacts");
for(const [component,types] of Object.entries(chainDraftConstructorTypes)){
 if(types.join(",")!==trustedConstructorTypes[component]?.join(","))
  throw Error("Admin transaction-encoder ABI differs from the trusted compiled-contract ABI: "+component);
}
for(const [component,name] of keys){
 const result=artifactTemplate(raws[name],{
  component,commit,forgeVersion:seal.forgeVersion
 });
 if(result.creation.length<100||result.runtime.length<100)
  throw Error("Empty sealed production artifact for "+component);
}
console.log("PASS: every trusted constructor ABI and creation/runtime artifact matches the sealed Foundry build ("+keys.length+" contracts)");
