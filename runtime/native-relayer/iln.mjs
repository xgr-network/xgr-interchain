import fs from "node:fs";
import path from "node:path";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  getAddress,
  getBytes,
  keccak256,
} from "ethers";
import {
  addLeaf,
  branchRoot,
  buildProofFromNodes,
  snapshotNodes,
} from "./merkle.mjs";
import { wrapAggregationMetadata } from "./metadata.mjs";
import { ILN_OPERATION_EVENT, requireRouteId, encodeCheckpointPayloadV2, encodeISMMetadataV314 } from "./iln-codec.mjs";

const env = (name, fallback = undefined) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") throw new Error(`missing ${name}`);
  return value;
};

const optionalNumber = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
};

const ORIGIN_RPC_URL = env("ORIGIN_RPC_URL");
const ORIGIN_CHAIN_ID = BigInt(env("ORIGIN_CHAIN_ID"));
const ORIGIN_DOMAIN = Number(env("ORIGIN_DOMAIN"));
const ORIGIN_MAILBOX = getAddress(env("ORIGIN_MAILBOX"));
const ORIGIN_MERKLE_TREE_HOOK = getAddress(env("ORIGIN_MERKLE_TREE_HOOK"));
const ORIGIN_ILN_REGISTRY = getAddress(env("ORIGIN_ILN_REGISTRY"));
const ROUTE_ID = requireRouteId(env("ROUTE_ID"));
const ORIGIN_ILN_GATEWAY = getAddress(env("ORIGIN_ILN_GATEWAY"));
const ORIGIN_WARP_ROUTER = getAddress(env("ORIGIN_WARP_ROUTER"));

const ATTESTATION_RPC_URL = env("ATTESTATION_RPC_URL");
const ATTESTATION_CHAIN_ID = BigInt(env("ATTESTATION_CHAIN_ID"));
const ATTESTATION_ROUTE = env("ATTESTATION_ROUTE");
const ATTESTATION_SIGNATURE_FORMAT = env(
  "ATTESTATION_SIGNATURE_FORMAT",
  "compressed",
).toLowerCase();

if (
  ATTESTATION_SIGNATURE_FORMAT !== "compressed" &&
  ATTESTATION_SIGNATURE_FORMAT !== "eip2537"
) {
  throw new Error(
    "ATTESTATION_SIGNATURE_FORMAT must be compressed or eip2537",
  );
}

const DESTINATION_RPC_URL = env("DESTINATION_RPC_URL");
const DESTINATION_CHAIN_ID = BigInt(env("DESTINATION_CHAIN_ID"));
const DESTINATION_DOMAIN = Number(env("DESTINATION_DOMAIN"));
const DESTINATION_MAILBOX = getAddress(env("DESTINATION_MAILBOX"));
const DESTINATION_WARP_ROUTER = getAddress(env("DESTINATION_WARP_ROUTER"));
const DESTINATION_ILN_ISM = getAddress(env("DESTINATION_ILN_ISM"));
const RELAYER_PRIVATE_KEY = env("RELAYER_PRIVATE_KEY");

const CONFIGURED_START_BLOCK = optionalNumber("ORIGIN_START_BLOCK", 0);
const CONFIRMATIONS = optionalNumber("ORIGIN_CONFIRMATIONS", 1);
const POLL_MS = optionalNumber("POLL_INTERVAL_MS", 3000);
const LOG_CHUNK = optionalNumber("ORIGIN_LOG_CHUNK", 1000);
const COMPACT_AFTER_LEAVES = optionalNumber(
  "RELAYER_COMPACT_AFTER_LEAVES",
  10000,
);
const STATE_PATH = env(
  "RELAYER_STATE_PATH",
  "/data/native-iln-relayer-state.json",
);

const RELAYER_SUBMIT_RAW = env("RELAYER_SUBMIT", "false").toLowerCase();
if (RELAYER_SUBMIT_RAW !== "true" && RELAYER_SUBMIT_RAW !== "false") {
  throw new Error("RELAYER_SUBMIT must be true or false");
}
const RELAYER_SUBMIT = RELAYER_SUBMIT_RAW === "true";

