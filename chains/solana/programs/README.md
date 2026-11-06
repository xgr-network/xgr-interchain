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
| `XGRILNFeeVault.sol` | `fee_vault.rs` | PDA storage and pure historical rounding; live allocation/claim gated |
| `XGRInterchainValidatorRegistryV3.sol` | `validator_registry.rs` | 2/3 bitmap validation; state transitions and PoP pending |
| `XITADirectBLSISM.sol` | `direct_bls_ism.rs` | Signing preimage available, BLS verifier intentionally fail-closed |
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
On-chain SPL collateral escrow and synthetic mint/burn, the fee-qualified
dispatch, independent finalized source proof, current-set BLS verification
and validator governance, replay protection, native fee claims, audited
Solana wallet deployment and on-chain message handling remain required.

The only executable instructions create *non-transferable initialization
records* or zero-supply SPL synthetic mints. They do not lock, mint, unlock, dispatch, charge bridge fees,
alter validator sets or accept untrusted proof bytes as authorization.
There is no owner/pause/upgrade admin in the Rust instruction set. The
Solana program Upgrade Authority must be permanently revoked before any
production route activation (see `chains/solana/deploy/README.md`).

## EVM continuity

EVM V315 remains fully unchanged. All routes still require XGRChain
(domain 1643) as the hub. Solana source mints use full 32-byte keys;
EVM router endpoints use uniquely left-zero-padded 20-byte identities.
Source-native fees are BLS quorum governed, exactly as on EVM, and never
set by a GmbH service wallet.
