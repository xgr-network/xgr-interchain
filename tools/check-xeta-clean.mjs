import {readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
const get=p=>readFileSync(resolve(p),"utf8");
const errs=[];
if(existsSync("docs/ILN.md"))errs.push("obsolete ILN.md");
if(get("README.md").includes("\\n"))errs.push("literal newline escapes in README");
if(get("README.md").includes("XETAGatewayOnlyRouterGuard.sol"))errs.push("obsolete guard in README");
const runner=get("runtime/manage-relayers.sh");
if(!runner.includes("configured_routes()"))errs.push("missing generic route discovery");
if(runner.includes("forward, reverse"))errs.push("legacy routes in manager");
const relay=get("runtime/native-relayer/iln.mjs");
if(relay.includes("xgr_getILNInterchainAttestation"))errs.push("legacy attestation RPC");
if(!relay.includes('env("DESTINATION_ILN_ISM")'))errs.push("ISM is optional");

const forbiddenFiles=[
  "README.md","SECURITY.md","docs/XETA_SPEC_V314.md",
  "docs/XETA_UI_ARCHITECTURE.md","docs/REPOSITORY_LAYOUT.md",
  "docs/XETA_ROUTER_ARCHITECTURE.md","contracts/README.md",
  "apps/web/README.md","apps/web/app.mjs"
];
const forbidden=/v3[.]1[.]1|historical 0[.]9|legacy (bridge|redemption|on-chain)|xgr_getILNInterchainAttestation|PausableISM inside a 2-of-2/i;
for(const path of forbiddenFiles){
  if(forbidden.test(get(path)))errs.push("retired bridge reference in "+path);
}
if(get("runtime/native-relayer/recover-iln.mjs").includes("xgr_getILNInterchainAttestation"))
  errs.push("recovery uses retired attestation RPC");
const routes=JSON.parse(get("config/assets/XGR/routes.json")).routes;
if(routes.length!==6||routes.some(r=>r.sourceChain!=="xgrchain"&&r.destinationChain!=="xgrchain"))errs.push("hub routes invalid");
if(errs.length){for(const e of errs)console.error(e);process.exitCode=1}
else console.log("PASS: clean XETA routes and runtime invariants");