const DESTINATION_AGGREGATION_MODULE_COUNT = optionalNumber(
  "DESTINATION_AGGREGATION_MODULE_COUNT",
  0,
);
const DESTINATION_AGGREGATION_INNER_INDEX = optionalNumber(
  "DESTINATION_AGGREGATION_INNER_INDEX",
  0,
);
const DESTINATION_AGGREGATION_EMPTY_INDEXES = (
  process.env.DESTINATION_AGGREGATION_EMPTY_INDEXES ?? ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    const index = Number(value);
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new Error(
        "DESTINATION_AGGREGATION_EMPTY_INDEXES contains an invalid index",
      );
    }
    return index;
  });

for (const [name, value] of [
  ["ORIGIN_DOMAIN", ORIGIN_DOMAIN],
  ["DESTINATION_DOMAIN", DESTINATION_DOMAIN],
]) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}
if (CONFIRMATIONS < 1) {
  throw new Error("ORIGIN_CONFIRMATIONS must be at least 1");
}
if (LOG_CHUNK < 1 || LOG_CHUNK > 1000) {
  throw new Error("ORIGIN_LOG_CHUNK must be between 1 and 1000");
}
if (POLL_MS < 250) {
  throw new Error("POLL_INTERVAL_MS must be at least 250");
}
if (
  DESTINATION_AGGREGATION_MODULE_COUNT > 0 &&
  DESTINATION_AGGREGATION_INNER_INDEX >=
    DESTINATION_AGGREGATION_MODULE_COUNT
) {
  throw new Error("DESTINATION_AGGREGATION_INNER_INDEX is invalid");
}
for (const index of DESTINATION_AGGREGATION_EMPTY_INDEXES) {
  if (index >= DESTINATION_AGGREGATION_MODULE_COUNT) {
    throw new Error(
      "DESTINATION_AGGREGATION_EMPTY_INDEXES contains an out-of-range index",
    );
  }
}

const origin = new JsonRpcProvider(
  ORIGIN_RPC_URL,
  Number(ORIGIN_CHAIN_ID),
  { staticNetwork: true },
);
const attestationProvider = new JsonRpcProvider(
  ATTESTATION_RPC_URL,
  Number(ATTESTATION_CHAIN_ID),
  { staticNetwork: true },
);
const destinationProvider = new JsonRpcProvider(
  DESTINATION_RPC_URL,
  Number(DESTINATION_CHAIN_ID),
  { staticNetwork: true },
);
const wallet = new Wallet(RELAYER_PRIVATE_KEY, destinationProvider);

const mailboxAbi = [
  "event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)",
  "function delivered(bytes32 messageId) view returns (bool)",
  "function process(bytes metadata,bytes message) payable",
];
const hookAbi = [
  "event InsertedIntoTree(bytes32 messageId,uint32 index)",
  {
    type: "function",
    name: "tree",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "branch", type: "bytes32[32]" },
          { name: "count", type: "uint256" },
        ],
      },
    ],
  },
];
const gatewayAbi = [
  ILN_OPERATION_EVENT,
  "function activationBlock() view returns (uint256)",
];

const originMailbox = new Contract(ORIGIN_MAILBOX, mailboxAbi, origin);
const originHook = new Contract(ORIGIN_MERKLE_TREE_HOOK, hookAbi, origin);
const originGateway = new Contract(ORIGIN_ILN_GATEWAY, gatewayAbi, origin);
const destinationMailbox = new Contract(
  DESTINATION_MAILBOX,
  mailboxAbi,
  wallet,
);

const destinationISM = new Contract(
  DESTINATION_ILN_ISM,
  ["function registry() view returns(address)"],
  destinationProvider,
);
let destinationValidatorRegistry;
async function currentDestinationSetID() {
  if (!destinationValidatorRegistry) {
    const addr = await destinationISM.registry();
    destinationValidatorRegistry = new Contract(addr, ["function setId() view returns(uint64)"], destinationProvider);
  }
  return BigInt(await destinationValidatorRegistry.setId());
}

const lower = (value) => String(value).toLowerCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const observedReady = new Set();
const requestedQuorumAt = new Map();
// The relayer is an optional client of the same public first-time/recovery
// quorum RPC used by independent users. Bounded retries are advisory only.
async function hintCurrentQuorum(id, operation) {
  const last = requestedQuorumAt.get(id) ?? 0;
  if (Date.now() - last < 30000) return;
  requestedQuorumAt.set(id, Date.now());
  try {
    await attestationProvider.send("xgr_requestILNQuorum", [
      ATTESTATION_ROUTE, id, Number(operation.sourceBlockNumber),
    ]);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "iln_quorum_request_unavailable",
      messageId: id,
      reason: String(error),
    }));
  }
}

