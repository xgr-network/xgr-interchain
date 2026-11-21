# Solana Direct-BLS release gates — XGR V315 protocol parity

## Verified now (offline and free)

The Rust package implements the exact XGR min-pk BLS12-381 signature scheme:
EIP-2537 128-byte G1, 256-byte G2, RFC 9380 hash-to-G2,
`BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_`.
The existing Solidity positive vector from
`test/XGRInterchainBLSVerifier.t.sol` verifies in Rust. A real 2-of-3
aggregate signature is tested both on a standalone message and on the
complete 501-byte XITA Solana Direct authorization. Changing a route,
recipient, amount, source fee, message ID, epoch or validator key invalidates
the authorization. The XGR V3 validator-set commitment is reproduced using
the same ordered validator addresses and compressed G1 keys.

These results are **cryptographic equivalence tests**, not a proof that an
on-chain Solana protocol program will fit the compute budget, not proof of
XGR finality, and not a trusted validator-set bootstrap.

## Required before callable on-chain verify()

**Gate A: verified Solana-side trusted current validator set.** The program
must load the set exclusively from an owner-/PDA-checked account, with a
bootstrap commitment cryptographically pinned to the canonical XGR V3
registry. A self-signed arbitrary bootstrap is forbidden. Every ADD/REMOVE
must verify a quorum of the CURRENT set, the exact XGR transition payload,
proof-of-possession (PoP) and non-duplicate compressed/uncompressed BLS keys.
Set snapshots/epochs remain immutable for historical fee claims. No GmbH
operator role, upgrade key, bypass route or ad-hoc validator list.

**Gate B: audited native curve computation.** The current `bls_crypto.rs`
implementation is an *offline correctness oracle* using zkcrypto 0.8 and
the same SHA-256 expander. SIMD-0388 native BLS12-381 group/point/pairing
syscalls are active on Agave 4.x, but the opcode family does NOT include a
standalone RFC 9380 hash-to-G2 syscall. The mainnet verifier must therefore
implement a completely verified hash-to-G2 pipeline and use the native
pairing/group operations (or another independently audited and
compute-budget-tested implementation). Never accept an unverified
caller-supplied G2 hash point or an off-chain `verified=true` flag.

Experimental witness-assisted hash-to-G2 designs exist, e.g.
`crypt0miester/bls12-381-hash` (see GitHub repository and benchmark report).
A witness is acceptable ONLY when every algebraic condition is verified
on-chain against the ORIGINAL signed message, XGR DST and message codec.
Its published estimates are third-party results, not XITA validation.
Do not introduce an unaudited cryptographic dependency directly into a
production asset-custody program.

**Gate C: real SBF execution and resource measurements.** Build with a
pinned Agave 4.x toolchain and run both positive and negative cases in
Mollusk/Agave with the actual enabled SIMD-0388 feature gates. Record
compute units, instruction bytes, account size and heap/stack use for the
worst accepted validator-set size. Host `cargo test` alone is insufficient.
Measure at least single-validator, 2-of-3 quorum, invalid G1/G2,
noncanonical padding, changed signing bytes, stale validator set, duplicate
keys and replay attempts.

**Gate D: full XGR/Solana transport semantics.** Only after the destination
verifies the canonical route, independently finalized source custody
and source-native fee allocation, message uniqueness and current validator
quorum may program-PDA mint/unlock CPIs be enabled. Each transfer must remain
self-signed and executable by arbitrary independent relayers; sponsoring and
commercial UI-service are optional and separate. EVM V315 wire format,
existing Solidity contracts and their validator signatures remain unchanged.

**Gate E: mandatory code/upgrade-authority audit.** No live route may be
admitted before the SVM ELF is independently checked, immutable
(Upgrade Authority = None), origin/destination program IDs are pinned in
receipts, and both Rust/Solidity gateway/registry proof paths pass a
regression and delta audit.

## Explicit release status

- `bls_crypto::verify_eip2537_quorum`: local correctness oracle **implemented**.
- `direct_bls_ism::verify_cryptography_against_snapshot`: verifies the
  cryptography against a **caller-supplied untrusted in-memory view**.
- `validator_registry::xgr_set_commitment`: parity commitment HASH builder
  **implemented**. Native `BootstrapXGRValidators` and
  `ApplyValidatorMembership` instructions are **implemented but remain
  fail-closed** while the independently verifiable Solana-destination XGR
  initial registry root is not pinned. Historical epoch PDA snapshots are
  created append-only, with the current root stored in a fixed-capacity PDA.
  A full Agave transaction-level CU result for ADD with quorum+PoP and
  maximum-set cardinality is still required.
- `direct_bls_ism::verify`: **intentionally disabled**.
- `XitaInstruction::Bridge`, `ExecuteInbound`, `ApplySourceFee`,
  `ClaimFees`: **intentionally disabled**.
- Solana Mainnet SOL expenditure, program deployment or route admission:
  **none**.

Architecture references:
- https://solana.com/upgrades/new-cryptography
- https://github.com/solana-foundation/crypto-primitives-examples
- https://github.com/crypt0miester/bls12-381-hash (EXPERIMENTAL, unaudited)

This must be updated by executed CI/Agave evidence, not by a statement of
intent or an unchecked RPC response.
