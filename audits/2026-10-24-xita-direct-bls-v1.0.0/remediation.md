# XITA Direct-BLS v1.0.0 — remediation ledger

**Source of truth for original findings:** immutable full security report, SHA-256 in [README.md](./README.md).  
**Public disclosure state:** REDACTED_PUBLIC. Do not paste unresolved exploit details, test harnesses or secret-bearing logs into public PRs.  
**Audit baseline:** 2026-10-24; interchain `ccef5cd429bf8ad8cb63bd5778c1fae7aaf185cc`; node `6f5e36b8147eae6275c2fefaadec7aa8488dc674`.

## Audit finding register (baseline states)

| ID | Sev. | Area | State | Closure evidence required (high-level) |
| --- | --- | --- | --- | --- |
| H-01 | High | Validator independent source verification | OPEN | Explicit independent source-of-truth policy; hostile-provider tests and multi-validator review |
| M-01 | Medium | Sponsor source-finality policy | OPEN | Source finality consistency, negative canonicality tests |
| M-02 | Medium | Delivery index reorganization recovery | OPEN | Reorg-aware provisional/final states and recovery regression |
| M-03 | Medium | On-demand sign-worker synchronization | OPEN | Synchronization and stale-authorization rejection tests |
| M-04 | Medium | RPC timeouts and cancellation | OPEN | Deadlines, cancellation and shutdown tests |
| M-05 | Medium | Interchain/consensus resource boundaries | OPEN | Bounded work and consensus-isolation stress evidence |
| M-06 | Medium | Route-hint queue progress | OPEN | Bounded fairness and starvation regression |
| L-01 | Low | User destination message binding | OPEN | Exact independently authenticated message-intent regression |
| L-02 | Low | Sponsored delegated wallets | OPEN | Wallet-type-aware gas estimation and recovery regression |
| L-03 | Low | Service/ownership roles | OPEN | All authorized role-transition invariants verified |
| L-04 | Low | Admin deployment receipts | OPEN | Safe/IBFT finality policy tests and reorg handling |
| L-05 | Low | Deployment lock lifecycle | OPEN | Crash/stale-lock operator recovery without losing evidence |
| L-06 | Low | Fee-tax backfill reconciliation | OPEN | Correctly linked successful fee evidence with idempotent backfill |
| L-07 | Low | Indexer log-window processing | OPEN | Dense-event window and forward-progress regression |
| I-01 | Info | Existing regression-test defects | OPEN | Corrected negative and compatibility checks run |
| I-02 | Info | Release metadata and provenance | OPEN | CI linker/version evidence and installed-binary identity |
| I-03 | Info | Compiler advisory | OPEN | Targeted compiler differential/scope review; redeploy only if justified |

All counts are inherited only from **this audit's own new findings**, never from older audit drafts. “OPEN” is a **frozen-benchmark** status. If remediation is added later, append/replace the *current-status record* with a PR, exact commit, validation and deployment identity while retaining the original assessment.

## Explicit decisions and residual-risk register

| Item | Decision/status | Review trigger |
| --- | --- | --- |
| AR-01 — membership registry binding | ACCEPTED_RISK: exactly one active ValidatorRegistry instance per chain; cross-instance authorization risk acknowledged, not cryptographically eliminated | Registry redeploy/parallel instance, validator rotation, altered trust assumptions |
| AR-02 — permissionless issuer behavior | DOCUMENTED_ARCHITECTURE_CONSTRAINT: hostile/rebasing issuer may degrade underlying collateral; do not promise blanket safety | New token classes, custody invariant changes |
| AR-03 — chosen source finality | DOCUMENTED_ARCHITECTURE_CONSTRAINT: Base/Arbitrum `safe`, XGR IBFT commitment with explicit residual risks | Change in L2 finality or settlement guarantees |
| AR-04 — two-hop parent labeling | DOCUMENTED_TRUST_BOUNDARY: index and UI must authenticate source, delivery and onward operations, not labels alone | Journey API or UI evidence model changes |

These are not extra findings or hidden deployment blockers. Any additional acceptance decision must identify its approver, dated rationale and controls; do not silently reinterpret findings as accepted.

## Remediation change log

No post-audit fixes have been independently checked **within this versioned record** as of the October 24 audit snapshot. Future updates must include:

- Finding ID, exact affected repository/branch, PR URL and immutable merge commit.
- Unit, negative, fuzz/invariant and integration tests with exact commands and result logs.
- Production release and deployed binary/contract verification separately where relevant.
- Remaining risk, acceptance decision and verifier/date.

Only mark `VERIFIED` when reproductions and corrective tests have been executed; only mark `RELEASED` when target runtime identity is confirmed. Do not modify the original PDF or backdate its conclusions.