function validateState(state) {
  if (!Number.isSafeInteger(state.nextBlock) || state.nextBlock < 1) {
    throw new Error("ILN relayer state nextBlock is invalid");
  }
  if (!Number.isSafeInteger(state.treeCount) || state.treeCount < 0) {
    throw new Error("ILN relayer state treeCount is invalid");
  }
  if (!Number.isSafeInteger(state.snapshotCount) || state.snapshotCount < 0) {
    throw new Error("ILN relayer state snapshotCount is invalid");
  }
  if (!state.nodes || typeof state.nodes !== "object") {
    throw new Error("ILN relayer state nodes is invalid");
  }
  state.indices ??= {};
  state.messages ??= {};
  state.operations ??= {};
  return state;
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_PATH);
}

async function readTreeSnapshot(blockTag) {
  const raw = await originHook.tree({ blockTag });
  const branch = Array.from(raw.branch ?? raw[0]);
  const count = Number(raw.count ?? raw[1]);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("origin MerkleTreeHook returned invalid tree count");
  }
  return { branch, count };
}

async function resolvedStartBlock() {
  if (CONFIGURED_START_BLOCK > 0) return CONFIGURED_START_BLOCK;
  const activation = Number(await originGateway.activationBlock());
  if (!Number.isSafeInteger(activation) || activation < 1) {
    throw new Error("ILNGateway activationBlock is invalid");
  }
  return activation;
}

async function bootstrapState() {
  const startBlock = await resolvedStartBlock();
  if (startBlock < 1) {
    throw new Error("ILN origin start block must be at least 1");
  }
  const snapshotBlock = startBlock - 1;
  const { branch, count } = await readTreeSnapshot(snapshotBlock);
  return validateState({
    version: 2,
    routeId: ROUTE_ID,
    originChainId: String(ORIGIN_CHAIN_ID),
    destinationDomain: DESTINATION_DOMAIN,
    originGateway: ORIGIN_ILN_GATEWAY,
    nextBlock: startBlock,
    snapshotBlock,
    snapshotCount: count,
    treeCount: count,
    nodes: snapshotNodes(branch, count),
    indices: {},
    messages: {},
    operations: {},
  });
}

async function loadState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    if (state.version !== 2 || state.routeId !== ROUTE_ID || state.originChainId !== String(ORIGIN_CHAIN_ID) || state.destinationDomain !== DESTINATION_DOMAIN || lower(state.originGateway) !== lower(ORIGIN_ILN_GATEWAY)) {
      throw new Error("ILN relayer state version or route identity mismatch; use a fresh v3.1.4 state path");
    }
    return validateState(state);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    const state = await bootstrapState();
    saveState(state);
    console.log(
      JSON.stringify({
        event: "iln_relayer_state_bootstrapped",
        route: ATTESTATION_ROUTE,
        snapshotBlock: state.snapshotBlock,
        snapshotCount: state.snapshotCount,
        nextBlock: state.nextBlock,
      }),
    );
    return state;
  }
}

async function compactState(state, force = false) {
  if (Object.keys(state.operations).length !== 0) return;
  if (
    !force &&
    state.treeCount - state.snapshotCount < COMPACT_AFTER_LEAVES
  ) {
    return;
  }

  const snapshotBlock = state.nextBlock - 1;
  const { branch, count } = await readTreeSnapshot(snapshotBlock);
  if (count !== state.treeCount) {
    throw new Error(
      `ILN compaction tree count mismatch: rpc ${count}, indexed ${state.treeCount}`,
    );
  }

  state.snapshotBlock = snapshotBlock;
  state.snapshotCount = count;
  state.nodes = snapshotNodes(branch, count);
  state.indices = {};
  state.messages = {};
  saveState(state);

  console.log(
    JSON.stringify({
      event: "iln_relayer_state_compacted",
      route: ATTESTATION_ROUTE,
      snapshotBlock,
      snapshotCount: count,
    }),
  );
}

