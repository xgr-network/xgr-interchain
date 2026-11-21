# Solana SBFv3 / Mollusk XITA Direct-BLS feasibility result

**Status: PASS (cryptographic feasibility only), 2026-11-07.**

**Measured:** 419,690 Compute Units for a complete positive MinPk
BLS12-381 2-of-3 aggregate verification using the **actual Solana SBFv3 ELF**
executed under **Agave 4.4.0 Mollusk 0.13.4**. The signed message is the
full 501-byte `XITA_SOLANA_DIRECT_MESSAGE_V1` golden vector, not an
arbitrary fixed text message.

- Tested source: `feature/solana-interchain` commit
  `889ab2ed4d8013e4f37bb654904059b475aee017`.
- Test run: https://github.com/xgr-network/xgr-interchain/actions/runs/42401946700/job/128491429647
- Isolated sandbox: `chains/solana/sbf-bench/`.
- Verified 839-byte payload: 3 compressed BLS G1 keys (48 bytes each),
  96-byte aggregate G2 signature, 96-byte RFC9380 hash-to-G2 witness,
  501-byte XITA Direct message, 2-byte opcode/bitmap.
- Curve operations: native Agave 4.x **SIMD-0388** G1 and G2 decompression,
  G1 aggregation and two-pair GT identity check.
- Domain separation: unchanged
  `BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_`.
- Witness: `bls381-hash` pinned to Git commit
  `e1b6e50fee3b1a9d73ac5863e012c5836655c57b`, with every witness
  algebraically verified against the original 501-byte message in SBF.
- Positive: correctly signed validator bitmap `0b101` (2 of 3).
- Negative: insufficient quorum, mismatched bitmap, out-of-range bitmap,
  tampered signature, key, witness, destination, message ID, amount, route,
  and truncated instruction **all rejected**.
- Compute limit in test harness: **1,400,000 CU**; positive case used
  **419,690 CU**. This excludes token custody, destination-account checks,
  replay persistence, validator registry and protocol fee distribution.

## What this does NOT prove

The test intentionally accepts caller-supplied validator keys, which is
appropriate for a cryptographic benchmark but **NOT** for a bridge. An
untrusted caller could sign with its own keys. The code is isolated and is
not imported by `xita-protocol`; it must NEVER be used to authorize mint,
unlock, governance or token release.

Before activating `direct_bls_ism::verify` in the production program:

1. Verify the live current XGR validator set from an immutable
   program-owned PDA with a verifiably anchored genesis commitment and
   BLS-PoP-controlled membership changes, matching the EVM semantics.
2. Bind every signature to the pinned route, finalized source custody,
   source fee evidence, original asset, message ID, recipient, amounts,
   validator-set snapshot and replay-nullifier state.
3. Independently review the third-party witness-verifier implementation,
   canonical point validation, subgroup and infinity exclusions, and
   hash-to-G2 correctness. Preserve the immutable XGR DST.
4. Measure full transaction CU across maximum accepted validator count and
   real SPL CPI / receipt writes, not merely 3 test validators.
5. Audit SVM program and XGRChain Solidity counterparts, ensure public
   deployment has **no Upgrade Authority**, and leave the UI sponsoring
   service optional, without control of base protocol.

No SOL was bought, no mainnet deployment occurred, and existing EVM routing,
contracts and XGR consensus were not altered.
