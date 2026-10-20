// Pure v3.2.0 proof verifier shared by XITA's permissionless recovery CLI.
// The validator provides data, not authority. Mailbox.process.staticCall
// remains the final on-chain BLS/ISM validation before any unsigned calldata.
import {branchRoot} from "./merkle.mjs";

const HASH = /^0x[0-9a-f]{64}$/i;
const ADDR = /^0x[0-9a-f]{40}$/i;
function check(value, reason) {
  if (!value) throw new Error(reason);
}
function same(a,b) {
  return typeof a === "string" && typeof b === "string" &&
    a.toLowerCase() === b.toLowerCase();
}
function integer(value, name, {positive = false} = {}) {
  const n = Number(value);
  check(Number.isSafeInteger(n) && n >= (positive ? 1 : 0),
    "invalid " + name + " in XGR v3.2.0 inclusion proof");
  return n;
}
export function verifyV320ReplicaProof({
  response, attestation, route, messageId, sourceChainId, hook,
}) {
  check(response && attestation && typeof route === "string" &&
    HASH.test(messageId) && ADDR.test(hook),
  "missing XGR v3.2.0 proof identity");
  check(response.route === route && same(response.messageId,messageId) &&
    same(response.merkleTreeHook,hook) &&
    integer(response.originChainId, "origin chain", {positive:true}) ===
      integer(sourceChainId,"expected origin chain",{positive:true}),
  "validator Merkle proof belongs to another source route");
  check(HASH.test(response.root) &&
    same(response.root,attestation.root),
  "validator Merkle proof does not match BLS-signed root");
  const checkpointBlock = integer(response.checkpointBlock,"checkpoint block",{positive:true});
  const checkpointIndex = integer(response.checkpointIndex,"checkpoint index");
  const messageIndex = integer(response.messageIndex,"message index");
  // Hyperlane source tree is append-only. A later verified replica with the
  // same independently reconstructed root/count proves the signed prefix.
  // Never accept a replica OLDER than the attested checkpoint.
  check(checkpointBlock >= integer(attestation.sourceBlockNumber,
    "attestation checkpoint block",{positive:true}) &&
    checkpointIndex === integer(attestation.index,"attestation checkpoint index") &&
    messageIndex <= checkpointIndex,
  "validator Merkle proof checkpoint/index does not match BLS attestation");
  const quorum = response.quorum;
  check(quorum && same(quorum.authorizedMessageId,messageId) &&
    same(quorum.root,attestation.root) &&
    same(quorum.payload,attestation.payload) &&
    same(quorum.routeId,attestation.routeId) &&
    same(quorum.registry,attestation.registry) &&
    integer(quorum.setId,"proof quorum set",{positive:true}) ===
      integer(attestation.setId,"attestation set",{positive:true}),
  "validator Merkle proof quorum differs from current destination-set attestation");
  const proof = response.merkleProof;
  check(Array.isArray(proof) && proof.length === 32 &&
    proof.every(x => typeof x === "string" && HASH.test(x)),
  "validator Merkle proof must contain exactly 32 valid siblings");
  check(same(branchRoot(messageId,proof,messageIndex),attestation.root),
    "validator Merkle proof does not reconstruct the signed source root");
  return {messageIndex,proof,checkpointBlock,checkpointIndex};
}

// Historical Gateway fees are genuine source receipt evidence but do not
// have to equal the fee policy signed by a later confirmed Merkle checkpoint.
export function verifyV320FeeAllocation({
  originalFeeWei,checkpointFeeWei,allocated,setId,
}) {
  check(BigInt(originalFeeWei) > 0n && BigInt(checkpointFeeWei) > 0n,
    "missing mandatory source-native ILN validator fee");
  check(allocated === true && BigInt(setId) > 0n,
    "source FeeVault did not allocate this message at checkpoint");
  return true;
}
