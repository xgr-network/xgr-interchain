import { concat, keccak256 } from "ethers";

export const TREE_DEPTH = 32;

export function zeroHashes() {
  const values = [];
  let current = "0x" + "00".repeat(32);
  for (let i = 0; i < TREE_DEPTH; i++) {
    values.push(current);
    current = keccak256(concat([current, current]));
  }
  return values;
}

export const ZERO_HASHES = zeroHashes();

const key = (level, index) => `${level}:${index}`;

export function snapshotNodes(branch, count) {
  if (!Array.isArray(branch) || branch.length !== TREE_DEPTH) {
    throw new Error("snapshot branch must contain 32 nodes");
  }
  if (!Number.isSafeInteger(count) || count < 0 || count > 2 ** TREE_DEPTH) {
    throw new Error("snapshot count is invalid");
  }

  const nodes = {};
  let offset = 0;

  // The incremental tree branch is a left-to-right forest corresponding to
  // the set bits of count. High-order subtrees come first.
  for (let level = TREE_DEPTH - 1; level >= 0; level--) {
    const size = 2 ** level;
    if (Math.floor(count / size) % 2 !== 1) continue;
    const nodeIndex = offset / size;
    nodes[key(level, nodeIndex)] = branch[level];
    offset += size;
  }

  if (offset !== count) {
    throw new Error(`snapshot forest mismatch: reconstructed ${offset}, count ${count}`);
  }
  return nodes;
}

export function addLeaf(state, index, leaf) {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error("leaf index is invalid");
  }
  if (index !== state.treeCount) {
    throw new Error(
      `merkle history gap: got index ${index}, expected ${state.treeCount}`,
    );
  }

  state.nodes[key(0, index)] = leaf;

  let current = leaf;
  let nodeIndex = index;
  for (let level = 0; level < TREE_DEPTH; level++) {
    if (nodeIndex % 2 === 0) break;

    const leftKey = key(level, nodeIndex - 1);
    const left = state.nodes[leftKey];
    if (!left) {
      throw new Error(
        `missing merkle left sibling at level ${level}, index ${nodeIndex - 1}`,
      );
    }

    current = keccak256(concat([left, current]));
    nodeIndex = Math.floor(nodeIndex / 2);
    state.nodes[key(level + 1, nodeIndex)] = current;
  }

  state.treeCount += 1;
}

function subtreeRoot(nodes, level, nodeIndex, count) {
  const size = 2 ** level;
  const start = nodeIndex * size;
  if (start >= count) return ZERO_HASHES[level];

  const exact = nodes[key(level, nodeIndex)];
  if (start + size <= count && exact) return exact;

  if (level === 0) {
    if (exact) return exact;
    throw new Error(`missing merkle leaf at index ${nodeIndex}`);
  }

  const left = subtreeRoot(nodes, level - 1, nodeIndex * 2, count);
  const right = subtreeRoot(nodes, level - 1, nodeIndex * 2 + 1, count);
  return keccak256(concat([left, right]));
}

export function buildProofFromNodes(
  nodes,
  targetIndex,
  checkpointIndex,
  minimumIndex = 0,
) {
  if (
    !Number.isSafeInteger(targetIndex) ||
    !Number.isSafeInteger(checkpointIndex) ||
    targetIndex < minimumIndex ||
    checkpointIndex < targetIndex
  ) {
    throw new Error("invalid proof bounds");
  }

  const count = checkpointIndex + 1;
  const proof = [];

  for (let level = 0; level < TREE_DEPTH; level++) {
    const size = 2 ** level;
    const nodeIndex = Math.floor(targetIndex / size);
    const siblingIndex =
      nodeIndex % 2 === 0 ? nodeIndex + 1 : nodeIndex - 1;
    proof.push(subtreeRoot(nodes, level, siblingIndex, count));
  }
  return proof;
}

export function branchRoot(leaf, proof, index) {
  let current = leaf;
  let nodeIndex = index;
  for (let i = 0; i < TREE_DEPTH; i++) {
    current =
      nodeIndex % 2 === 1
        ? keccak256(concat([proof[i], current]))
        : keccak256(concat([current, proof[i]]));
    nodeIndex = Math.floor(nodeIndex / 2);
  }
  return current;
}
