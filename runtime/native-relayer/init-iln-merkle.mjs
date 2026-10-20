#!/usr/bin/env node
// XGR-Node v3.2.0 canonical Merkle-tree bootstrap. READ-ONLY on both chains;
// the only side effect is an atomic verified snapshot under --data-dir.
// No private keys, transfers, blockchain transactions, or trust in peers.
import {
  readFileSync, existsSync, mkdirSync, openSync, writeSync, fsyncSync,
  closeSync, renameSync, copyFileSync, statSync, realpathSync, constants,
} from "node:fs";
import { resolve, isAbsolute, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JsonRpcProvider, Interface, concat, getAddress, id, keccak256, toBeHex,
} from "ethers";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ZERO = "0x" + "00".repeat(32);
const HASH = /^0x[0-9a-f]{64}$/i;
const MAX_LEAVES = 1 << 20; // matches Go VerifyILNReplica v3.2.0
const MAX_FILE_BYTES = 40 << 20;
const DEPTH = 32;
const INSERT_TOPIC = id("InsertedIntoTree(bytes32,uint32)").toLowerCase();
const HOOK_IFACE = new Interface([
  "function mailbox() view returns (address)",
  "function root() view returns (bytes32)",
  "function count() view returns (uint256)",
]);

function requireCondition(ok, message) {
  if (!ok) throw new Error(message);
}
function word(data) {
  requireCondition(typeof data === "string" && /^0x[0-9a-f]*$/i.test(data),
    "malformed hex log data");
  return data.slice(2).toLowerCase();
}
function parent(a, b) {
  return keccak256(concat([a, b]));
}
export function parseInsertedIntoTree(log, hook) {
  requireCondition(log && !log.removed &&
    typeof log.address === "string" &&
    log.address.toLowerCase() === hook.toLowerCase() &&
    Array.isArray(log.topics) && log.topics.length >= 1 &&
    log.topics[0].toLowerCase() === INSERT_TOPIC,
  "not a canonical Hyperlane Hook insertion log");
  const topics = log.topics;
  const data = word(log.data);
  let leaf, indexHex;
  if (topics.length === 1) {
    requireCondition(data.length === 128, "invalid unindexed insertion data");
    leaf = "0x" + data.slice(0, 64);
    indexHex = data.slice(64);
  } else if (topics.length === 2) {
    requireCondition(data.length === 64, "invalid semi-indexed insertion data");
    leaf = topics[1];
    indexHex = data;
  } else if (topics.length === 3) {
    requireCondition(data.length === 0, "invalid indexed insertion data");
    leaf = topics[1];
    indexHex = word(topics[2]);
  } else {
    throw new Error("unexpected Hook insertion topic count");
  }
  requireCondition(HASH.test(leaf) && leaf.toLowerCase() !== ZERO &&
    /^[0-9a-f]{64}$/.test(indexHex), "malformed Hook leaf or index");
  const index = BigInt("0x" + indexHex);
  requireCondition(index < 2n ** 32n, "Hook insertion index overflow");
  return {leaf: leaf.toLowerCase(), index: Number(index)};
}

// Same ordered 32-level append-only accumulator as
// xgr-node/interchain/evm/iln_merkle.go. No caller-supplied root is trusted.
export class ILNAccumulator {
  constructor() {
    this.count = 0;
    this.branch = Array(DEPTH).fill(ZERO);
  }
  insert(index, leaf) {
    requireCondition(index === this.count && this.count < MAX_LEAVES &&
      HASH.test(leaf) && leaf.toLowerCase() !== ZERO,
    "missing, duplicate or noncanonical Merkle insertion at index " + index +
      " (expected " + this.count + ")");
    let node = leaf.toLowerCase();
    let n = this.count;
    for (let depth = 0; depth < DEPTH; depth++) {
      if (n % 2 === 0) {
        this.branch[depth] = node;
        this.count++;
        return;
      }
      node = parent(this.branch[depth], node);
      n = Math.floor(n / 2);
    }
    throw new Error("Merkle accumulator overflow");
  }
  root() {
    let root = ZERO, zero = ZERO;
    for (let depth = 0; depth < DEPTH; depth++) {
      root = (Math.floor(this.count / (2 ** depth)) % 2 === 1)
        ? parent(this.branch[depth], root)
        : parent(root, zero);
      zero = parent(zero, zero);
    }
    return root;
  }
}