async function assertNetworks() {
  const [originNetwork, attestationNetwork, destinationNetwork] =
    await Promise.all([
      origin.getNetwork(),
      attestationProvider.getNetwork(),
      destinationProvider.getNetwork(),
    ]);

  if (originNetwork.chainId !== ORIGIN_CHAIN_ID) {
    throw new Error("origin RPC chain id mismatch");
  }
  if (attestationNetwork.chainId !== ATTESTATION_CHAIN_ID) {
    throw new Error("attestation RPC chain id mismatch");
  }
  if (destinationNetwork.chainId !== DESTINATION_CHAIN_ID) {
    throw new Error("destination RPC chain id mismatch");
  }
}

async function scanOrigin(state) {
  const head = await origin.getBlockNumber();
  const confirmedHead = head - CONFIRMATIONS;
  if (confirmedHead < state.nextBlock) return;

  for (
    let from = state.nextBlock;
    from <= confirmedHead;
    from += LOG_CHUNK
  ) {
    const to = Math.min(from + LOG_CHUNK - 1, confirmedHead);
    const [operations, dispatches, inserts] = await Promise.all([
      originGateway.queryFilter(
        originGateway.filters.ILNOperation(),
        from,
        to,
      ),
      originMailbox.queryFilter(
        originMailbox.filters.Dispatch(),
        from,
        to,
      ),
      originHook.queryFilter(
        originHook.filters.InsertedIntoTree(),
        from,
        to,
      ),
    ]);

    for (const event of operations) {
      if (lower(event.args.routeId) !== ROUTE_ID) continue;
      const destinationDomain = Number(event.args.destinationDomain);
      if (destinationDomain !== DESTINATION_DOMAIN) continue;

      const id = lower(event.args.messageId);
      const fee = BigInt(event.args.validatorFeeWei);
      if (fee <= 0n) {
        throw new Error(`ILN operation ${id} has non-positive fee`);
      }
      state.operations[id] = {
        destinationDomain,
        routeId: ROUTE_ID,
        validatorFeeWei: fee.toString(),
        sourceBlockNumber: Number(event.blockNumber),
      };
    }

    for (const event of dispatches) {
      const destination = Number(event.args.destination);
      if (destination !== DESTINATION_DOMAIN) continue;

      const message = event.args.message;
      const id = lower(keccak256(message));
      if (state.operations[id] !== undefined) {
        state.messages[id] = message;
      }
    }

    for (const event of inserts) {
      const id = lower(event.args.messageId);
      const index = Number(event.args.index);
      addLeaf(state, index, id);
      if (state.operations[id] !== undefined) {
        state.indices[id] = index;
      }
    }

    state.nextBlock = to + 1;
    saveState(state);
  }
}

function aggregateSignature(attestation) {
  const signature =
    ATTESTATION_SIGNATURE_FORMAT === "compressed"
      ? attestation.aggregateSignatureCompressed
      : attestation.aggregateSignature;

  if (!signature) {
    throw new Error(
      `attestation is missing ${ATTESTATION_SIGNATURE_FORMAT} aggregate signature`,
    );
  }

  const expectedLength =
    ATTESTATION_SIGNATURE_FORMAT === "compressed" ? 96 : 256;
  const actualLength = getBytes(signature).length;
  if (actualLength !== expectedLength) {
    throw new Error(
      `unexpected aggregate signature length: got ${actualLength}, expected ${expectedLength}`,
    );
  }
  return signature;
}

function expectedPayload(id, attestation, operation) {
  return encodeCheckpointPayloadV2({
    sourceChainId: ORIGIN_CHAIN_ID,
    sourceDomain: ORIGIN_DOMAIN,
    destinationDomain: DESTINATION_DOMAIN,
    routeId: ROUTE_ID,
    setId: BigInt(attestation.setId),
    sourceBlockNumber: BigInt(operation.sourceBlockNumber),
    registry: ORIGIN_ILN_REGISTRY,
    gateway: ORIGIN_ILN_GATEWAY,
    sourceRouter: ORIGIN_WARP_ROUTER,
    mailbox: ORIGIN_MAILBOX,
    merkleTreeHook: ORIGIN_MERKLE_TREE_HOOK,
    destinationRouter: DESTINATION_WARP_ROUTER,
    validatorFeeWei: BigInt(operation.validatorFeeWei),
    authorizedMessageId: id,
    root: attestation.root,
    index: Number(attestation.index),
  });
}

