#!/usr/bin/env node
// XGR-Node v3.2.0 is a node-side compatibility release. Preserve the live
// Solidity generation and already paid-for XITA deployments until a reviewed
// contract/ABI diff actually requires replacement.
import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ADDR = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const RECEIPT = /^deployments\/receipts\/(base|xgrchain)\/([0-9a-f]{64})-([0-9a-f]{40})\.json$/i;

export function verifyRetainedContracts(root = ROOT, {checkGit = true} = {}) {
  const errors = [];
  const fail = text => errors.push(text);
  const json = path => JSON.parse(readFileSync(join(root, path), "utf8"));
  const expected = {base: 8453, xgrchain: 1643};
  let checked = 0;

  if (checkGit) {
    const base = process.env.GITHUB_BASE_REF || "main";
    if (!/^[\w./-]+$/.test(base) || base.startsWith("-") || base.includes("..")) {
      fail("invalid Git comparison base");
    } else {
      try {
        const changes = execFileSync("git", [
          "-C", root, "diff", "--name-only", "origin/" + base + "...HEAD", "--", "contracts"
        ], {encoding: "utf8"}).trim().split("\n").filter(Boolean);
        const changedSolidity = changes.filter(path => path.endsWith(".sol"));
        if (changedSolidity.length) {
          fail("deployed Solidity changed; perform explicit ABI/bytecode compatibility review: " +
            changedSolidity.join(", "));
        }
      } catch (error) {
        fail("cannot compare committed Solidity against base: " + error.message);
      }
    }
  }

  for (const [chain, id] of Object.entries(expected)) {
    const manifestPath = `deployments/chains/${chain}.json`;
    if (!existsSync(join(root, manifestPath))) {
      fail("missing active on-chain manifest: " + manifestPath);
      continue;
    }
    let manifest;
    try { manifest = json(manifestPath); }
    catch (error) { fail("invalid JSON: " + manifestPath + ": " + error.message); continue; }
    if (manifest.kind !== "infrastructure-deployment" ||
        manifest.chain !== chain || manifest.chainId !== id ||
        manifest.domainId !== id ||
        manifest.network !== "mainnet") {
      fail("invalid infrastructure identity: " + manifestPath);
      continue;
    }
    const generation = manifest.xitaV315;
    if (!generation || !generation.components ||
        typeof generation.components !== "object" ||
        !Array.isArray(generation.receiptPaths)) {
      fail("live deployment generation must be retained: " + manifestPath);
      continue;
    }
    const receipts = new Set(generation.receiptPaths);
    for (const [component, binding] of Object.entries(generation.components)) {
      checked++;
      if (!binding || !ADDR.test(binding.address) ||
          !HASH.test(binding.runtimeCodeKeccak256) ||
          !receipts.has(binding.receiptPath)) {
        fail(`missing/invalid deployment binding: ${chain}/${component}`);
        continue;
      }
      const match = RECEIPT.exec(binding.receiptPath);
      if (!match || match[1] !== chain ||
          match[3].toLowerCase() !== binding.address.slice(2).toLowerCase()) {
        fail(`unsafe/mismatched receipt path: ${chain}/${component}`);
        continue;
      }
      if (!existsSync(join(root, binding.receiptPath))) {
        fail("missing retained receipt: " + binding.receiptPath);
        continue;
      }
      try {
        const receipt = json(binding.receiptPath);
        if (receipt.kind !== "xita-v315-deployment-receipt" ||
            receipt.chain !== chain || receipt.chainId !== id ||
            receipt.component !== component ||
            receipt.address.toLowerCase() !== binding.address.toLowerCase() ||
            receipt.runtimeCodeKeccak256.toLowerCase() !== binding.runtimeCodeKeccak256.toLowerCase() ||
            !HASH.test(receipt.transactionHash) ||
            receipt.transactionHash.slice(2).toLowerCase() !== match[2].toLowerCase() ||
            !Number.isSafeInteger(receipt.blockNumber) || receipt.blockNumber <= 0 ||
            receipt.status !== "onchain-deployment-verified") {
          fail(`retained receipt evidence mismatch: ${chain}/${component}`);
        }
      } catch (error) {
        fail(`invalid retained receipt: ${chain}/${component}: ${error.message}`);
      }
    }
    for (const path of receipts) {
      if (typeof path !== "string" || !RECEIPT.test(path) ||
          !path.startsWith(`deployments/receipts/${chain}/`) ||
          !existsSync(join(root, path))) {
        fail("missing/invalid chain receipt index entry: " + String(path));
      }
    }
  }
  if (checked === 0) fail("no retained deployment components");
  return {ok: errors.length === 0, errors, checked};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyRetainedContracts();
  if (!result.ok) {
    for (const error of result.errors) console.error("BLOCKED: " + error);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${result.checked} existing XITA contract receipts retained; no Solidity diff. Runtime hashes require live RPC re-verification before deployment.`);
  }
}