export function loadChainEvidence(chain, repoRoot = REPO) {
  requireCondition(["base", "xgrchain"].includes(chain),
    "unsupported chain; expected base or xgrchain");
  const config = JSON.parse(readFileSync(
    join(repoRoot, "config", "chains", chain, "chain.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(
    join(repoRoot, "deployments", "chains", chain + ".json"), "utf8"));
  const expectedId = chain === "base" ? 8453 : 1643;
  requireCondition(config.chainId === expectedId &&
    config.domainId === expectedId &&
    manifest.chainId === expectedId && manifest.domainId === expectedId &&
    config.environment === "mainnet" && manifest.network === "mainnet",
  "manifest/source chain identity mismatch");
  const components = manifest.xitaV315?.components;
  const hook = components?.merkleTreeHook?.address;
  const mailbox = components?.mailbox?.address;
  requireCondition(hook && mailbox && Array.isArray(config.rpcUrls) &&
    config.rpcUrls.length > 0 &&
    Number.isSafeInteger(config.confirmations) &&
    config.confirmations >= 1,
  "incomplete verified transport bundle configuration");
  const receiptRelative = components.merkleTreeHook.receiptPath;
  requireCondition(typeof receiptRelative === "string" &&
    /^deployments\/receipts\/(base|xgrchain)\/[0-9a-f-]+\.json$/i.test(receiptRelative) &&
    receiptRelative.startsWith("deployments/receipts/" + chain + "/"),
  "unsafe Hook receipt path");
  const receipt = JSON.parse(readFileSync(join(repoRoot, receiptRelative), "utf8"));
  requireCondition(receipt.kind === "xita-v315-deployment-receipt" &&
    receipt.status === "onchain-deployment-verified" &&
    receipt.component === "merkleTreeHook" &&
    receipt.chainId === expectedId && receipt.chain === chain &&
    receipt.address.toLowerCase() === hook.toLowerCase() &&
    receipt.runtimeCodeKeccak256.toLowerCase() ===
      components.merkleTreeHook.runtimeCodeKeccak256.toLowerCase() &&
    HASH.test(receipt.transactionHash) &&
    Number.isSafeInteger(receipt.blockNumber) && receipt.blockNumber > 0,
  "invalid recorded Hook deployment provenance");
  return {
    chain, chainId: expectedId, hook: getAddress(hook),
    mailbox: getAddress(mailbox), fromBlock: receipt.blockNumber,
    confirmations: config.confirmations, rpc: config.rpcUrls[0],
    runtimeCodeHash: receipt.runtimeCodeKeccak256.toLowerCase(),
    txHash: receipt.transactionHash.toLowerCase(),
  };
}
async function hookCall(provider, hook, fn, epoch) {
  const data = HOOK_IFACE.encodeFunctionData(fn);
  const result = await provider.call({to: hook, data, blockTag: epoch});
  return HOOK_IFACE.decodeFunctionResult(fn, result)[0];
}
export async function buildVerifiedReplica({
  provider, evidence, chunkSize = 1000, expectMessageId = "", onProgress = () => {},
}) {
  requireCondition(Number.isSafeInteger(chunkSize) &&
    chunkSize >= 1 && chunkSize <= 5000, "invalid chunk size");
  requireCondition(!expectMessageId || HASH.test(expectMessageId),
    "expected message ID must be a 32-byte hash");
  const chainID = Number(BigInt(await provider.send("eth_chainId", [])));
  requireCondition(chainID === evidence.chainId,
    "RPC chainId mismatch; refusing to seed a foreign validator");
  const latest = Number(await provider.getBlockNumber());
  const confirmed = latest - evidence.confirmations;
  const checkpointBlock = Math.floor(confirmed / 32) * 32;
  requireCondition(Number.isSafeInteger(checkpointBlock) &&
    checkpointBlock >= evidence.fromBlock && checkpointBlock > 0,
  "source Hook not yet deployed at confirmed checkpoint");
  const epochBlock = await provider.getBlock(checkpointBlock);
  requireCondition(epochBlock && HASH.test(epochBlock.hash),
    "cannot independently anchor confirmed checkpoint block");
  const [onchainMailbox, onchainCount, onchainRoot] = await Promise.all([
    hookCall(provider, evidence.hook, "mailbox", checkpointBlock),
    hookCall(provider, evidence.hook, "count", checkpointBlock),
    hookCall(provider, evidence.hook, "root", checkpointBlock),
  ]);
  requireCondition(onchainMailbox.toLowerCase() === evidence.mailbox.toLowerCase(),
    "confirmed Hook mailbox differs from deployed XITA bundle");
  const targetCount = Number(onchainCount);
  requireCondition(Number.isSafeInteger(targetCount) &&
    targetCount > 0 && targetCount <= MAX_LEAVES &&
    HASH.test(onchainRoot) && onchainRoot.toLowerCase() !== ZERO,
  "empty or unsupported canonical Merkle checkpoint");
  // Before processing potentially lengthy RPC scans, verify the current
  // runtime bytecode against immutable GitHub deployment receipt.
  const runtime = await provider.getCode(evidence.hook, checkpointBlock);
  requireCondition(runtime !== "0x" &&
    keccak256(runtime).toLowerCase() === evidence.runtimeCodeHash,
  "source Hook runtime code differs from documented deployed contract");
  const tree = new ILNAccumulator();
  const leaves = [];
  let lastBlock = 0, lastIndex = -1, matched = false, batches = 0;
  for (let start = evidence.fromBlock; start <= checkpointBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, checkpointBlock);
    const logs = await provider.getLogs({
      address: evidence.hook, topics: [INSERT_TOPIC],
      fromBlock: start, toBlock: end,
    });
    requireCondition(Array.isArray(logs) && logs.length <= MAX_LEAVES,
      "invalid or unbounded Hook insertion RPC response");
    logs.sort((a, b) =>
      a.blockNumber - b.blockNumber || a.index - b.index);
    for (const entry of logs) {
      requireCondition(Number.isSafeInteger(entry.blockNumber) &&
        entry.blockNumber >= start && entry.blockNumber <= end &&
        Number.isSafeInteger(entry.index) &&
        (entry.blockNumber > lastBlock ||
          (entry.blockNumber === lastBlock && entry.index > lastIndex)),
      "out-of-order or duplicated source Hook event");
      const {leaf, index} = parseInsertedIntoTree(entry, evidence.hook);
      tree.insert(index, leaf);
      leaves.push(leaf);
      if (expectMessageId && leaf === expectMessageId.toLowerCase()) matched = true;
      lastBlock = entry.blockNumber;
      lastIndex = entry.index;
    }
    batches++;
    if (batches % 20 === 0 || end === checkpointBlock)
      onProgress({chain: evidence.chain, end, total: checkpointBlock,
        leaves: leaves.length, targetCount});
    requireCondition(tree.count <= targetCount,
      "RPC returned more leaves than canonical Hook count");
  }
  requireCondition(tree.count === targetCount,
    "incomplete Hook history: got " + tree.count +
      " leaves; confirmed Hook reports " + targetCount);
  const computedRoot = tree.root();
  requireCondition(computedRoot.toLowerCase() === onchainRoot.toLowerCase(),
    "reconstructed Merkle root does not match source Hook root");
  requireCondition(!expectMessageId || matched,
    "requested pending transfer message ID absent from verified Hook history");
  const finalBlock = await provider.getBlock(checkpointBlock);
  requireCondition(finalBlock?.hash?.toLowerCase() ===
    epochBlock.hash.toLowerCase(), "source checkpoint reorganized during bootstrap");
  return {
    chainId: evidence.chainId,
    hook: evidence.hook.toLowerCase(),
    checkpointBlock,
    root: computedRoot.toLowerCase(),
    leaves,
  };
}