async function getAttestation(id, operation) {
  let attestation;
  try {
    const setID = await currentDestinationSetID();
    attestation = await attestationProvider.send(
      "xgr_getILNQuorumAttestation",
      [ATTESTATION_ROUTE, id, Number(setID)],
    );
  } catch (err) {
    if (/attestation not found|quorum not found|not found/i.test(String(err))) {
      return null;
    }
    throw err;
  }

  if (attestation.version !== "XGR_ILN_CHECKPOINT_V2") {
    throw new Error("ILN attestation version mismatch");
  }
  if (lower(attestation.chain) !== lower(ATTESTATION_ROUTE)) {
    throw new Error("ILN attestation route mismatch");
  }
  if (lower(attestation.routeId) !== ROUTE_ID) {
    throw new Error("ILN attestation routeId mismatch");
  }
  if (BigInt(attestation.originChainId) !== ORIGIN_CHAIN_ID) {
    throw new Error("ILN attestation origin chain mismatch");
  }
  if (Number(attestation.originDomain) !== ORIGIN_DOMAIN) {
    throw new Error("ILN attestation origin domain mismatch");
  }
  if (Number(attestation.destinationDomain) !== DESTINATION_DOMAIN) {
    throw new Error("ILN attestation destination domain mismatch");
  }
  if (lower(attestation.registry) !== lower(ORIGIN_ILN_REGISTRY)) {
    throw new Error("ILN attestation registry mismatch");
  }
  if (lower(attestation.gateway) !== lower(ORIGIN_ILN_GATEWAY)) {
    throw new Error("ILN attestation gateway mismatch");
  }
  if (lower(attestation.sourceRouter) !== lower(ORIGIN_WARP_ROUTER)) {
    throw new Error("ILN attestation source router mismatch");
  }
  if (lower(attestation.mailbox) !== lower(ORIGIN_MAILBOX)) {
    throw new Error("ILN attestation mailbox mismatch");
  }
  if (
    lower(attestation.merkleTreeHook) !==
    lower(ORIGIN_MERKLE_TREE_HOOK)
  ) {
    throw new Error("ILN attestation hook mismatch");
  }
  if (
    lower(attestation.destinationRouter) !==
    lower(DESTINATION_WARP_ROUTER)
  ) {
    throw new Error("ILN attestation destination router mismatch");
  }
  if (lower(attestation.authorizedMessageId) !== lower(id)) {
    throw new Error("ILN attestation authorized message mismatch");
  }
  if (
    BigInt(attestation.validatorFeeWei) !==
    BigInt(operation.validatorFeeWei)
  ) {
    throw new Error("ILN attestation validator fee mismatch");
  }
  if (
    Number(attestation.sourceBlockNumber) !==
    Number(operation.sourceBlockNumber)
  ) {
    throw new Error("ILN attestation source block mismatch");
  }

  const payload = expectedPayload(id, attestation, operation);
  if (lower(payload) !== lower(attestation.payload)) {
    throw new Error("ILN attestation canonical payload mismatch");
  }

  aggregateSignature(attestation);
  return attestation;
}

function wrapDestinationMetadata(innerMetadata) {
  if (DESTINATION_AGGREGATION_MODULE_COUNT === 0) {
    return innerMetadata;
  }
  return wrapAggregationMetadata(
    innerMetadata,
    DESTINATION_AGGREGATION_MODULE_COUNT,
    DESTINATION_AGGREGATION_INNER_INDEX,
    DESTINATION_AGGREGATION_EMPTY_INDEXES,
  );
}

