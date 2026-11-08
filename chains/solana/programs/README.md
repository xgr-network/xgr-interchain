# XITA V315 — Solana-native Rust implementation

This workspace deliberately mirrors the **logical Solidity modules** while
using Solana's native immutable executable and Program Derived Accounts (PDAs).
A one-to-one **file/module structure** is feasible; a one-to-one EVM contract
deployment topology is *not* Solana's execution model.

| Solidity contract | Rust module | Current implementation |
| --- | --- | --- |
| `XGRILNProtocol.sol` + Solana codec | `codec.rs` | Full additive Solana asset, route, signing-preimage and decimals codec; golden vectors |
| `XETATokenFactoryV315.sol` | `factory.rs` | Permissionless creator-bound collateral router, ZERO-supply synthetic SPL mint (mint-authority PDA, freeze=None), and paired route/fee PDAs |
| `XGRILNRegistryV315.sol` | `registry.rs`, `source_fee.rs` | Permissionless append-only route records, chainwide native SOL validator fee PDA; initial policy and every change require current-set Direct-BLS quorum |
| `XETARouterCore.sol` + guarded routers | `router.rs` | Immutable router identity and route checks; transfer/mint gated |
| `ILNGateway.sol` | `gateway.rs`, `source_gateway.rs`, `inbound_gateway.rs` | Native atomic SPL lock / synthetic burn with SOL source fee, nonce and dispatch receipt; inbound BLS-verified SPL mint / collateral unlock with replay receipt, pending full SBF E2E verification |
| `XGRILNFeeVault.sol` | `fee_vault.rs`, `validator_fee_claim.rs` | Atomic source SOL fee allocation, immutable epoch and operation receipts, BLS self-authorized historical validator claims; pending integrated SBF balance/rollback and max-set tests |
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

This is **NOT an audited or mainnet-approved bridge**. The Rust program now
contains public `BridgeSourceV1` and `ExecuteInboundSolanaV1` instructions,
but the immutable Solana-destination XGR validator bootstrap checkpoint
`PINNED_XGR_SET_ID`, `PINNED_XGR_SET_COMMITMENT` and
`PINNED_XGR_REGISTRY` are intentionally all ZERO. **Both directions fail
closed** until an independently verified release replaces those constants.

`BridgeSourceV1` requires an actual self-signed SPL lock or synthetic wXGR
burn in the same Solana instruction as the current governance-set SOL fee,
monotonic nonce, program-owned `SourceDispatch`, immutable operation receipt
and historical fee-epoch accounting. A failed CPI or receipt creation causes
the entire instruction to roll back.

`ExecuteInboundSolanaV1` verifies the full signed XITA message against a
program-owned historical validator epoch; the registered XGR hub and Solana
router, exact recipient wallet and mint are checked before SPL mint or
collateral unlock. A unique inbound receipt PDA blocks a second execution.

`ClaimSolanaValidatorFee` requires the historical validator's OWN BLS key
on a claim payload that binds program, route, SOL recipient, epoch, validator
identity and monotonic claim nonce. Its recipient wallet must sign the Solana
transaction. FeeVault rent stays segregated and unspendable. There is no
company-controlled SOL sweep.

These are **code implementations, not completed SBF E2E evidence**. Required
before any activation: actual local Agave/Mollusk SPL and SOL balance checks,
atomic rollback and replay tests, full gateway+hash-to-G2 Compute Units at
worst-case validator count, validator-claim payout tests, independent finalized
XGR/Solana source custody evidence, independently reviewed witness crypto,
user-wallet deployment/ELF receipts, program upgrade-authority revocation,
and a full security/delta audit.

Existing EVM contracts and source signing formats are unchanged.

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

### Native SPL custody and fee accounting

`InitCollateralVault` creates a zero-balance SPL token account owned by a
creator's router PDA. `BridgeSourceV1` performs a checked SPL collateral
transfer or a checked synthetic wXGR burn, plus validator SOL fee, immutable
message/operation receipt, historical fee epoch and nonce, **atomically**.
`ExecuteInboundSolanaV1` applies the reverse guarded mint/unlock following
historical Direct-BLS verification and the one-time receipt PDA preflight.

SOL protocol source fees are shared across permissionless routes and cannot
be selected by the caller or company: `ApplySolanaSourceFee` requires a
current-validator quorum even at initial bootstrap. Validator payout uses a
signature from the historical BLS holder plus the payee's own Solana wallet
signature; no bridge operator can redirect accrued SOL validator fees.

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
