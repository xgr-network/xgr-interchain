# XITA V315 — Solana-native Rust implementation

This workspace deliberately mirrors the **logical Solidity modules** while
using Solana's native immutable executable and Program Derived Accounts (PDAs).
A one-to-one **file/module structure** is feasible; a one-to-one EVM contract
deployment topology is *not* Solana's execution model.

| Solidity contract | Rust module | Current implementation |
| --- | --- | --- |
| `XGRILNProtocol.sol` + Solana codec | `codec.rs` | Full additive Solana asset, route, signing-preimage and decimals codec; golden vectors |
| `XETATokenFactoryV315.sol` | `factory.rs` | Permissionless creator-bound collateral router, ZERO-supply synthetic SPL mint (mint-authority PDA, freeze=None), and paired route/fee PDAs |
| `XGRILNRegistryV315.sol` | `registry.rs` | Append-only, PDA-validated route record; fee changes require future BLS |
| `XETARouterCore.sol` + guarded routers | `router.rs` | Immutable router identity and route checks; transfer/mint gated |
| `ILNGateway.sol` | `gateway.rs` | Explicitly disabled pending atomic source custody and fee evidence |
| `XGRILNFeeVault.sol` | `fee_vault.rs` | Route-scoped fee vault, separate historical epoch state, message receipt PDA replay checks and exact rounding; live allocation/claim gated |
| `XGRInterchainValidatorRegistryV3.sol` | `validator_registry.rs`, `trusted_validators.rs`, `membership.rs` | Native ADD/REMOVE with current-set BLS quorum, PoP, pinned-root bootstrap, fixed-capacity current PDA and append-only historic epoch PDAs; production root remains unset |
| `XITADirectBLSISM.sol` | `direct_bls_ism.rs`, `bls_crypto.rs` | Full MinPk EIP-2537 BLS pairing/hash-to-G2 reference verifier with positive/negative vectors; public bridge verifier stays disabled until authenticated set PDA and SBF compute evidence |
| EVM storage & ABI | `state.rs`, `instruction.rs`, `lib.rs` | Deterministic Borsh account storage and dispatch |

**One executable SVM program**, multiple logical modules and PDAs for
individual creator routers, routes, asset mints and fee vaults. The Solana
integration inventory currently uses component names as **logical roles**;
do NOT treat them as eight independently deployed executable programs or
publish fabricated Program IDs.

## Local validation — no SOL purchase

From this folder, run `cargo check --workspace --all-targets` and
`cargo test --workspace --all-targets`. These are native Rust tests and
require Rust and crate dependencies, not a Solana RPC or a funded wallet.
The sibling `xgr-interchain` Solidity and Node JS/Go codecs use the same
fixed golden vectors. GitHub Actions runs a dedicated Solana Rust job.

## Production admission blocked

This is **NOT a functional bridge and must not be deployed on mainnet**.
On-chain gateway-activated SPL collateral escrow and synthetic mint/burn, the fee-qualified
dispatch, independent finalized source proof, complete end-to-end BLS
and validator governance SBF CU measurement, replay protection, native fee claims, audited
Solana wallet deployment and on-chain message handling remain required.

The only executable instructions create *non-transferable initialization
records* or zero-supply SPL synthetic mints. They do not lock, mint, unlock, dispatch or charge bridge fees. A distinct
`ApplyValidatorMembership` instruction can update only the program-owned
validator PDA after native current-set BLS quorum and optional ADD PoP checks;
this stays fail-closed while the Solana-destination immutable anchor is unset.
There is no owner/pause/upgrade admin in the Rust instruction set. The
Solana program Upgrade Authority must be permanently revoked before any
production route activation (see `chains/solana/deploy/README.md`).

## EVM continuity

EVM V315 remains fully unchanged. All routes still require XGRChain
(domain 1643) as the hub. Solana source mints use full 32-byte keys;
EVM router endpoints use uniquely left-zero-padded 20-byte identities.
Source-native fees are BLS quorum governed, exactly as on EVM, and never
set by a GmbH service wallet.

## Deployment-unit mapping

`solanaPrograms` in the integration plan is a list of **logical modules**.
The Admin's one `xitaProtocol` SVM component is one ELF/Program ID and one
immutable upgrade-authority check. Creator routers, fee vaults and route
records are independent PDAs under that executable. XGR-side Solidity
components remain distinct executable contracts when actually deployed.

### Native SPL custody and fee accounting building blocks

`InitCollateralVault` is a permissionless **zero-balance** SPL token account
initialization owned by the creator router PDA. The code contains guarded
`transfer_checked` lock/unlock CPI helpers, but the public gateway still
refuses transfer instructions until it can atomically record the exact message,
verified route, source-fee escrow and current validator epoch.

The Rust `FeeEpoch` and `OperationReceipt` types provide separate historical
validator epochs and receipt PDAs to prevent duplicate message-fee allocation.
`plan_allocation` is **pure only**; it does not move funds, change lamports or
create a transferable claim. Its set IDs and recipient counts still need
trusted, on-chain Direct-BLS-validated snapshots.

## XGR Direct-BLS cryptography parity

`bls_crypto.rs` implements the actual MinPk BLS12-381 pairing verification
using XGR's existing EIP-2537 128-byte G1 and 256-byte G2 encodings, the
unchanged `BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_` DST and RFC 9380
hash-to-G2. Tests use the positive reference vector from
`test/XGRInterchainBLSVerifier.t.sol`, plus fresh 2-of-3 aggregate signatures
and failures for tampered message, invalid bitmap, substituted validator key,
infinity, invalid curves and bad padding. No tokens or network access needed.

**IMPORTANT:** The pure Rust verifier is the reference implementation. The local reference and the isolated SBF benchmark are verified (419,690 CU
for a 2-of-3 BLS proof). The SVM membership instruction is implemented, but
its real XGR bootstrap is blocked pending verified Solana-destination
registry commitment and an integrated maximum-validator-count CU benchmark. A purely
cryptographically valid vote without this chain/route binding cannot authorize
transfers. The final SVM verifier must use the active SIMD-0388 native syscall
backend or another audited and budget-tested implementation before release.

## Validator governance (EVM V3 parity)

`BootstrapXGRValidators` creates two accounts atomically: the fixed-space
current PDA and immutable snapshot PDA for the anchored epoch. It can only be
called with a hard-pinned current XGR V3 validator-set ID, commitment and
**Solana-destination** source registry. These release constants are currently
zero and must not be inferred from the existing XGRChain destination=1643
registry.

`ApplyValidatorMembership` accepts compressed 96-byte G2 signature plus a
96-byte RFC9380 witness. It verifies the 2/3 current-set BLS quorum with the
exact Solidity V3 payload, verifies a separate key PoP for ADD, rejects a
stale set ID or expired 10-minute deadline, performs swap-and-pop on REMOVE,
commits the replacement validator list to the fixed-space current PDA and
creates a one-time historical PDA. All are in one atomic Solana instruction.
No company/operator signer is needed. Historical BLS verification reads its
PDA from the requested set ID, matching EVM V3 semantics.

Unlike EVM's dynamic arrays, the current SVM record reserves space for **16**
validators. This limit is NOT validated for worst-case Compute Units and must
be audited/benchmarked before admitting public routes. Solidity's optional
validator deactivation-reserve/reimbursement economics also need an explicit
Solana-native equivalent; do not claim full economic parity yet.
