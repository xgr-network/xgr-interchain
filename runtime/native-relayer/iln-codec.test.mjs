import test from "node:test";
import assert from "node:assert/strict";
import { AbiCoder, Interface, getBytes, keccak256 } from "ethers";
import { ILN_OPERATION_EVENT, CHECKPOINT_DOMAIN_V2, ISM_V314_METADATA_TYPES, requireRouteId, encodeCheckpointPayloadV2, encodeISMMetadataV314 } from "./iln-codec.mjs";

const routeId = "0x" + "aa".repeat(32);
const msgId = "0x" + "bb".repeat(32);
const root = "0x" + "cc".repeat(32);
const addr = (n) => "0x" + n.toString(16).padStart(40, "0");
const checkpoint = {
  sourceChainId: 8453n,
  sourceDomain: 8453,
  destinationDomain: 1643,
  routeId,
  setId: 7n,
  sourceBlockNumber: 123456n,
  registry: addr(1),
  gateway: addr(2),
  sourceRouter: addr(3),
  mailbox: addr(4),
  merkleTreeHook: addr(5),
  destinationRouter: addr(6),
  validatorFeeWei: 1000n,
  authorizedMessageId: msgId,
  root,
  index: 17,
};

test("route ID is mandatory, canonical and nonzero", () => {
  assert.equal(requireRouteId(routeId.toUpperCase().replace("0X", "0x")), routeId);
  assert.throws(() => requireRouteId("0x" + "00".repeat(32)), /nonzero/);
  assert.throws(() => requireRouteId("abc"), /nonzero/);
});

test("V2 checkpoint packs route ID and differs from legacy V1", () => {
  const encoded = encodeCheckpointPayloadV2(checkpoint);
  assert.equal(getBytes(encoded).length, 21 + 8 + 4 + 4 + 32 + 8 + 8 + 20*6 + 32 + 32 + 32 + 4);
  assert.equal(getBytes(encoded).slice(0, 21).length, 21);
  assert.equal(new TextDecoder().decode(getBytes(encoded).slice(0, 21)), CHECKPOINT_DOMAIN_V2);
  assert.ok(encoded.toLowerCase().includes(routeId.slice(2)));
  assert.notEqual(keccak256(encoded), keccak256(encodeCheckpointPayloadV2({...checkpoint, routeId: "0x" + "dd".repeat(32)})));
});

test("Gateway V2 event is indexed by routeId and messageId", () => {
  const iface = new Interface([ILN_OPERATION_EVENT]);
  const fragment = iface.getEvent("ILNOperation");
  assert.equal(fragment.inputs.length, 4);
  assert.deepEqual(fragment.inputs.map(v=>v.indexed), [true, true, true, null]);
  const log=iface.encodeEventLog(fragment,[routeId,msgId,1643,1000n]);
  const decoded=iface.parseLog(log);
  assert.equal(decoded.args.routeId.toLowerCase(),routeId);
  assert.equal(decoded.args.messageId.toLowerCase(),msgId);
});

test("ISM V314 metadata has exactly 20 fields and preserves route binding", () => {
  const proof=Array.from({length:32},()=>root);
  const raw=encodeISMMetadataV314({...checkpoint,messageIndex:0,merkleProof:proof,checkpointIndex:17,signerBitmap:"0x03",aggregateSignature:"0x" + "11".repeat(96)});
  const decoded=AbiCoder.defaultAbiCoder().decode(ISM_V314_METADATA_TYPES,raw);
  assert.equal(decoded.length,20);
  assert.equal(decoded[2],8453n);
  assert.equal(decoded[5].toLowerCase(),routeId);
  assert.equal(decoded[15].toLowerCase(),msgId);
  assert.equal(decoded[18],"0x03");
  assert.equal(getBytes(decoded[19]).length,96);
  assert.throws(()=>encodeISMMetadataV314({...checkpoint,merkleProof:[],messageIndex:0}),/exactly 32/);
});
