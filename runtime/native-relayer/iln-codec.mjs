import { AbiCoder, solidityPacked } from "ethers";

// The Solidity v3.1.4 contracts and the Go XGR node MUST use this same V2 ABI.
export const ILN_OPERATION_EVENT =
  "event ILNOperation(bytes32 indexed routeId,bytes32 indexed messageId,uint32 indexed destinationDomain,uint256 validatorFeeWei)";

export const CHECKPOINT_DOMAIN_V2 = "XGR_ILN_CHECKPOINT_V2";
export const ISM_V314_METADATA_TYPES = Object.freeze([
  "uint32", "bytes32[32]", "uint64", "uint32", "uint32",
  "bytes32", "uint64", "uint64", "address", "address",
  "address", "address", "address", "address", "uint256",
  "bytes32", "bytes32", "uint32", "bytes", "bytes",
]);

export function requireRouteId(value) {
  if (typeof value !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(value) ||
      /^0x0{64}$/i.test(value)) {
    throw new Error("ROUTE_ID must be a nonzero 32-byte hex value");
  }
  return value.toLowerCase();
}

export function encodeCheckpointPayloadV2(p) {
  return solidityPacked(
    [
      "string", "uint64", "uint32", "uint32", "bytes32",
      "uint64", "uint64", "address", "address", "address",
      "address", "address", "address", "uint256",
      "bytes32", "bytes32", "uint32",
    ],
    [
      CHECKPOINT_DOMAIN_V2,
      p.sourceChainId, p.sourceDomain, p.destinationDomain, p.routeId,
      p.setId, p.sourceBlockNumber, p.registry, p.gateway, p.sourceRouter,
      p.mailbox, p.merkleTreeHook, p.destinationRouter, p.validatorFeeWei,
      p.authorizedMessageId, p.root, p.index,
    ],
  );
}

export function encodeISMMetadataV314(p) {
  if (!Array.isArray(p.merkleProof) || p.merkleProof.length !== 32) {
    throw new Error("ISM metadata requires exactly 32 Merkle proof siblings");
  }
  return AbiCoder.defaultAbiCoder().encode(ISM_V314_METADATA_TYPES, [
    p.messageIndex,
    p.merkleProof,
    p.sourceChainId,
    p.sourceDomain,
    p.destinationDomain,
    p.routeId,
    p.setId,
    p.sourceBlockNumber,
    p.registry,
    p.gateway,
    p.sourceRouter,
    p.mailbox,
    p.merkleTreeHook,
    p.destinationRouter,
    p.validatorFeeWei,
    p.authorizedMessageId,
    p.root,
    p.checkpointIndex,
    p.signerBitmap,
    p.aggregateSignature,
  ]);
}
