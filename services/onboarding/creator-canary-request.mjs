// Prepare a private XITA Canary test request from a project wallet,
// a mailbox controlled by the operator and an existing PNG logo.
// Writes NO keys, signatures, or transactions.
import {readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {normalizeCreatorApplication} from "./creator-registration.mjs";
import {privateLocation,preparePrivateDir} from "./private-store.mjs";
const fail=x=>{throw Error(x)};
const [owner,email,logoPath]=process.argv.slice(2);
if(!owner||!email||!logoPath||process.argv.length!==5)
 fail("Usage: XITA_JOIN_PRIVATE_DIR=/var/lib/xita/join node services/onboarding/creator-canary-request.mjs <owner-address> <email> <logo.png>");
const logo=readFileSync(logoPath);
const input={
 name:"XITA Canary",symbol:"XITACAN",initialSupply:"1000",
 ownerAddress:owner,tokenType:"burnable",decimals:18,maxSupply:"1000",
 minterAddress:null,permit:false,
 shortDescription:"Internal XITA deployment validation token.",
 description:"An internal XGRChain ERC-20 canary to validate the production XITA Token Creator email verification, verified token deployment and Draft Join proposal.",
 website:"https://xgr.network",categories:["Infrastructure"],tags:[],
 applicantRole:"core-team",contactEmail:email,links:{},
 confirmed:true,logoPngBase64:logo.toString("base64")
};
normalizeCreatorApplication(input);
const dir=preparePrivateDir(privateLocation());
const file=join(dir,"canary-request.json");
writeFileSync(file,JSON.stringify(input),{flag:"wx",mode:0o600});
console.log("Private canary request ready:",file);
console.log("It contains private contact details; do not print or upload its contents.");
console.log("Factory and signing worker remain untouched.");