function buildMetadata(state, id, operation, attestation) {
  const messageIndex = state.indices[id];
  const checkpointIndex = Number(attestation.index);
  if (messageIndex === undefined || messageIndex > checkpointIndex) {
    return null;
  }
  if (checkpointIndex >= state.treeCount) return null;

  const proof = buildProofFromNodes(
    state.nodes,
    messageIndex,
    checkpointIndex,
    state.snapshotCount,
  );
  const root = branchRoot(id, proof, messageIndex);
  if (lower(root) !== lower(attestation.root)) {
    throw new Error(
      `ILN local merkle root mismatch: computed ${root}, attested ${attestation.root}`,
    );
  }

  const innerMetadata = encodeISMMetadataV314({
    messageIndex,
    merkleProof: proof,
    sourceChainId: ORIGIN_CHAIN_ID,
    sourceDomain: ORIGIN_DOMAIN,
    destinationDomain: DESTINATION_DOMAIN,
    routeId: ROUTE_ID,
    setId: BigInt(attestation.setId),
    sourceBlockNumber: BigInt(operation.sourceBlockNumber),
    registry: ORIGIN_ILN_REGISTRY,
    gateway: ORIGIN_ILN_GATEWAY,
    sourceRouter: ORIGIN_WARP_ROUTER,
    mailbox: ORIGIN_MAILBOX,
    merkleTreeHook: ORIGIN_MERKLE_TREE_HOOK,
    destinationRouter: DESTINATION_WARP_ROUTER,
    validatorFeeWei: BigInt(operation.validatorFeeWei),
    authorizedMessageId: id,
    root: attestation.root,
    checkpointIndex,
    signerBitmap: attestation.signerBitmap,
    aggregateSignature: aggregateSignature(attestation),
  });

  return wrapDestinationMetadata(innerMetadata);
}

function clearOperation(state, id) {
  delete state.operations[id];
  delete state.messages[id];
  delete state.indices[id];
  saveState(state);
}

async function relayAvailable(state) {
  for (const [id, operation] of Object.entries(state.operations)) {
    const message = state.messages[id];
    if (!message || state.indices[id] === undefined) continue;

    if (await destinationMailbox.delivered(id)) {
      clearOperation(state, id);
      continue;
    }

    await hintCurrentQuorum(id, operation);
    const attestation = await getAttestation(id, operation);
    if (!attestation) continue;

    const metadata = buildMetadata(
      state,
      id,
      operation,
      attestation,
    );
    if (!metadata) continue;

    if (!RELAYER_SUBMIT) {
      await destinationMailbox.process.staticCall(metadata, message);

      const observationKey =
        `${id}:${attestation.index}:${attestation.root}`;
      if (!observedReady.has(observationKey)) {
        observedReady.add(observationKey);
        console.log(
          JSON.stringify({
            event: "iln_relay_ready_observe_only",
            route: ATTESTATION_ROUTE,
            messageId: id,
            sourceBlockNumber: operation.sourceBlockNumber,
            checkpointIndex: Number(attestation.index),
            setId: String(attestation.setId),
            validatorFeeWei: operation.validatorFeeWei,
            signatureFormat: ATTESTATION_SIGNATURE_FORMAT,
            metadataBytes: getBytes(metadata).length,
            staticValidated: true,
          }),
        );
      }
      continue;
    }

    const tx = await destinationMailbox.process(metadata, message);
    console.log(
      JSON.stringify({
        event: "iln_relay_submitted",
        route: ATTESTATION_ROUTE,
        messageId: id,
        txHash: tx.hash,
      }),
    );

    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(`ILN destination process failed for ${id}`);
    }

    clearOperation(state, id);
  }

  if (Object.keys(state.operations).length === 0) {
    await compactState(state, true);
  }
}

async function main() {
  await assertNetworks();
  const state = await loadState();

  console.log(
    JSON.stringify({
      event: "native_iln_relayer_started",
      route: ATTESTATION_ROUTE,
      originChainId: String(ORIGIN_CHAIN_ID),
      originDomain: ORIGIN_DOMAIN,
      originGateway: ORIGIN_ILN_GATEWAY,
      routeId: ROUTE_ID,
      originRegistry: ORIGIN_ILN_REGISTRY,
      destinationChainId: String(DESTINATION_CHAIN_ID),
      destinationDomain: DESTINATION_DOMAIN,
      destinationRouter: DESTINATION_WARP_ROUTER,
      signatureFormat: ATTESTATION_SIGNATURE_FORMAT,
      submitEnabled: RELAYER_SUBMIT,
      relayer: wallet.address,
      nextBlock: state.nextBlock,
      snapshotCount: state.snapshotCount,
      treeCount: state.treeCount,
    }),
  );

  for (;;) {
    try {
      await scanOrigin(state);
      await relayAvailable(state);
      await compactState(state);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "native_iln_relayer_error",
          route: ATTESTATION_ROUTE,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
