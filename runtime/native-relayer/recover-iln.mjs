#!/usr/bin/env node
// Permissionless, one-shot ILN v3.1.4 delivery recovery.
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
import {
  addLeaf,
  branchRoot,
  buildProofFromNodes,
  snapshotNodes,
} from "./merkle.mjs";
import { wrapAggregationMetadata } from "./metadata.mjs";
import {
  ILN_OPERATION_EVENT,
  encodeCheckpointPayloadV2,
  encodeISMMetadataV314,
  requireRouteId,
} from "./iln-codec.mjs";

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
const hookAbi = [
  "event InsertedIntoTree(bytes32 messageId,uint32 index)",
  "function tree() view returns (tuple(bytes32[32] branch,uint256 count))",
];
const registryAbi = [
  "function getRoute(uint32 destinationDomain,bytes32 routeId) view returns (uint64 sourceChainId,uint32 sourceDomain,address gateway,address sourceRouter,address mailbox,address merkleTreeHook,address destinationRouter,uint256 validatorFeeWei,bool enabled)",
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
const sourceHook = new Contract(originHookAddress, hookAbi, origin);
const sourceGateway = new Contract(originGatewayAddress, [ILN_OPERATION_EVENT, "function activationBlock() view returns (uint256)"], origin);
const sourceRegistry = new Contract(originRegistryAddress, registryAbi, origin);
const destMailbox = new Contract(destinationMailboxAddress, mailboxAbi, destination);
const destISM = new Contract(destinationISMAddress, destISMAbi, destination);

async function assertNetwork(provider, expected, name) {
  const actual = BigInt(await provider.send("eth_chainId", []));
  assert(actual === expected, `${name} chain ID mismatch`);
}

async function reconstructProof(operationBlock, checkpointIndex) {
  // The gateway operation and its Merkle insertion are in the same source tx.
  // Starting at the previous block reconstructs an exact fresh proof without
  // any persistent relayer files. An archive RPC speeds this up enormously.
  let start = operationBlock;
  let state;
  try {
    const snapshot = await sourceHook.tree({ blockTag: operationBlock - 1 });
    const branch = Array.from(snapshot.branch ?? snapshot[0]);
    const count = Number(snapshot.count ?? snapshot[1]);
    assert(Number.isSafeInteger(count), "invalid source Merkle tree count");
    state = {
      treeCount: count,
      snapshotCount: count,
      nodes: snapshotNodes(branch, count),
    };
  } catch {
    // An archive RPC is not required for correctness. Replaying public hook
    // events from genesis is slower but is not a private relayer dependency.
    start = 0;
    state = { treeCount: 0, snapshotCount: 0, nodes: {} };
    console.error("Historical hook snapshot unavailable; replaying public Merkle insertion logs from genesis.");
  }

  let messageIndex;
  for (let from = start; from <= operationBlock; from += chunkSize) {
    const to = Math.min(operationBlock, from + chunkSize - 1);
    const events = await sourceHook.queryFilter(sourceHook.filters.InsertedIntoTree(), from, to);
    events.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    for (const event of events) {
      const insertedId = lower(event.args.messageId);
      const insertedIndex = Number(event.args.index);
      addLeaf(state, insertedIndex, insertedId);
      if (insertedId === id && event.blockNumber === operationBlock) {
        assert(messageIndex === undefined, "duplicate source Merkle insertion");
        messageIndex = insertedIndex;
      }
    }
  }

  assert(messageIndex !== undefined, "authorized message has no source Merkle insertion");
  assert(checkpointIndex < state.treeCount, "source checkpoint is beyond the indexed Merkle tree");
  assert(messageIndex <= checkpointIndex, "message index exceeds signed checkpoint");
  const proof = buildProofFromNodes(
    state.nodes, messageIndex, checkpointIndex, state.snapshotCount,
  );
  return { messageIndex, proof };
}

async function main() {
  await Promise.all([
    assertNetwork(origin, originChainId, "source"),
    assertNetwork(destination, destinationChainId, "destination"),
    assertNetwork(attestations, 1643n, "XGR attestation"),
  ]);
  if (await destMailbox.delivered(id)) {
    console.log(JSON.stringify({ status: "ALREADY_DELIVERED", messageId: id }));
    return;
  }

  const [destinationISMRegistry, ismDomain] = await Promise.all([
    destISM.registry(), destISM.destinationDomain(),
  ]);
  assert(Number(ismDomain) === destinationDomain, "ISM destination domain mismatch");
  const destinationSet = new Contract(destinationISMRegistry, destSetAbi, destination);
  const [currentSetId, signatureFormat] = await Promise.all([
    destinationSet.setId(),
    destinationSet.verifierKeyFormat(),
  ]);
  let attestation;
  try {
    attestation = await attestations.send("xgr_getILNQuorumAttestation", [routeName, id, Number(currentSetId)]);
  } catch {
    // First-time delivery and post-rotation recovery use exactly the same
    // public request path. No relayer or operator-specific signing endpoint.
    let operationBlock = 0;
    if (!Number.isSafeInteger(operationBlock) || operationBlock <= 0) {
      const startBlock = Number(await sourceGateway.activationBlock());
      const confirmed = await origin.getBlockNumber() - confirmationDepth;
      assert(Number.isSafeInteger(startBlock) && startBlock > 0, "invalid gateway activation block");
      for (let from = startBlock; from <= confirmed; from += chunkSize) {
        const to = Math.min(confirmed, from + chunkSize - 1);
        const events = await sourceGateway.queryFilter(
          sourceGateway.filters.ILNOperation(routeId, id, destinationDomain), from, to,
        );
        if (events.length > 0) {
          assert(events.length === 1 && operationBlock === 0, "duplicate Gateway operations");
          operationBlock = events[0].blockNumber;
        }
      }
    }
    assert(operationBlock > 0, "canonical source Gateway operation not found");
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

  const operationBlock = Number(attestation.sourceBlockNumber);
  const checkpointIndex = Number(attestation.index);
  assert(Number.isSafeInteger(operationBlock) && operationBlock > 0, "invalid source block");
  assert(Number.isSafeInteger(checkpointIndex) && checkpointIndex >= 0, "invalid checkpoint index");
  const latestSource = await origin.getBlockNumber();
  assert(operationBlock <= latestSource - confirmationDepth, "source block not sufficiently confirmed");

  const historicRoute = await sourceRegistry.getRoute(destinationDomain, routeId, { blockTag: operationBlock });
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

  const operations = await sourceGateway.queryFilter(
    sourceGateway.filters.ILNOperation(routeId, id, destinationDomain),
    operationBlock, operationBlock,
  );
  assert(operations.length === 1, "expected exactly one canonical Gateway ILNOperation");
  const operation = operations[0];
  assert(
    BigInt(operation.args.validatorFeeWei) === BigInt(attestation.validatorFeeWei),
    "Gateway operation fee does not match signed fee",
  );
  // Gateway.bridge() enforces its native source fee atomically and emits
  // ILNOperation from its canonical address. Matching it with Dispatch in
  // the SAME successful receipt is the historical fee proof, not getRoute()
  // at block end (which can reflect subsequent governance changes).

  const dispatches = await sourceMailbox.queryFilter(
    sourceMailbox.filters.Dispatch(
      originWarpRouterAddress,
      destinationDomain,
      zeroPadValue(destinationRouterAddress, 32),
    ),
    operationBlock, operationBlock,
  );
  const matches = dispatches.filter((entry) => lower(keccak256(entry.args.message)) === id);
  assert(matches.length === 1, "expected exactly one matching source Mailbox.Dispatch");
  assert(matches[0].transactionHash === operation.transactionHash, "Gateway operation and Dispatch must share source transaction");
  const message = matches[0].args.message;

  const expectedPayload = encodeCheckpointPayloadV2({
    sourceChainId: originChainId,
    sourceDomain: originDomain,
    destinationDomain,
    routeId,
    setId: attestedSetId,
    sourceBlockNumber: BigInt(operationBlock),
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

  const { messageIndex, proof } = await reconstructProof(operationBlock, checkpointIndex);
  eq("Merkle inclusion root", branchRoot(id, proof, messageIndex), attestation.root);
  const inner = encodeISMMetadataV314({
    messageIndex,
    merkleProof: proof,
    sourceChainId: originChainId,
    sourceDomain: originDomain,
    destinationDomain,
    routeId,
    setId: attestedSetId,
    sourceBlockNumber: BigInt(operationBlock),
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
  console.error(JSON.stringify({ status: "RECOVERY_NOT_READY", messageId: id, error: error.message }, null, 2));
  process.exitCode = 1;
});
