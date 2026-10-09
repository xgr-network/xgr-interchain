import assert from "node:assert/strict";
import test from "node:test";
import { wrapAggregationMetadata } from "./metadata.mjs";

test("wraps 2-of-2 aggregation metadata with empty module 0 and inner module 1", () => {
  const encoded = wrapAggregationMetadata("0x123456", 2, 1, [0]);
  assert.equal(
    encoded,
    "0x00000010000000100000001000000013123456",
  );
});

test("supports absent, empty, and inner metadata entries", () => {
  const encoded = wrapAggregationMetadata("0xaabb", 3, 2, [1]);
  assert.equal(
    encoded,
    "0x00000000000000000000001800000018000000180000001aaabb",
  );
});

test("rejects conflicting aggregation metadata indexes", () => {
  assert.throws(
    () => wrapAggregationMetadata("0x12", 2, 1, [1]),
    /innerIndex cannot also be an empty metadata index/,
  );
});
