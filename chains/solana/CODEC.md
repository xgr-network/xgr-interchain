# Candidate Solana endpoint codec (no SOL required)

This is an additive **Solana route adapter**, not an upgrade of the existing
EVM V315 ABI, consensus or direct signing bytes. Existing EVM-origin assets
retain the exact V315 `assetId`. Only Solana-original SOL/SPL assets receive
the domain-separated `XITA_SOLANA_ASSET_V1` ID.

- Solana mainnet-beta is bound by its decoded 32-byte genesis hash
  (`45296998…b08c7ef0`) and messaging domain `1399811149`.
- XGRChain endpoint is domain `1643`, EVM `address` right-aligned inside
  `bytes32`; Solana endpoints are their **full 32-byte public key**.
- Route scope `XITA_SOLANA_ROUTE_V1` and ABI-word encoding:
  `keccak256(abi.encode(keccak256(scope), assetId, sourceDomain:uint32,
  destinationDomain:uint32, sourceRouter:bytes32, destinationRouter:bytes32,
  solanaGenesis:bytes32))`.
- Solana original asset scope `XITA_SOLANA_ASSET_V1` and ABI-word encoding:
  `keccak256(abi.encode(keccak256(scope), solanaDomain:uint32,
  solanaGenesis:bytes32, mint:bytes32, kind:uint8))`. Native SOL is
  mint=zero/kind=0, SPL mint is nonzero/kind=1.
- Both route directions MUST have exactly one endpoint at XGR domain 1643.
  Two-spoke routes are two separate hops. Legacy EVM route IDs are unchanged.
- Candidate signing preimage is fixed-width *big-endian*:
  ASCII `XITA_SOLANA_DIRECT_MESSAGE_V1` + sourceDomain(4) +
  destinationDomain(4) + solanaGenesis(32) + assetId(32) + routeId(32) +
  validatorSetId(8) + sourceHeight(8: EVM block or SVM finalized slot) +
  sourceRegistry(32) + gateway(32) + sourceRouter(32) + sourceMailbox(32) +
  destinationRouter(32) + sourceNativeValidatorFee(32) + messageId(32) +
  recipient(32) + amountInCanonicalAssetAtomicUnits(32) +
  destinationIsm(32) + destinationValidatorRegistry(32).
  Total: 501 bytes. The signed message ID must commit to exact source token
  movement; this is not itself an RPC/custody/fee proof.
- Native SPL amounts use a `u64` balance while XGR EVM uses up to 256-bit
  amounts. Convert with explicit original/destination decimals. Reject
  nonrepresentable dust, zero, overflow and mismatched mint decimals.

`test-vectors.json` defines stable EVM/Solana cross-language fixtures.
The JS codec lives in `chains/solana/codec.mjs`; Solidity is in
`contracts/solana/XITASolanaCodec.sol`; Go node mirror in
`interchain/solana/codec.go` on the sibling branch. Run tests entirely
offline. No user needs to buy SOL/XGR to exercise any codec tests.

**CRITICAL:** This candidate does not permit Direct-BLS signing or program
deployment. It cannot bypass pinned program identity, independently verified
finalized source custody/fee evidence, live destination validator snapshot,
on-chain route binding, replay protection and security review. The eventual
Solana program must implement the identical format and compare golden vectors
before any mainnet release. No existing V315 EVM contract is modified.
