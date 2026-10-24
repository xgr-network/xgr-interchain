# XITA Direct-BLS security audit v1.0.0 — public redacted report

> **Redacted public record only.** The one complete, immutable 29-page audit report and 67-entry evidence package are preserved separately under access control and cryptographically identified in [README.md](./README.md). The text below deliberately excludes detailed exploitation conditions, vulnerable call sequences, private fixtures and attack reproductions. It is **not** the unrestricted original report.

## Executive summary

An independent AI-assisted assessment of the current Direct-BLS message pipeline covered Solidity contracts, Node interchain validator logic, relayer, wallet flows, recovery, indexed state, fee sponsorship, admin deployment tooling and observable production deployments on XGRChain, Base and Arbitrum.

**Audit snapshot:** 2026-10-24 15:27:42 UTC.  
**Interchain:** `ccef5cd429bf8ad8cb63bd5778c1fae7aaf185cc` (`main`).  
**Node:** `6f5e36b8147eae6275c2fefaadec7aa8488dc674` (`XGR3.0`); released as `v3.3.2`.

**Risk distribution:** 0 Critical, **1 High**, 6 Medium, 7 Low, 3 Informational (17 findings). There was **no confirmed unauthorized principal mint/unlock** caused by a malicious relayer, a single validator or the optional fee service in the tests carried out. That observation is **not** proof of impossibility or a mainnet clearance. The High finding is a **conditional trust-boundary risk**, not a demonstrated live token-theft exploit. Other findings concern finality, operational resilience, defense in depth and provenance.

## Scope and trust boundaries

- Direct BLS signed source messages, domain/message/validator-set binding, route constraints, destination BLS verification and Hyperlane delivery.
- Native/collateral/synthetic token lifecycle; protocol FeeVault versus optional execution-service charging.
- Permissionless route and asset registration, mandatory XGRChain hub for spoke-to-spoke journeys and user-owned wallet transactions.
- Source evidence, chain-specific finality, validator synchronization, failure handling, recovery and reorganization exposure.
- Existing production contract bytecode, constructor/immutable bindings, GitHub deployment records and read-only RPC state.
- Node code: **only** `xgr-network/xgr-node/XGR3.0`. **Excluded:** `xgr-network/xgrchain/PoS_3` (the distinct XGRChain network is in scope as an observed chain).
- Historical development escrow migration, decommissioned Merkle code and old audit findings were not audited as active transfer architecture.

A full end-to-end live malicious-RPC or real-reorganization proof was **not performed**. Conclusions about cross-chain finality depend on the adopted `safe` L2 and committed-IBFT XGR security model; L2 `safe` must not be represented as completed L1 settlement.

## Finding index (publication-safe)

| ID | Severity | Security / reliability area | Original disposition |
| --- | --- | --- | --- |
| H-01 | High | Independent validator source evidence and external RPC trust assumptions | OPEN; conditional architectural exposure, not demonstrated exploit |
| M-01 | Medium | Sponsorship source-finality consistency | OPEN |
| M-02 | Medium | Delivery-state reorganization handling | OPEN |
| M-03 | Medium | Validator authorization state and asynchronous signing synchronization | OPEN |
| M-04 | Medium | RPC request deadlines and runtime shutdown isolation | OPEN |
| M-05 | Medium | Interchain resource isolation from validator consensus | OPEN |
| M-06 | Medium | Fairness and liveness of route discovery hints | OPEN |
| L-01 | Low | Destination wallet proof/message intent binding | OPEN |
| L-02 | Low | Sponsored gas and delegated-wallet compatibility | OPEN |
| L-03 | Low | Execution-service wallet/ownership role separation | OPEN |
| L-04 | Low | Admin receipt finality classification | OPEN |
| L-05 | Low | Admin deployment lock recovery after interruption | OPEN |
| L-06 | Low | Fee-tax backfill reconciliation | OPEN |
| L-07 | Low | Transfer indexer event-window processing resilience | OPEN |
| I-01 | Informational | Pre-existing negative-test and compatibility-test defects | OPEN |
| I-02 | Informational | Node release build metadata and installed-binary provenance | OPEN |
| I-03 | Informational | Solidity compiler advisory review; no proven project miscompile | OPEN |

At the frozen audit snapshot, `OPEN` means no **independently verified post-audit resolution** is recorded. It does not assert that later code changes never occurred. Specific affected lines, PoC details, preconditions and technical fixes are retained **only in the unrestricted original report**, not in public source control.

## Separately documented architecture constraints

- **Single active ValidatorRegistry per chain:** an earlier decision explicitly accepts residual cross-instance membership authorization/replay exposure under an operational single-active-registry invariant. This is **not a cryptographic fix**. Reassess if multi-registry operation is proposed.
- **Permissionless assets:** token-issuer-controlled behavior may undermine escrow expectations for nonstandard/rebasing assets. No universal collateral guarantee can be made for hostile issuer code.
- **Cross-chain finality:** `safe` on Base/Arbitrum and committed IBFT on XGRChain are adopted source policies with residual assumptions; `safe` does not imply complete Ethereum L1 settlement.
- **Two-hop journey labels:** parent/child presentation metadata must not substitute for independently verified source/destination payment and delivery evidence.
- **Decentralization:** route admission must remain permissionless; operator custody or arbitrary centralized route shutdown is not an acceptable quick-fix.

These are recorded **separately** from the 17 formal findings. Historical preaudit PR #278 is a different and earlier assessment, not a second part of this audit.

## Verified observations (snapshot only)

Read-only deployed-runtime comparison at sampled blocks matched **57/57** applicable compiled runtime templates, **26/26** creation-initcode prefixes and **560/560** constructor/getter/manifest binding comparisons. There were eight inbound routes and six router creators in the observed inventory. Snapshot balances alone do not prove historical supply invariants.

Existing tests and original adversarial tests were run as catalogued in [verification.md](./verification.md). Some existing tests failed for identifiable test/checker defects; these are not silently reported green. No real L2 reorganization, sustained validator resource attack, real adversarial RPC takeover or paid mainnet transaction was attempted.

## Overall disposition

**Security remediation and system-level verification remain necessary before any unqualified security approval.** A code-change commit, a passing isolated test, a published release and a real production rollout are four different statements requiring distinct evidence.

For confidentiality and later reproduction, refer to the **original immutable PDF and ZIP checksums**, not to copies of detailed open findings placed on public branches.
