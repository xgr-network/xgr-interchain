# Solana integration – architecture and implementation gates

**Development branch:** `feature/solana-interchain` in both `xgr-node`
(based on `XGR3.0`) and `xgr-interchain` (based on `main`).

## Single XITA protocol; chain-specific implementations

Keep the EVM networks and their deployed V315 routers, factories, registries,
Direct-BLS signing bytes, token representations and replay protection untouched.
XGRChain (1643) remains the mandatory settlement hub. A Solana route uses
new Solana-program implementations on Solana and purpose-built Solidity
counterparts on XGRChain. Do NOT truncate Solana account identities.

| Side | Responsibility |
| --- | --- |
| XGR node `interchain/solana/` | Finalized Solana RPC observations, later instruction/escrow/fee evidence and BLS signing worker integration |
| XGRChain Solidity | Solana-address-aware Factory, route registry, guarded router and Direct-BLS ISM |
| Solana SVM/Rust | Registry, Mailbox, Direct-BLS verifier, SPL escrow/synthetic, Factory and FeeVault |
| XITA Admin | Solana Wallet Standard signing, deployment stages, resilient hash recovery, independent RPC and programdata/ELF receipts |
| Repository | `config/chains/solana/` desired plan; `chains/solana/` source; existing sharded asset manifests; only verified records in `deployments/` |

## Decision gates before mainnet

1. Verify Solana BLS12-381 pairing/hash-to-G2 against **current XGR**
   Direct-BLS fixed vectors and Solana compute-budget limits.
2. Specify an unambiguous 32-byte Solana account identity on both sides,
   including canonical asset IDs and route IDs. An EVM `address` cannot encode
   a complete Solana `Pubkey`.
3. Implement and test one-hop, reverse, and two-hop transfers including
   SPL decimals, escrow backing, replay and BLS key rotation.
4. Implement independent finalized source instruction+state evidence at two
   independent RPC operators; message-specific BLS signing MUST remain
   fail-closed until complete source fee and program identity verification.
5. Build unsigned, user-confirmed deployments and receipts within Admin UI:
   no privileged backend wallet; no repeat deploy on pending signature.
6. Security review of Solana programs AND XGR-side counterparts, then
   receipt-pinned release policy and E2E devnet tests; no premature listing.

## Safe staging rule

`config/chains/solana/integration.json` is a separately validated proposal.
It intentionally is not a `chain.json`: that file is interpreted by the
current admin, catalog builder and validators as an active EVM-oriented chain.
The Admin displays Solana as a separate development lane; it must not offer
MetaMask EVM deploy buttons or present absent programs as deployed.

Solana mainnet-beta identity is its fixed genesis hash. Domain `1399811149`
is a messaging domain, not a native chain ID.

Current branch delivers the isolated plan, read-only Admin RPC diagnostics
and the fail-closed node RPC observation layer. Rust programs, cross-chain
message codecs, executable wallet deployer and live BLS authorization remain
subsequent implementation work.
