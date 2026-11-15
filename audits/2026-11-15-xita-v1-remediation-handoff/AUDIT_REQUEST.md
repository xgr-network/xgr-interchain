# XITA V1 — Post-remediation delta audit handoff (2026-11-15)

**Status: AUDIT REQUEST, NOT AN AUDIT RESULT.** This file is not an independent assurance opinion, a GO decision, or a claim that remediation is installed on production hosts. Do not copy prior findings into a newly labelled "resolved" register without new source-first evidence. Preserve all existing audit directories and the existing English report/manifest/coverage/evidence conventions.

## Exact frozen source targets

- Interchain: `xgr-network/xgr-interchain`, branch `main`, commit `dedc13181d63bd241429a871aaa05a4fbbffd6a0`.
- XGR node: `xgr-network/xgr-node`, branch `XGR3.0`, commit `d5e8977a0fa1059b2ccf25ecefc360c7454e39df`.
- Previous public audit baseline: `audits/2026-11-06-xita-direct-bls-delta-v3.3.0/` and its referenced frozen source commits, evidence, original finding IDs and prior dispositions.
- Interchain PRs: #412 (F-36; merge `01cce1b69958e1f130fb9f5ff665665439cc069c`), #413 (F-08; merge `b290387aa819bcb74cafd9bc351db7a839a81608`), #414 (F-19; merge `dedc13181d63bd241429a871aaa05a4fbbffd6a0`).
- Node PR: #91 (F-20; merge `d5e8977a0fa1059b2ccf25ecefc360c7454e39df`).
- Joint code-content evidence: integration-only PR #415, commit `9a0c37f7ef46069c462fc84795225a077ea552ca`. The integration Git tree `f9541b9736fea8da4b505e315f09e1c57da9f927` is **identical** to the final Interchain main Git tree. On that integration commit, all four workflows passed: Validate (runtime and disposable PostgreSQL), Native Interchain Contracts, XITA Direct BLS Security Review, and Verify XITA Join applications.
- Companion node #91 passed CI (PR) and XGR Direct-BLS Release Candidate workflows on its reviewed commit prior to merge. Verify source/merge SHA and build provenance independently.

**Excluded:** Solana integration/PRs, speculative unmerged work, unseen private source, actual production activation, service restarts, token minting, fee payouts and on-chain transfer attempts. An HTTP endpoint check alone does not prove which executable is installed.

## Required separation of security claims

### A. Immutable deployed contracts and core transfer protocol

Independently verify actual chain-specific contract addresses, runtime hashes, deployment receipts, immutable configuration, custody collateral and wrapped-asset accounting, message identity/replay protection and destination execution rules. Differentiate upgrades/redeploys from web and backend releases. Audit code that constructs on-chain calldata even if stored under `apps/web`; UI location is not a security exemption.

### B. XGR validator and Direct-BLS security

Inspect message/source/finality authentication, signer eligibility, set changes, quorum/PoP and RPC witness independence. Independently reproduce F-20 replacement-vote and disk-persistence negatives: missing/ineligible successor, changed fee or destination fields, restart, failed fsync and no removal of the original recovery locator before durable replacement. Inspect other existing medium findings relevant to validator admission or witness trust. Clearly separate source change, build result and **observed production node version**.

### C. Optional services

**F-36 Creator**: verify UTF-8 byte-length parity with the contract, per-item queue quarantine, oldest-first selection, restart/retry, valid sibling progress and preservation of every uncertain signed transaction and nonce. Inspect remaining Creator retention/provenance findings F-37/F-38 independently.

**F-08 Sponsorship fairness**: verify per-chain candidate selection, independent read-only RPC timeouts, stalled source/destination progress, expiration/reconciliation and monitor write behavior. Prove the signed/raw-transaction effects are never raced or repeated on a late timer; verify same-chain nonce ordering, shared Creator/Sponsor wallet interlocks and no double grant. A green status from a mocked provider is not a proof of fully autonomous all-chain liveness.

**F-19 paid obligations**: verify the admission-off/old-service-on distinction, immutable signed quote vs finalized TX1 match, append-only overtaken obligation ledger and reviewer outcome log, database least-privilege (including actual PostgreSQL roles), restart, unknown/pending grants and externally overtaken delivery. Operator logging **does not** equal fulfillment, compensation, waiver or complete settlement. Explicitly state any required human escalation/accountability and obtain acceptance of an operating policy; do not invent acceptance or mark liabilities as resolved. No automatic late gifts, blind nonce replacement or deleting debt.

### D. User-facing UI, admin and notifications

Review wallet actions, network and destination constraints, quote/grant-status presentation, non-custodial access, onboarding and e-mail as distinct product/UI quality dimensions. Do not infer compromised immutable contracts from changes limited to e-mail copy or application rendering. Conversely, identify UI vulnerabilities that induce unsafe wallet signatures as security issues. Classify every observed fix by **trust boundary and actual effect**, not source folder name or generic PR title.

## Audit deliverables

1. Preserve old audit IDs/history and give independently sourced delta severity/disposition for all current remaining Medium/Low/Info causes; explicitly distinguish OPEN, PARTIALLY_MITIGATED, VERIFIED RESOLVED and ACCEPTED RISK.
2. Provide separate outcomes for **permissionless self-funded core transfers**, **optional sponsored transfers**, **public unattended Creator**, **UI/onboarding** and **production rollout readiness**.
3. Publish reproducible positive and negative tests with exact commit SHA and CI run references; distinguish local fixture simulations, available public RPC observations and unavailable external witnesses. Reproduce relevant counterexamples instead of inferring closure from patch title.
4. Include deployed contract runtime comparison and observed node/service evidence if accessible. If not verifiable, request the missing operational evidence rather than inventing a negative incident or a production NO-GO solely from absent access.
5. Do not silently weaken trust-boundary controls, alter Solidity on-chain contracts, introduce Solana changes, rotate keys or trigger transactions while auditing. No production merge/deploy/restart is part of this request.
6. Explicitly report residual operational risks and any human-approved policy prerequisites. The previous audit's conditional decisions remain historical reference, **not** automatically superseded.

The resulting report must honestly distinguish protocol security from application maintenance, without downgrading real node/relayer security defects or using the interface's rate of bugfixes as a proxy for exploitability.