export function parseBootstrapArgs(args) {
  const options = {chain: "", dataDir: "", rpc: "", chunkSize: 1000,
    expectMessageId: "", replace: false, dryRun: false};
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (["--chain", "--data-dir", "--rpc", "--chunk-size", "--expect-message-id"]
      .includes(option)) {
      const value = args[++i];
      requireCondition(typeof value === "string" && value !== "" &&
        !value.startsWith("--"), "missing value for " + option);
      const key = ({
        "--chain": "chain", "--data-dir": "dataDir", "--rpc": "rpc",
        "--chunk-size": "chunkSize", "--expect-message-id": "expectMessageId",
      })[option];
      options[key] = key === "chunkSize" ? Number(value) : value;
    } else if (option === "--replace") options.replace = true;
    else if (option === "--dry-run") options.dryRun = true;
    else throw new Error("unknown initializer option: " + option);
  }
  requireCondition(["base", "xgrchain"].includes(options.chain),
    "--chain must be base or xgrchain");
  requireCondition(isAbsolute(options.dataDir) &&
    options.dataDir !== sep && options.dataDir.trim() !== "",
    "--data-dir must be the absolute, existing XGR-Node data directory");
  requireCondition(existsSync(options.dataDir) &&
    statSync(options.dataDir).isDirectory(),
    "specified XGR-Node data directory does not exist");
  options.dataDir = realpathSync(options.dataDir);
  requireCondition(/^https?:\/\/[^@\s]+$/i.test(options.rpc || "https://localhost"),
    "--rpc must be an HTTP(S) JSON-RPC endpoint without credentials");
  requireCondition(Number.isSafeInteger(options.chunkSize) &&
    options.chunkSize >= 1 && options.chunkSize <= 5000,
    "--chunk-size must be an integer between 1 and 5000");
  if (options.expectMessageId)
    requireCondition(HASH.test(options.expectMessageId),
      "invalid expected message ID");
  return options;
}
function writeReplicaAtomic(path, replica, {replace = false, dryRun = false} = {}) {
  const data = JSON.stringify(replica) + "\n";
  requireCondition(Buffer.byteLength(data) <= MAX_FILE_BYTES,
    "Go v3.2.0 validator refuses snapshots larger than 40 MiB");
  if (existsSync(path)) {
    const current = JSON.parse(readFileSync(path, "utf8"));
    if (JSON.stringify(current) === JSON.stringify(replica)) return "already-current";
    requireCondition(replace, "existing replica differs; use --replace after stopping the validator");
  }
  if (dryRun) return "verified-dry-run";
  mkdirSync(dirname(path), {recursive: true, mode: 0o770});
  if (existsSync(path)) {
    const suffix = Date.now() + "-" + process.pid;
    copyFileSync(path, path + ".backup-" + suffix, constants.COPYFILE_EXCL);
  }
  const temporary = path + ".init-" + process.pid + "-" + Date.now();
  let fd;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL |
      constants.O_WRONLY, 0o660);
    writeSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporary)) {
      const {unlinkSync} = requireUnlink();
      unlinkSync(temporary);
    }
  }
  return "initialized";
}
function requireUnlink() {
  // Keep the top-level write pathway self-contained and no private input.
  return {unlinkSync: (path) => rmTemporary(path)};
}
function rmTemporary(path) {
  // Only a known tool-generated temporary file can be removed.
  importTemporaryDelete(path);
}
function importTemporaryDelete(path) {
  // See imported unlinkSync in the production script.
  unlinkSync(path);
}
export {writeReplicaAtomic};

