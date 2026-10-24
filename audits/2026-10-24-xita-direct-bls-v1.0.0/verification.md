# XITA Direct-BLS v1.0.0 — verification and provenance

**Immutable audit baseline:** 2026-10-24T15:27:42Z. Interchain `ccef5cd429bf8ad8cb63bd5778c1fae7aaf185cc`; node `6f5e36b8147eae6275c2fefaadec7aa8488dc674`.

## Actually executed tests

| Area | Observed result | Limitation |
| --- | --- | --- |
| Existing Foundry/Solidity suite | **102 passed / 103 tests** | One pre-existing negative test failed due to misplaced revert expectation; not counted as passed |
| Existing relayer, wallet, indexer and service JavaScript | **315 / 315 passed** | Code-level tests, not production-chain hostile-provider proof |
| Existing admin/tools JavaScript | **302 / 303 passed** | One stale compatibility checker expectation failed |
| Node Go interchain suite | **7 package groups passed** | Number denotes package groups, **not** seven individual test cases |
| New independent Solidity negatives/invariants | **15 passed** | Includes two fuzz cases, 256 runs each (512 iterations total) |
| New independent JavaScript negative reproductions | **6 passed** | “Passed” here confirms the behavior was **reproduced**, not fixed |
| New independent admin negative reproductions | **2 passed** | “Passed” confirms vulnerability/behavior reproduction, not remediation |
| Local delegated-wallet gas simulation | Reproduced gas-estimation edge case | Local Anvil only, not funded production wallet action |

Exact scripts and full inputs are retained in the **restricted 67-entry original evidence package**. This public register intentionally does not provide active reproduction recipes.

## Observed on-chain inventory (read-only)

| Verification class | Result |
| --- | --- |
| Deployed runtime templates versus locally built production bytecode | 57 of 57 matched, with applicable immutable-region handling |
| Deployment creation-initcode prefixes | 26 of 26 matched |
| Constructor, getter and manifest binding comparisons | 560 of 560 matched |
| Inbound route configurations inspected | 8 |
| Router creators inspected | 6 |
| Sampled XGR native escrow and Base synthetic supply | Corresponding 100-XGR snapshot values; **not proof of all-time collateral correctness** |

The audit inspected XGRChain (chain ID 1643), Base (8453) and Arbitrum (42161). All read-only results apply only to the sampled states/deployments and are not an authorization for future migrations or fresh deployments.

## Build and binary provenance

- Published Node release `v3.3.2` was traced to the audited Node commit.
- A downloaded release binary and expected repository data were checked, but the **live installed binary identity was not conclusively established**.
- Build/link version metadata warrants follow-up (I-02); do not treat an RPC self-reported version string as a cryptographic software attestation.
- Compiler advisory tracking (I-03): Solidity 0.8.24 with viaIR; a compiler security advisory exists but **no XITA-specific miscompilation was demonstrated**. A broad mainnet contract redeployment is not justified from the advisory alone.

## Work not performed or not fully demonstrated

- No paid live mainnet transaction or direct production state mutation.
- No sustained mainnet malicious RPC-source simulation across the complete quorum.
- No forced live Base/Arbitrum reorganization or chain settlement rollback.
- No sustained validator overload attack demonstrating real PoS/IBFT consensus outage.
- No full live multi-validator post-remediation rotation/recovery acceptance test.
- No independent installed-mainnet Node binary digest attestation.

## Required release and remediation gates

| Gate | Required evidence | Current audit record |
| --- | --- | --- |
| H-01 source/provider independence | Adversarial/quorum-wide trust-root test and approved risk model | PENDING |
| Sponsor/indexer/admin finality | Consistent safe/IBFT decisions with canonical-hash/reorg negatives | PENDING |
| Validator resource and signing isolation | Authorization freshness, cancellation, bounded per-peer workload and consensus continuity | PENDING |
| Message intent and delegated wallets | Negative wallet-intent proof binding and broad wallet gas compatibility | PENDING |
| Deploy/recovery and reconciliation | Exactly-once receipt/index flow, dense event scanning, restart-safe operator recovery | PENDING |
| Cross-chain asset invariants | Real route/validator rotation, failure/restart/delivery, source-vs-destination supply consistency | PENDING |
| Production identity | Exact tested commit, release binary digest, on-chain runtime/ownership/binding, operator rollout evidence | PARTIAL — read-only codehash/runtime inventory; installed Node binary unverified |

This audit provides **no blanket security sign-off**. A new code commit must be evaluated against its own test evidence and deployed environment. Tracked fixes must not overwrite the original immutable assessment.
