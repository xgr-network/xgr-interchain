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


## Permissionlessness and MiCAR-relevant operational control

The Solana variant MUST NOT create governance powers for XGR.Network GmbH.
No program upgrade/close authority may remain at public activation. No
company-controlled pause, freeze, custody, unrestricted mint, unilateral
protocol fee setter, allowlist or forced route migration. Program code is
fully immutable and reproducibly verified before assets/routes can be live.

Wrapped token minting and vault release are authorized exclusively by
on-chain program-derived addresses, with auditable immutable logic that
checks source custody, current direct BLS quorum, route, amount, fee and
replay state. A wrapped mint's mint authority therefore remains a PDA; the
freeze authority must be None. Do not confuse these authorities with
Solana program Upgrade Authority.

Third parties are allowed to deploy the same open-source software. A new
protocol release changes the Program ID and is voluntarily adopted; no
owner can upgrade the existing bridge or silently redirect a route.
This also applies to XGR-side Solana-specific Solidity counterparts:
they must not embed operator-only pause/mint/route/configuration rights.

**Compliance caveat:** Technical immutability and self-custody improve the
decentralization analysis but do not establish a CASP exemption. MiCAR
Recital 22 excludes fully decentralized services with no intermediary,
while services controlled directly or indirectly by identifiable persons
can remain in scope. Independent validator governance and actual operational
control must be assessed separately. See official EUR-Lex Regulation
2023/1114 Recital 22 and ESMA Q&A 2671.
