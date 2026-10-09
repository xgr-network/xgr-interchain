import test from "node:test";
import assert from "node:assert/strict";
import { keccak256, toUtf8Bytes } from "ethers";
import {
  ZERO_HASHES,
  addLeaf,
  branchRoot,
  buildProofFromNodes,
  snapshotNodes,
} from "./merkle.mjs";

const hashPair = (left, right) =>
  keccak256(new Uint8Array([
    ...Buffer.from(left.slice(2), "hex"),
    ...Buffer.from(right.slice(2), "hex"),
  ]));

function branchForLeaves(leaves) {
  const branch = [...ZERO_HASHES];
  let count = 0;
  for (const leaf of leaves) {
    let node = leaf;
    count += 1;
    let size = count;
    for (let level = 0; level < 32; level++) {
      if ((size & 1) === 1) {
        branch[level] = node;
        break;
      }
      node = hashPair(branch[level], node);
      size = Math.floor(size / 2);
    }
  }
  return { branch, count };
}

function naiveProof(leaves, target, checkpoint) {
  let nodes = leaves.slice(0, checkpoint + 1);
  let index = target;
  const proof = [];
  for (let level = 0; level < 32; level++) {
    const sibling = index ^ 1;
    proof.push(sibling < nodes.length ? nodes[sibling] : ZERO_HASHES[level]);
    const parents = [];
    for (let i = 0; i < nodes.length; i += 2) {
      parents.push(
        hashPair(nodes[i] ?? ZERO_HASHES[level], nodes[i + 1] ?? ZERO_HASHES[level]),
      );
    }
    nodes = parents;
    index = Math.floor(index / 2);
  }
  return proof;
}

test("snapshot forest plus new leaves reproduces proofs", () => {
  const leaves = Array.from({ length: 48 }, (_, i) =>
    keccak256(toUtf8Bytes(`leaf-${i}`)),
  );

  for (const snapshotCount of [1, 5, 13, 16, 31]) {
    const snapshot = branchForLeaves(leaves.slice(0, snapshotCount));
    const state = {
      snapshotCount,
      treeCount: snapshotCount,
      nodes: snapshotNodes(snapshot.branch, snapshotCount),
    };

    for (let i = snapshotCount; i < leaves.length; i++) {
      addLeaf(state, i, leaves[i]);
    }

    for (let target = snapshotCount; target < leaves.length; target++) {
      for (const checkpoint of [target, Math.min(target + 1, leaves.length - 1), leaves.length - 1]) {
        const proof = buildProofFromNodes(
          state.nodes,
          target,
          checkpoint,
          snapshotCount,
        );
        const expectedProof = naiveProof(leaves, target, checkpoint);
        assert.equal(
          branchRoot(leaves[target], proof, target),
          branchRoot(leaves[target], expectedProof, target),
          `snapshot=${snapshotCount} target=${target} checkpoint=${checkpoint}`,
        );
      }
    }
  }
});

test("proof rejects targets older than snapshot", () => {
  const leaves = Array.from({ length: 8 }, (_, i) =>
    keccak256(toUtf8Bytes(`old-${i}`)),
  );
  const snapshot = branchForLeaves(leaves.slice(0, 5));
  const nodes = snapshotNodes(snapshot.branch, 5);
  assert.throws(
    () => buildProofFromNodes(nodes, 4, 4, 5),
    /invalid proof bounds/,
  );
});
