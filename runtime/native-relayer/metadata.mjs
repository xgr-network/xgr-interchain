import { concat, getBytes, hexlify, toBeHex } from "ethers";

const assertIndex = (name, value, moduleCount) => {
  if (!Number.isSafeInteger(value) || value < 0 || value >= moduleCount) {
    throw new Error(`${name} must be an integer in [0, ${moduleCount - 1}]`);
  }
};

export function wrapAggregationMetadata(
  innerMetadata,
  moduleCount,
  innerIndex,
  emptyMetadataIndexes = [],
) {
  if (!Number.isSafeInteger(moduleCount) || moduleCount < 1) {
    throw new Error("moduleCount must be a positive safe integer");
  }
  assertIndex("innerIndex", innerIndex, moduleCount);

  const emptyIndexes = new Set();
  for (const index of emptyMetadataIndexes) {
    assertIndex("emptyMetadataIndex", index, moduleCount);
    if (index === innerIndex) {
      throw new Error("innerIndex cannot also be an empty metadata index");
    }
    emptyIndexes.add(index);
  }

  const inner = getBytes(innerMetadata);
  const headerBytes = moduleCount * 8;
  let cursor = headerBytes;
  const ranges = [];
  const payloads = [];

  for (let i = 0; i < moduleCount; i++) {
    if (i === innerIndex) {
      const start = cursor;
      const end = start + inner.length;
      ranges.push(toBeHex(start, 4), toBeHex(end, 4));
      payloads.push(inner);
      cursor = end;
    } else if (emptyIndexes.has(i)) {
      // start > 0 marks this module as present; start == end supplies empty bytes.
      ranges.push(toBeHex(cursor, 4), toBeHex(cursor, 4));
    } else {
      ranges.push("0x00000000", "0x00000000");
    }
  }

  return hexlify(concat([...ranges, ...payloads]));
}
