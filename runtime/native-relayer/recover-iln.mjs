#!/usr/bin/env node
// Permissionless, one-shot ILN v3.2.0 destination recovery.
// Reads only public RPC data and prints unsigned Mailbox.process calldata.
// No relayer service, persistent relayer state, privileged wallet or server secrets.
import {
  Contract,
  JsonRpcProvider,
  getAddress,
  getBytes,
  keccak256,
  zeroPadValue,
} from "ethers";
import {verifyV320ReplicaProof,verifyV320FeeAllocation} from "./iln-v320-proof.mjs";
import { wrapAggregationMetadata } from "./metadata.mjs";
import {
  ILN_OPERATION_EVENT,
  encodeCheckpointPayloadV2,
  encodeISMMetadataV314,
  requireRouteId,
} from "./iln-codec.mjs";
import {verifiedSourceReceiptEvidence} from "./receipt-evidence.mjs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
};
const integer = (name, fallback) => {
  const value = process.env[name] ?? String(fallback);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`invalid ${name}`);
  }
  return Number(value);
};
const lower = (v) => String(v).toLowerCase();
const eq = (label, actual, expected) => {
  if (lower(actual) !== lower(expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const isHash = (v) => /^0x[0-9a-fA-F]{64}$/.test(String(v));
const id = process.argv[2]?.toLowerCase();
let stage = "startup";
// Recovery progress is private stderr for the supervising proof worker; never
// include canonical message/transaction bytes or user-specific secrets.
const mark = value => { stage=value; console.error("XITA_RECOVERY_STAGE:"+stage); };

// Optional untrusted locator only: independently verify the successful source
// receipt, Gateway operation and matching Dispatch BEFORE requesting a quorum.
const sourceTxHash = process.env.SOURCE_TX_HASH?.toLowerCase() || "";
if (sourceTxHash && !isHash(sourceTxHash)) throw new Error("invalid source transaction hash");
if (!isHash(id)) {
  console.error("Usage: node recover-iln.mjs <0x-message-id>  (see docs/XETA_SPEC_V314.md)");
  process.exit(1);
}

const originChainId = BigInt(required("ORIGIN_CHAIN_ID"));
const originDomain = integer("ORIGIN_DOMAIN", 0);
const originRegistryAddress = getAddress(required("ORIGIN_ILN_REGISTRY"));
const originGatewayAddress = getAddress(required("ORIGIN_ILN_GATEWAY"));
const originWarpRouterAddress = getAddress(required("ORIGIN_WARP_ROUTER"));
const originMailboxAddress = getAddress(required("ORIGIN_MAILBOX"));
const originHookAddress = getAddress(required("ORIGIN_MERKLE_TREE_HOOK"));
const routeId = requireRouteId(required("ROUTE_ID"));
const destinationChainId = BigInt(required("DESTINATION_CHAIN_ID"));
const destinationDomain = integer("DESTINATION_DOMAIN", 0);
const destinationRouterAddress = getAddress(required("DESTINATION_WARP_ROUTER"));
const destinationMailboxAddress = getAddress(required("DESTINATION_MAILBOX"));
const destinationISMAddress = getAddress(required("DESTINATION_ILN_ISM"));
const routeName = required("ATTESTATION_ROUTE").toLowerCase();
const confirmationDepth = integer("ORIGIN_CONFIRMATIONS", 1);
const chunkSize = integer("ORIGIN_LOG_CHUNK", 1000);
const aggregationCount = integer("DESTINATION_AGGREGATION_MODULE_COUNT", 0);
const aggregationInner = integer("DESTINATION_AGGREGATION_INNER_INDEX", 0);
const aggregationEmpty = (process.env.DESTINATION_AGGREGATION_EMPTY_INDEXES ?? "")
  .split(",").filter(Boolean).map((v) => {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid aggregation index");
    return n;
  });
assert(originDomain > 0 && destinationDomain > 0, "domains must be positive");
assert(confirmationDepth >= 1, "ORIGIN_CONFIRMATIONS must be at least one");
assert(chunkSize >= 1 && chunkSize <= 1000, "ORIGIN_LOG_CHUNK must be 1..1000");

const origin = new JsonRpcProvider(required("ORIGIN_RPC_URL"));
const destination = new JsonRpcProvider(required("DESTINATION_RPC_URL"));
const attestations = new JsonRpcProvider(required("ATTESTATION_RPC_URL"));

const mailboxAbi = [
  "event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)",
  "function delivered(bytes32 messageId) view returns (bool)",
  "function process(bytes metadata,bytes message) payable",
];
const registryAbi = [
  "function getRoute(uint32 destinationDomain,bytes32 routeId) view returns (uint64 sourceChainId,uint32 sourceDomain,address gateway,address sourceRouter,address mailbox,address merkleTreeHook,address destinationRouter,uint256 validatorFeeWei,bool enabled)",
  "function factory() view returns (address)",
];
const destISMAbi = [
  "function registry() view returns (address)",
  "function destinationDomain() view returns (uint32)",
];
const destSetAbi = [
  "function setId() view returns (uint64)",
  "function verifierKeyFormat() view returns (uint8)",
];

const sourceMailbox = new Contract(originMailboxAddress, mailboxAbi, origin);
const sourceGateway = new Contract(originGatewayAddress, [ILN_OPERATION_EVENT,
  "function activationBlock() view returns (uint256)",
  "function feeVault() view returns (address)"], origin);
const sourceRegistry = new Contract(originRegistryAddress, registryAbi, origin);
const destMailbox = new Contract(destinationMailboxAddress, mailboxAbi, destination);
const destISM = new Contract(destinationISMAddress, destISMAbi, destination);

async function assertNetwork(provider, expected, name) {
  const actual = BigInt(await provider.send("eth_chainId", []));
  assert(actual === expected, `${name} chain ID mismatch`);
}

async function sourceEvidenceFromReceipt(hash) {
 const receipt=await origin.getTransactionReceipt(hash);
 const evidence=verifiedSourceReceiptEvidence({
  receipt,sourceTxHash:hash,routeId,messageId:id,destinationDomain,
  gateway:originGatewayAddress,sourceRouter:originWarpRouterAddress,
  sourceMailbox:originMailboxAddress,destinationRouter:destinationRouterAddress
 });
 const finalized=await origin.getBlockNumber()-confirmationDepth+1;
 assert(evidence.blockNumber<=finalized,"canonical source receipt not finalized");
 return evidence;
}

// Optional no-TX-hint fallback: lookup only the immutable Gateway operation
// necessary to identify the original source block and serialized Dispatch.
// This is NOT Merkle proof reconstruction or validator fee authorization.
async function findOriginalOperationBlock() {
  const startBlock=Number(await sourceGateway.activationBlock());
  const confirmed=Number(await origin.getBlockNumber()) - confirmationDepth;
  assert(Number.isSafeInteger(startBlock) && startBlock>0 &&
    confirmed>=startBlock,"invalid source Gateway activation/confirmed head");
  let operationBlock=0;
  for(let from=startBlock;from<=confirmed;from+=chunkSize) {
    const to=Math.min(confirmed,from+chunkSize-1);
    const entries=await sourceGateway.queryFilter(
      sourceGateway.filters.ILNOperation(routeId,id,destinationDomain),from,to);
    for(const event of entries) {
      assert(!operationBlock,"multiple source Gateway operations for the same message ID");
      operationBlock=event.blockNumber;
    }
  }
  assert(operationBlock>0,"canonical source Gateway operation not found; provide SOURCE_TX_HASH for direct receipt recovery");
  return operationBlock;
}

async function main() {
  mark("verify-chain-ids");
  await Promise.all([
    assertNetwork(origin, originChainId, "source"),
    assertNetwork(destination, destinationChainId, "destination"),
    assertNetwork(attestations, 1643n, "XGR attestation"),
  ]);
  mark("destination-delivery");
  if (await destMailbox.delivered(id)) {
    console.log(JSON.stringify({ status: "ALREADY_DELIVERED", messageId: id }));
    return;
  }

  mark("destination-ism-registry");
  const [destinationISMRegistry, ismDomain] = await Promise.all([
    destISM.registry(), destISM.destinationDomain(),
  ]);
  assert(Number(ismDomain) === destinationDomain, "ISM destination domain mismatch");
  const destinationSet = new Contract(destinationISMRegistry, destSetAbi, destination);
  const [currentSetId, signatureFormat] = await Promise.all([
    destinationSet.setId(),
    destinationSet.verifierKeyFormat(),
  ]);
  let sourceEvidence=null;
  let originalOperationBlock=0;
  if(sourceTxHash){
   mark("source-receipt");
   sourceEvidence=await sourceEvidenceFromReceipt(sourceTxHash);
  }
  mark("get-validator-attestation");
  let attestation;
  try {
    attestation = await attestations.send("xgr_getILNQuorumAttestation", [routeName, id, Number(currentSetId)]);
  } catch {
    // First-time delivery and post-rotation recovery use exactly the same
    // public request path. No relayer or operator-specific signing endpoint.
    mark("source-receipt");
    const operationBlock=sourceEvidence?.blockNumber||await findOriginalOperationBlock();
    originalOperationBlock=operationBlock;
    assert(operationBlock > 0, "canonical source Gateway operation not found");
    mark("request-validator-quorum");
    await attestations.send("xgr_requestILNQuorum", [routeName, id, operationBlock]);
    try {
      attestation = await attestations.send("xgr_getILNQuorumAttestation", [routeName, id, Number(currentSetId)]);
    } catch {
      console.log(JSON.stringify({
        status: "PENDING",
        messageId: id,
        route: routeName,
        sourceBlockNumber: operationBlock,
        currentSetId: String(currentSetId),
        note: "Public quorum requested. Rerun the same command after the validators finish their independent source and destination checks.",
      }, null, 2));
      return;
    }
  }

  mark("validate-attestation");
  eq("attestation route name", attestation.chain, routeName);
  eq("attestation message ID", attestation.authorizedMessageId, id);
  eq("attestation route ID", attestation.routeId, routeId);
  eq("attestation source registry", attestation.registry, originRegistryAddress);
  eq("attestation source gateway", attestation.gateway, originGatewayAddress);
  eq("attestation source router", attestation.sourceRouter, originWarpRouterAddress);
  eq("attestation source mailbox", attestation.mailbox, originMailboxAddress);
  eq("attestation source Merkle hook", attestation.merkleTreeHook, originHookAddress);
  eq("attestation destination router", attestation.destinationRouter, destinationRouterAddress);
  assert(attestation.version === "XGR_ILN_CHECKPOINT_V2", "attestation protocol version mismatch");
  assert(BigInt(attestation.originChainId) === originChainId, "attestation source chain mismatch");
  assert(Number(attestation.originDomain) === originDomain, "attestation source domain mismatch");
  assert(Number(attestation.destinationDomain) === destinationDomain, "attestation destination domain mismatch");

  const attestedSetId = BigInt(attestation.setId);
  if (attestedSetId !== BigInt(currentSetId)) {
    console.log(JSON.stringify({
      status: "FRESH_QUORUM_REQUIRED",
      messageId: id,
      route: routeName,
      obsoleteSetId: attestedSetId.toString(),
      currentSetId: currentSetId.toString(),
      note: "Destination rejects old quorum. Validators must re-attest the ORIGINAL fee-qualified message; do not bridge again.",
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const checkpointBlock = Number(attestation.sourceBlockNumber);
  const checkpointIndex = Number(attestation.index);
  assert(Number.isSafeInteger(checkpointBlock) && checkpointBlock > 0,
    "invalid signed confirmed Hook checkpoint block");
  assert(Number.isSafeInteger(checkpointIndex) && checkpointIndex >= 0, "invalid checkpoint index");
  const latestSource = await origin.getBlockNumber();
  assert(checkpointBlock <= latestSource - confirmationDepth,
    "source Hook checkpoint not sufficiently confirmed");
  if(sourceEvidence)assert(sourceEvidence.blockNumber<=checkpointBlock,
    "original source transaction occurred after signed Hook checkpoint");

  // Validator-native proof; V315 route bindings are append-only,
  // while their global fee can change; the original fee is authenticated by the
  // successful Gateway ILNOperation + matching Mailbox.Dispatch receipt.
  // Never use the current registry fee as historical transfer authorization.
  const routeFactory = await sourceRegistry.factory();
  assert(routeFactory !== "0x0000000000000000000000000000000000000000",
    "source ILN registry does not expose a valid append-only V315 factory");
  const historicRoute = await sourceRegistry.getRoute(destinationDomain, routeId);
  // A governance action later in the same source block may disable this route.
  // An emitted fee-qualified operation from the canonical immutable Gateway
  // proves the route was enabled when bridge() actually executed.
  // Block-end 'enabled' is NOT a valid test of earlier tx state.
  assert(BigInt(historicRoute.sourceChainId) === originChainId, "historic route source chain mismatch");
  assert(Number(historicRoute.sourceDomain) === originDomain, "historic route source domain mismatch");
  for (const [field, actual, expected] of [
    ["gateway", historicRoute.gateway, originGatewayAddress],
    ["sourceRouter", historicRoute.sourceRouter, originWarpRouterAddress],
    ["mailbox", historicRoute.mailbox, originMailboxAddress],
    ["merkleTreeHook", historicRoute.merkleTreeHook, originHookAddress],
    ["destinationRouter", historicRoute.destinationRouter, destinationRouterAddress],
  ]) eq(`historic route ${field}`, actual, expected);

  let operationFeeWei,message;
  const operationBlock=sourceEvidence?.blockNumber ||
    originalOperationBlock || await findOriginalOperationBlock();
  assert(operationBlock<=checkpointBlock,
    "source Gateway operation occurred after signed Hook checkpoint");
  if(sourceEvidence){
    // Receipt verifies BOTH events in the very same successful source tx.
    // Do not rescan this historical Gateway/Mailbox block via eth_getLogs.
    operationFeeWei=sourceEvidence.validatorFeeWei;
    message=sourceEvidence.message;
  }else{
    // Permissionless fallback when the source transaction hash is unknown.
    const operations=await sourceGateway.queryFilter(
      sourceGateway.filters.ILNOperation(routeId,id,destinationDomain),
      operationBlock,operationBlock);
    assert(operations.length===1,"expected exactly one canonical Gateway ILNOperation");
    operationFeeWei=BigInt(operations[0].args.validatorFeeWei);
    const dispatches=await sourceMailbox.queryFilter(
      sourceMailbox.filters.Dispatch(
        originWarpRouterAddress,destinationDomain,
        zeroPadValue(destinationRouterAddress,32),
      ),operationBlock,operationBlock);
    const matches=dispatches.filter(entry=>lower(keccak256(entry.args.message))===id);
    assert(matches.length===1,"expected exactly one matching source Mailbox.Dispatch");
    assert(matches[0].transactionHash===operations[0].transactionHash,
      "Gateway operation and Dispatch must share source transaction");
    message=matches[0].args.message;
  }
  // Original receipt/Dispatch establishes canonical message bytes.
  // The source FeeVault records the immutable *per-message* allocation,
  // while the later BLS checkpoint signs the then-current source fee policy.
  // Those two amounts may legitimately differ after fee governance changes.
  mark("confirmed-fee-vault-allocation");
  const feeVaultAddress=getAddress(await sourceGateway.feeVault());
  const feeVault=new Contract(feeVaultAddress,[
    "function allocatedOperation(bytes32) view returns (bool)",
    "function allocatedSetId(bytes32) view returns (uint64)",
    "function gateway() view returns (address)",
    "function routeId() view returns (bytes32)",
    "function destinationDomain() view returns (uint32)",
  ],origin);
  const [allocated,feeSetId,vaultGateway,vaultRouteId,vaultDomain]=await Promise.all([
    // These mappings are write-once on the immutable FeeVault; the signed
    // checkpoint still must follow the authenticated source receipt.
    feeVault.allocatedOperation(id),
    feeVault.allocatedSetId(id),
    feeVault.gateway(),feeVault.routeId(),feeVault.destinationDomain(),
  ]);
  eq("source FeeVault gateway",vaultGateway,originGatewayAddress);
  eq("source FeeVault route",vaultRouteId,routeId);
  assert(Number(vaultDomain)===destinationDomain,"source FeeVault destination mismatch");
  verifyV320FeeAllocation({
    originalFeeWei:operationFeeWei,checkpointFeeWei:attestation.validatorFeeWei,
    allocated,setId:feeSetId,
  });

  const expectedPayload = encodeCheckpointPayloadV2({
    sourceChainId: originChainId,
    sourceDomain: originDomain,
    destinationDomain,
    routeId,
    setId: attestedSetId,
    sourceBlockNumber: BigInt(checkpointBlock),
    registry: originRegistryAddress,
    gateway: originGatewayAddress,
    sourceRouter: originWarpRouterAddress,
    mailbox: originMailboxAddress,
    merkleTreeHook: originHookAddress,
    destinationRouter: destinationRouterAddress,
    validatorFeeWei: BigInt(attestation.validatorFeeWei),
    authorizedMessageId: id,
    root: attestation.root,
    index: checkpointIndex,
  });
  eq("canonical signed payload", attestation.payload, expectedPayload);

  const selectedSignature = Number(signatureFormat) === 1
    ? attestation.aggregateSignatureCompressed
    : Number(signatureFormat) === 2
      ? attestation.aggregateSignature
      : null;
  assert(selectedSignature, "destination registry requires an unsupported BLS signature format");
  assert(
    getBytes(selectedSignature).length === (Number(signatureFormat) === 1 ? 96 : 256),
    "incorrect BLS signature length",
  );

  mark("merkle-proof");
  const replicaProof=await attestations.send("xgr_getILNReplicaProof",[routeName,id]);
  const {messageIndex,proof}=verifyV320ReplicaProof({
    response:replicaProof,attestation,route:routeName,messageId:id,
    sourceChainId:originChainId,hook:originHookAddress,
  });
  const inner = encodeISMMetadataV314({
    messageIndex,
    merkleProof: proof,
    sourceChainId: originChainId,
    sourceDomain: originDomain,
    destinationDomain,
    routeId,
    setId: attestedSetId,
    sourceBlockNumber: BigInt(checkpointBlock),
    registry: originRegistryAddress,
    gateway: originGatewayAddress,
    sourceRouter: originWarpRouterAddress,
    mailbox: originMailboxAddress,
    merkleTreeHook: originHookAddress,
    destinationRouter: destinationRouterAddress,
    validatorFeeWei: BigInt(attestation.validatorFeeWei),
    authorizedMessageId: id,
    root: attestation.root,
    checkpointIndex,
    signerBitmap: attestation.signerBitmap,
    aggregateSignature: selectedSignature,
  });
  const metadata = aggregationCount === 0
    ? inner
    : wrapAggregationMetadata(inner, aggregationCount, aggregationInner, aggregationEmpty);

  // This eth_call checks actual destination ISM routing and current quorum.
  // No transaction or fee is submitted by this script.
  mark("simulate-base-delivery");
  await destMailbox.process.staticCall(metadata, message);
  assert(BigInt(await destinationSet.setId()) === attestedSetId, "validator set changed during recovery preparation");
  assert(!(await destMailbox.delivered(id)), "message was delivered during recovery preparation");

  console.log(JSON.stringify({
    status: "READY_UNSIGNED_CALL",
    messageId: id,
    route: routeName,
    setId: attestedSetId.toString(),
    destinationChainId: destinationChainId.toString(),
    to: destinationMailboxAddress,
    value: "0x0",
    data: destMailbox.interface.encodeFunctionData("process", [metadata, message]),
    note: "Any account may submit this public calldata with its own wallet and pay destination gas. Recheck delivered and setId immediately before sending.",
  }, null, 2));
}
main().catch((error) => {
  const inner=error?.info?.error||error?.error;
  const rpcCode=Number.isInteger(inner?.code)?inner.code:
    Number.isInteger(error?.code)?error.code:null;
  console.error("XITA_RECOVERY_DIAGNOSTIC:"+JSON.stringify({
    status:"RECOVERY_NOT_READY",messageId:id,stage,rpcCode,
    // Preserve the *node's* JSON-RPC failure reason when ethers wraps it in
    // a generic "could not coalesce" message. Keep full detail private to logs.
    error:String(inner?.message||error?.shortMessage||error?.message||"Unknown proof failure").slice(0,1500)
  }));
  process.exitCode=1;
});
