import {readFileSync,readdirSync,existsSync} from "node:fs";
import {join} from "node:path";
import {loadCatalog,validateCatalog,ROOT} from "./validate-manifests.mjs";
const path=p=>join(ROOT,p);
const src=p=>readFileSync(path(p),"utf8");
const deny=["contracts/XGRILNInterchainISMV2.sol","contracts/XITAFreshTransportV315.sol"];
for(const p of deny)if(existsSync(path(p)))throw Error("Removed Merkle legacy contract still tracked: "+p);
const retained=readdirSync(path("contracts")).filter(n=>n.endsWith(".sol"));
for(const name of retained){
 const code=src("contracts/"+name);
 if(/MerkleTreeHook|merkleTreeHook|ILNCheckpointPayload|VerifiedILNMessagePrefix/.test(code))
  throw Error("Legacy Merkle dependency remains in Solidity: "+name);
}
const security=src("contracts/XITADirectBLSISM.sol");
for(const invariant of ["verifyInboundRoute","registry.verifyQuorum","registry.setId()","keccak256(message)","XITADirectProtocol.encode"])
 if(!security.includes(invariant))throw Error("Direct BLS security invariant missing: "+invariant);
const transport=src("contracts/XITADirectTransport.sol");
if(!transport.includes("new Mailbox")||!transport.includes("new ProtocolFee"))
 throw Error("New transport missing immutable dispatch prerequisites");
const catalog=loadCatalog(ROOT);
// A new deployment is allowed only through the regular manifest/receipt validators.
// A clean development reset MUST NOT permanently forbid legitimate future deploys.
const errors=validateCatalog(catalog);
if(errors.length)throw Error("Invalid zero-deployment catalog: "+errors.join("; "));
console.log("PASS: Direct-BLS core only, full security bindings, no Merkle Solidity; catalog validated without assuming a deployment count.");
