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
const security=src("contracts/XITADirectISMCore.sol");
for(const invariant of ["verifyInboundRoute","registry.verifyQuorum","registry.setId()","keccak256(message)","_encodeAuthorization(a)"])
 if(!security.includes(invariant))throw Error("Shared direct security invariant missing: "+invariant);
for(const [name,encoder] of [["BLS","XITADirectProtocol"],["ECDSA","XITADirectECDSAProtocol"]]){
 const adapter=src(`contracts/XITADirect${name}ISM.sol`);
 if(!adapter.includes(`contract XITADirect${name}ISM is XITADirectISMCore`)||
    !adapter.includes(`${encoder}.encode(a, address(this), address(registry))`)||
    /function verify\s*\(/.test(adapter))
  throw Error(`Direct ${name} must use the shared policy with its explicit wire adapter`);
}
for(const name of ["XGRInterchainValidatorRegistryV3","XGRInterchainECDSAValidatorRegistryV5"]){
 const adapter=src(`contracts/${name}.sol`);
 if(!adapter.includes(`contract ${name} is XGRInterchainRegistryCore`)||
    !adapter.includes("_applyMembership(")||
    /function (?:_settleRemoval|_addMember|_removeMember)\s*\(/.test(adapter))
  throw Error(`${name} must use the shared membership and reserve state machine`);
 const entry=adapter.indexOf("function applyMembership(");
 const measured=adapter.indexOf("uint256 gasStart = gasleft();",entry);
 const dispatch=adapter.indexOf("_applyMembership(",entry);
 if(measured<entry||measured>dispatch||!adapter.slice(dispatch).includes(", gasStart\n"))
  throw Error(`${name} must measure reimbursement before constructing adapter arguments`);
}
const transport=src("contracts/XITADirectTransport.sol");
if(!transport.includes("new Mailbox")||!transport.includes("new ProtocolFee"))
 throw Error("New transport missing immutable dispatch prerequisites");
const catalog=loadCatalog(ROOT);
// A new deployment is allowed only through the regular manifest/receipt validators.
// A clean development reset MUST NOT permanently forbid legitimate future deploys.
const errors=validateCatalog(catalog);
if(errors.length)throw Error("Invalid zero-deployment catalog: "+errors.join("; "));
console.log("PASS: Shared direct and registry cores, explicit BLS/ECDSA adapters, full security bindings, no Merkle Solidity; catalog validated without assuming a deployment count.");