// Replaced below by Node's directly imported unlinkSync.
async function main() {
  const args = parseBootstrapArgs(process.argv.slice(2));
  const evidence = loadChainEvidence(args.chain);
  const url = args.rpc || evidence.rpc;
  const provider = new JsonRpcProvider(url);
  console.error("XGR v3.2.0 Merkle bootstrap: " + evidence.chain +
    " (chainId " + evidence.chainId + "), hook " + evidence.hook);
  console.error("Source Hook deployment block: " + evidence.fromBlock);
  const replica = await buildVerifiedReplica({
    provider, evidence, chunkSize: args.chunkSize,
    expectMessageId: args.expectMessageId,
    onProgress: x => console.error(
      "Scanned to block " + x.end + "/" + x.total +
      "; validated " + x.leaves + "/" + x.targetCount + " leaves"),
  });
  const path = join(args.dataDir, "interchain", "iln", "replicas",
    String(evidence.chainId), evidence.hook.toLowerCase() + ".json");
  const outcome = writeReplicaAtomic(path, replica,
    {replace: args.replace, dryRun: args.dryRun});
  console.log(JSON.stringify({
    status: outcome, chain: evidence.chain,
    checkpointBlock: replica.checkpointBlock,
    merkleTreeHook: evidence.hook,
    count: replica.leaves.length, root: replica.root,
    file: path,
    note: "Source Hook root verified. No BLS/quorum or contract state was modified.",
  }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error("ILN_MERKLE_BOOTSTRAP_FAILED: " + String(error?.message || error));
    process.exitCode = 1;
  });
}
