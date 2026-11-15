# XITA V1 post-deployment delta audit

**Report revision 3.4.0 | 15 November 2026 | Node v3.5.1**

F-20 is verified resolved for its original consume-before-durable-successor cause. F-36, F-08 and F-19 have useful repairs but remain partially mitigated: post-deployment Creator publication can still monopolize the worker; serialized sponsorship effects still couple healthy chains to a stalled broadcast; and logging/escalation is not a controlled financial outcome. A newly demonstrated Low issue, F-40, affects privileged reviewer metadata attribution, not bridge custody. No new Critical or High defect was demonstrated within the reviewed delta. The current 40-cause register contains 10 Medium, 16 Low, 3 Informational and 11 resolved causes. One existing Medium remains an explicitly bounded accepted risk, not a new acceptance.

| Current classification | Unique causes |
| --- | --- |
| Critical / High | 0 / 0 demonstrated |
| Medium / Low | 10 / 16 |
| Informational / Resolved | 3 / 11 |
| Total / prior total | 40 / 39 |

AI-assisted source-frozen delta reassessment, not an external audit-firm certificate. The reviewer had the prior conversation, finding register and some implementation history; this is neither blind nor independent of all prior development. New executions and contradictory outcomes are recorded separately from inherited evidence. No production transactions, service restarts, contract deployments or product-code changes were performed.

## 1. Executive interpretation

Neither immutable contract source nor browser application source changed in the remediation delta. A UI/email maintenance commit is not evidence of compromised collateral or BLS forgery. Conversely, node signing, proof-to-wallet binding and service transaction construction retain their real security consequences regardless of directory. Bytecode matching does not prove every mutable configuration value, all historical balances, all validator installations or independence of RPC upstreams.

The previous statement that all four remediation packages were implemented and green in CI did not establish audit closure. This review contradicts that implication where fresh counterexamples remain. The distinction matters commercially and technically: optional onboarding and fee-grant reliability still need targeted work, while no new change to the core collateral/Direct-BLS authorization rules was introduced.

| Finding | Current decision | Reason |
| --- | --- | --- |
| F-20 | Verified resolved | Exact durable successor and restart/write-failure evidence. |
| F-36 | Partially mitigated | Unsigned queue repaired; deployed-profile publication still blocks later work. |
| F-08 | Partially mitigated | Parallel read preparation is improved; global send queue remains coupled. |
| F-19 | Partially mitigated | Admission separated; review records are not fulfilled financial outcomes. |
| F-40 | New Low | Privileged reviewer can supply unbound actor/time/sponsor metadata. |

## 2. Scope, frozen baselines and exclusions

| Repository | Frozen source |
| --- | --- |
| xgr-interchain main | fe3d63603a09197217c57e61961f6434e39ba07f |
| xgr-node XGR3.0 / v3.5.1 | 723ff829d7380a29a116fd2f29c3b808ec073c0d |
| Prior Interchain target | 33a4e37cf48c509b83c67d8007c246ff2838c606 |
| Prior node target | a84c82737dc3ca195192a96498eab0e170f8bb5a |

The report revision is not a new node or smart-contract release. Historical baseline: audits/2026-11-06-xita-direct-bls-delta-v3.3.0. Complete change inventories contain 235 Interchain paths (222 audit-publication paths and 13 non-audit paths) and 13 Node paths. Only two Node Go files change; release workflow/notes and retirement of nine old workflows account for the remainder. No Solidity, browser, consensus, staking, genesis or Solana product change appears in this delta.

The prior register references 73 unique source dependencies: 66 retain identical Git blobs and seven change. Current source hashes and path inventories are retained. Targeted trust-boundary review and current regression execution supplement that comparison; it is not a claim to have manually audited every line of the archived repositories. Historical conclusions are explicitly inherited where no new exploit reproduction was performed.

Out of scope: productive state changes, private host shell inspection, all-chain live transfer testing, exhaustive economic solvency, compiler-equivalence proof and Solana. No operator secrets were used. Missing host evidence is not promoted into a hypothetical production vulnerability or blanket NO-GO.

## 3. Method and evidence

Source-first notes were sealed before the supplemental counterexamples completed. Review covered changed call graphs and relevant unchanged dependencies, full test-file discovery, repeated Go recovery tests, actual least-privileged PostgreSQL behavior, controlled positive/negative JavaScript probes and read-only public runtime checks. The supplemental sponsor probe appends exports only to a temporary local copy; it does not replace the scheduler/send logic. Its source authentication is a pre-satisfied fixture, explicitly not a forged on-chain source proof.

| Evidence | Fresh outcome | Interpretation |
| --- | --- | --- |
| JavaScript complete discovery | 166 / 174 files pass | Eight historical failing files; 1,035 / 1,046 TAP tests pass. |
| Node packages | 495 pass; one seed skipped | Six packages; targeted scope, not whole-node EEST. |
| F-20 repeated / faults | 5 + 10 passes | Missing/corrupt successor, write failure and restart exercised. |
| Foundry | 111 / 111, 17 suites | Fresh unchanged-contract build and targeted security tests. |
| Receipt/runtime observations | 119 / 202 verified | 83 unavailable; zero mismatches; 78 unique contracts verified at least once. |
| PostgreSQL reviewer | Normal/negative role tests | Direct INSERT attribution defect reproduced as F-40. |
| Protected Creator/sponsor | Positive and negative controls | Real source paths; external effects mocked; residuals retained. |

## 4. Deployed-code and rollout observations

At the recorded read-only snapshot, 101 documented contract receipts were tested against two configured endpoints each. There were 119 verified endpoint observations, 83 unavailable and zero demonstrated mismatches; 78 unique receipts have at least one verification and 41 have two. These figures are not 119 different contracts and are not proof of independently controlled upstreams. BSC receipt/runtime observations were unavailable through both configured readers. HTTP 403/429 or timeout does not itself establish a contract fault.

| Chain | Verified observations | Unavailable observations |
| --- | --- | --- |
| xgrchain | 58 | 0 |
| base | 25 | 11 |
| arbitrum | 18 | 18 |
| bsc | 0 | 36 |
| optimism | 18 | 18 |

RPC1 advertised xgrchain/v3.5.1/linux-amd64/go1.23.11; RPC2 advertised v3.5.0 with the same Go banner. Both returned chain ID 1643 at adjacent sampled block heights. The official v3.5.1 artifact records Go 1.23.12 and full commit 723ff829d7380a29a116fd2f29c3b808ec073c0d. Its streamed 73,288,622-byte binary SHA256 is 20b99c8946ef3f33150b566957c791fb1a15e72999ef51ac81f8af7da9211ee1 and matches the published checksum manifest. These observations qualify rollout completion, not the correctness of the F-20 source fix. Routed banners do not identify every validator process or prove that a deployed executable matches the official artifact.

The managed quote, Join and transfer-health endpoints returned HTTP 200. Join advertised public Creator availability; transfer health advertised an installed proof builder. Sponsorship advertised enabled and servicing-existing, but aggregate availability false with Base unready. This is an optional-service readiness observation at that timestamp, not evidence that core contract transfers are broken. It does not by itself attest the installed Git SHA, migration 017 or operator policy.

## 5. Separate operating decisions

### Self-funded permissionless core transfers

**CONDITIONAL GO**. No new principal-authorization, collateral-backing or message-forgery regression was demonstrated. Contract source and tracked deployment configuration are unchanged. Preserve authenticated route/asset/ISM bindings, chain-native finality, supported native-recipient restrictions, RPC-witness trust disclosure and supervised recovery/load bounds. The optional-service findings do not by themselves invalidate this core opinion.

### Node v3.5.1 F-20 source and published binary

**F-20 VERIFIED RESOLVED; rollout evidence qualified**. Exact successor payload, signer and on-disk journal checks plus file/directory fsync remove the reviewed original cause. Fresh repeated failure/restart tests pass. The official binary checksum matches its release manifest. Public RPC version observations are mixed; a version banner is not an installed-binary hash attestation and does not prove every validator was updated.

### Unrestricted unattended sponsorship

**NO-GO for an all-chain availability/outcome claim**. F-08 and F-19 retain demonstrated operational/control gaps; F-17 also remains. This is not a blanket prohibition on self-funded bridge transfers. Do not delete liabilities or wrap effectful payout in an outer timeout to manufacture availability.

### Staffed, bounded sponsorship and recovery

**CONDITIONAL on explicit operator approval**. Requires named responsibility, actual outcomes and escalation, bounded servicing, installed restricted-role controls, preserved original nonce/raw transaction, and current reserve/backlog checks. This audit does not accept a policy on the operator's behalf. Merely inserting a reviewer event neither fulfills nor waives a promise.

### Public unattended Token Creator

**NO-GO for an unattended availability claim**. F-36 is still reproducible after an admitted request reaches deployed/publication state. Correctly created tokens and their owner/mint controls were not shown compromised. Supervised operation can be bounded only with journal-preserving recovery and explicit operator handling of F-36/F-37/F-38.

### UI, onboarding and notifications

**CONDITIONAL, assessed separately**. Retain the existing F-09/F-13/F-31 transaction/claim presentation restrictions. Email or layout maintenance is not a protocol exploit. Eight existing fixture/discovery failures remain and must not be hidden behind selected green CI workflows.

## 6. Complete current finding register

| ID | Severity | Disposition | Title |
| --- | --- | --- | --- |
| F-01 | RESOLVED | VERIFIED / RESOLVED | Native system-transaction accounting and proposal validation |
| F-02 | RESOLVED | VERIFIED / RESOLVED | Transaction-original storage and refund accounting |
| F-03 | Medium | OPEN | Expensive gossip work lacks complete admission bounds |
| F-04 | Low | PARTIAL | Shared observer retry fairness and failure isolation |
| F-05 | Medium | OPEN | External source witnesses retain correlated-provider trust |
| F-06 | RESOLVED | VERIFIED / RESOLVED | Restricted-role reads and readiness omit new quote/monitor dependencies |
| F-07 | RESOLVED | VERIFIED / RESOLVED | Sponsor reservation can strand the sender nonce after interruption |
| F-08 | Medium | PARTIAL | One grant RPC failure can block all-chain sponsorship |
| F-09 | Medium | OPEN | Mailbox completion can conceal a pending native-principal claim |
| F-10 | Low | OPEN | Authorized ownership transfer can collapse service/admin separation |
| F-11 | Medium | ACCEPTED_RISK | Membership authorizations omit the exact registry deployment |
| F-12 | Low | OPEN | Minimum validator committee size remains an operating rule |
| F-13 | Low | OPEN | Wallet proof calldata is not fully bound to selected intent |
| F-14 | Low | OPEN | Regression fixtures and CI discovery drift from the current product |
| F-15 | Informational | OPEN | Production sponsorship and installation readiness remain unproven |
| F-16 | RESOLVED | VERIFIED / RESOLVED | Expiry-release evidence trusts one RPC without a canonical reread |
| F-17 | Medium | PARTIAL | Unpaid payer aliases still occupy finite sponsor admission capacity |
| F-18 | Low | OPEN | Conservative daily-limit accounting can count a liability twice |
| F-19 | Medium | PARTIAL | Paid grant lifecycle can remain unresolved after early delivery or shutdown |
| F-20 | RESOLVED | VERIFIED / RESOLVED | Pending recovery work can be removed before durable replacement |
| F-21 | Medium | OPEN | Successful incomplete discovery responses can advance durable cursors |
| F-22 | Low | PARTIAL | Admin deployment evidence uses confirmation depth as finality |
| F-23 | Low | OPEN | Orphaned deployment locks require careful manual recovery |
| F-24 | Low | OPEN | Verified paid-fee backfill still omits required event identity |
| F-25 | Low | OPEN | Dense event windows lack adaptive progress |
| F-26 | RESOLVED | VERIFIED / RESOLVED | Unknown route rows can starve background delivery refresh |
| F-27 | RESOLVED | VERIFIED / RESOLVED | Published CLI version fields are empty despite valid embedded VCS data |
| F-28 | Informational | OPEN | Compiler advisory applicability remains an assurance gap |
| F-29 | Medium | OPEN | Membership and governance submission RPC remains unbounded |
| F-30 | RESOLVED | VERIFIED / RESOLVED | Reconciliation refresh suppresses delayed-grant monitoring |
| F-31 | Low | OPEN | A failed destination receipt can retain transaction-submitted wording |
| F-32 | RESOLVED | VERIFIED / RESOLVED | Expired unverified route hints leave permanent per-message request storage |
| F-33 | RESOLVED | VERIFIED / RESOLVED | Timed-out sponsor recovery can initiate a late prepared payout |
| F-34 | Low | OPEN | Provisional spendable state diverges from recovered or current receipt evidence |
| F-35 | Low | PARTIAL | An out-of-scope record can indefinitely stall optional gas observation |
| F-36 | Medium | PARTIAL | Creator queue lacks per-item failure isolation |
| F-37 | Low | OPEN | Contact retention can remove unresolved Creator deployment evidence |
| F-38 | Low | OPEN | Creator child-token proof comparison omits canonical block identity |
| F-39 | Informational | OPEN | Mintable Creator presentation retains a no-additional-minting label |
| F-40 | Low | OPEN | Reviewer INSERT privilege permits unbound actor, time and sponsor metadata |

Severity and disposition are separate. ACCEPTED_RISK is not RESOLVED. Zero demonstrated Critical/High findings is limited to the reviewed sources and evidence, not a guarantee of absence across the entire system.

## 7. Finding-by-finding reassessment

### F-01 - Native system-transaction accounting and proposal validation

**RESOLVED | VERIFIED / RESOLVED | Validator / chain**

The relevant executor, state-transaction and proposal-validation sources remain identical to the prior audited blobs. The original accounting authorization cause remains closed on that evidence; this delta introduces no chain execution change. Original fork/accounting acceptance controls are retained.

**Evidence.** E-01; inherited original security-accounting evidence, not freshly re-exploited.

**Remediation / retained control.** Retain the original securityAccounting configuration and regression controls. No corrective product change is required for the original resolved cause.

**Frozen source.** [xgr-node/state/executor.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/state/executor.go); [xgr-node/consensus/ibft/security_accounting.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/consensus/ibft/security_accounting.go); [xgr-node/consensus/ibft/verifier.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/consensus/ibft/verifier.go); [xgr-node/consensus/ibft/ibft.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/consensus/ibft/ibft.go); [xgr-node/blockchain/security_accounting.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/blockchain/security_accounting.go)

**Limit.** The present fork test exercises possession migration, not every historical native exploit fixture or a Byzantine live-network proposal. RPC version strings do not establish each host binary hash.

### F-02 - Transaction-original storage and refund accounting

**RESOLVED | VERIFIED / RESOLVED | Validator / chain**

Original-value tracking and refund-accounting dependencies are unchanged. No change in this delta reintroduces the original cause. Historical closure is carried with explicit unchanged-source provenance rather than claimed as a new whole-EVM proof.

**Evidence.** E-01; inherited accounting regression record.

**Remediation / retained control.** Preserve original-value tracking, refund invariants and rejection tests; keep migration writes outside ordinary transaction refund semantics.

**Frozen source.** [xgr-node/state/executor.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/state/executor.go); [xgr-node/state/txn.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/state/txn.go); [xgr-node/state/state.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/state/state.go)

**Limit.** A passing package run is not a new exhaustive independent refund matrix. No regression of the originally resolved cause was demonstrated.

### F-03 - Expensive gossip work lacks complete admission bounds

**Medium | OPEN | Validator / admission**

Peer checkpoint/governance work still reaches expensive remote evidence paths before complete cheap authenticated admission, while gossip can create independent work goroutines. The F-20 storage change does not add global/per-peer work or proposal-expiry admission bounds. Existing Medium remains open.

**Evidence.** E-01, E-03; targeted gossip/checkpoint/governance source review. No production load attack.

**Remediation / retained control.** Add cheap authenticated admission/deduplication and bounded global/per-peer work before expensive remote verification, preserving complete evidence checks before signing.

**Frozen source.** [xgr-node/network/gossip.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/network/gossip.go); [xgr-node/interchain/runtime/worker.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/worker.go); [xgr-node/interchain/runtime/iln_checkpoint.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_checkpoint.go); [xgr-node/interchain/runtime/iln_quorum_request.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_quorum_request.go); [xgr-node/interchain/runtime/governance.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/governance.go)

**Limit.** No production consensus outage or principal compromise was induced. This is distinct from the now-resolved unverified per-message storage cause F-32.

### F-04 - Shared observer retry fairness and failure isolation

**Low | PARTIALLY_MITIGATED | Validator / availability**

Per-route observer isolation is improved from older baselines, but shared capacity and I/O failure constraints remain. These paths are unchanged by F-20. Repeated current tests do not establish oldest-work progress under sustained capacity saturation.

**Evidence.** E-01, E-03; observer scheduling and historical limit analysis.

**Remediation / retained control.** Isolate capacity/I/O failures per route, retain evidence on quarantine and measure oldest work; add capacity-saturation and restart fairness tests before claiming autonomous progress under overload.

**Frozen source.** [xgr-node/interchain/runtime/iln_observer_retry.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_observer_retry.go); [xgr-node/interchain/runtime/iln_observer_worker.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_observer_worker.go)

**Limit.** The narrower residual needs route-capacity pressure or persistent local I/O problems. Time-based rotation is not a proof of arbitrary-timing fairness or unlimited throughput. A durable fair-service SLA was not established.

### F-05 - External source witnesses retain correlated-provider trust

**Medium | OPEN | Validator / source trust**

External source evidence is compared as complete snapshots across distinct configured witness identities; native XGR uses its local state path. Endpoint/operator labels do not prove independent physical upstreams. The live receipt checks confirm observations, not upstream independence. No new risk acceptance is recorded.

**Evidence.** E-01, E-03, E-06; rpc_evidence_quorum and direct-signing review.

**Remediation / retained control.** Document actual upstream control, diversify witnesses and monitor disagreement. Reassess on correlated-provider discovery; do not weaken finality or invent new operator acceptance.

**Frozen source.** [xgr-node/interchain/evm/rpc_evidence_quorum.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/evm/rpc_evidence_quorum.go); [xgr-node/interchain/config.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/config.go); [xgr-node/interchain/runtime/iln_direct_signing.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_direct_signing.go)

**Limit.** No false live quorum was constructed. HTTP 403/429 observations are reachability limits, not evidence of collusion or invalid chain state. Safe L2 evidence is not represented as final L1 settlement.

### F-06 - Restricted-role reads and readiness omit new quote/monitor dependencies

**RESOLVED | VERIFIED / RESOLVED | Optional service / DB**

The original missing quote-intent and monitor role grants remain repaired in unchanged migrations. Current role and real-schema tests are positive for the exercised paths. A newly added reviewer-attribution issue is separately counted as F-40; it does not reopen the original SELECT/readiness cause.

**Evidence.** E-01, E-02, E-09; installed host roles still require operator evidence.

**Remediation / retained control.** Apply/verify the documented narrow migration during normal authorized operations and retain role-level regression tests. Do not use superuser or grant debt mutation as a workaround.

**Frozen source.** [xgr-interchain/services/managed-relay/tax-evidence.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/tax-evidence.mjs); [xgr-interchain/services/indexer/sql/011_quote_writer_runtime_grants.sql](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/sql/011_quote_writer_runtime_grants.sql); [xgr-interchain/services/managed-relay/server.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/server.mjs); [xgr-interchain/services/indexer/sql/014_sponsor_overtaken_obligations.sql](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/sql/014_sponsor_overtaken_obligations.sql); [xgr-interchain/services/managed-relay/sponsor-obligation-audit.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/sponsor-obligation-audit.mjs)

**Limit.** This verifies source/schema/role behavior in disposable PostgreSQL, not installation of the migration on every production database or a new paid quote transaction.

### F-07 - Sponsor reservation can strand the sender nonce after interruption

**RESOLVED | VERIFIED / RESOLVED | Optional service / payout**

Exact signed bytes and the reservation are still committed atomically before broadcast, retaining nonce ownership through uncertain outcomes. The fresh PostgreSQL test verifies duplicate reservation exclusion and persistence after reopening. Do not interpret this as permission to replace unknown sends.

**Evidence.** E-02; real sponsorDatabase reservation/reopen regression.

**Remediation / retained control.** Keep original transaction identity and nonce ownership through uncertainty. Investigate pre-upgrade rows under controlled reconciliation, never by blind re-signing.

**Frozen source.** [xgr-interchain/services/managed-relay/gas-sponsor.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.mjs); [xgr-interchain/services/indexer/sql/013_sponsor_prepared_tx.sql](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/sql/013_sponsor_prepared_tx.sql); [xgr-interchain/services/indexer/sql/004_sponsor_grants.sql](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/sql/004_sponsor_grants.sql)

**Limit.** No historical production orphan was resolved by this audit. Preserving a row is not proof that every old obligation has completed.

### F-08 - One grant RPC failure can block all-chain sponsorship

**Medium | PARTIALLY_MITIGATED | Optional service / liveness**

The repair provides fair source/destination candidate selection, bounded read-only preparation and parallel destination reads. However all successful send functions share a global effect promise: an unresolved broadcast still blocks another healthy destination. The controlled successful-preflight fixture reproduces this, whereas the new production tests primarily exercise non-authorizing results. Earlier serialized expiry/reconciliation and post-send reads also remain bounded-service concerns. Partial mitigation is real, complete all-chain liveness is not established.

**Evidence.** E-02 and E-08; actual scheduler/send function, mocked network and pre-authenticated fixture inputs.

**Remediation / retained control.** Keep the read/effect fence. Design independently progressing, chain-scoped transaction lifecycles and bounded transport/receipt handling while preserving exact prepared bytes and nonce ownership. Include a successful healthy payout while another broadcast is unresolved, plus process-deadline and restart tests. Never use an outer timeout to discard uncertain effects.

**Frozen source.** [xgr-interchain/services/managed-relay/gas-sponsor.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.mjs); [xgr-interchain/services/managed-relay/sponsor-event-listener.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/sponsor-event-listener.mjs); [xgr-interchain/services/managed-relay/xita-gas-sponsor.service.example](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/xita-gas-sponsor.service.example)

**Limit.** No live outage was generated. An outer timeout around an effectful callback would reintroduce the resolved late-broadcast problem and is not an acceptable fix.

### F-09 - Mailbox completion can conceal a pending native-principal claim

**Medium | OPEN | Core native delivery / UI**

The native router preserves backed pending credits when a recipient rejects bounded-gas delivery, and only the beneficiary can withdraw or redirect. Mailbox completion can still be presented as final principal receipt, and some recipient contracts cannot exercise recovery. Fresh contract tests confirm the escrow/claim safeguards, not universal recipient usability.

**Evidence.** E-01, E-05; native router and wallet/indexer presentation review.

**Remediation / retained control.** Retain the restricted code-free or separately verified claim-capable recipient policy; expose deferred native principal and the existing beneficiary-authorized recovery path explicitly.

**Frozen source.** [xgr-interchain/contracts/XETAGuardedNativeWarpRouter.sol](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/contracts/XETAGuardedNativeWarpRouter.sol); [xgr-interchain/services/indexer/transfer-index-store.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/transfer-index-store.mjs); [xgr-interchain/apps/web/transfer-status-flow.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/transfer-status-flow.js); [xgr-interchain/apps/web/transfer-token-journey.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/transfer-token-journey.js)

**Limit.** No unbacked claim or unauthorized withdrawal was demonstrated. The issue is recipient support and truthful completion, not a claim that every completed message loses funds.

### F-10 - Authorized ownership transfer can collapse service/admin separation

**Low | OPEN | Optional service contract / roles**

The authorized service-wallet and ownership transition ordering still permits the documented role separation to converge. No public unauthorized takeover is shown; the contract is unchanged and existing source tests cannot make the operating role invariant an enforced invariant.

**Evidence.** E-01, E-05; XITAExecutionGateway authority transitions.

**Remediation / retained control.** Check current and pending ownership during rotation. A future contract revision should enforce role inequality across nomination, acceptance and service-wallet changes in either order.

**Frozen source.** [xgr-interchain/contracts/XITAExecutionGateway.sol](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/contracts/XITAExecutionGateway.sol); [xgr-interchain/vendor/package.json](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/vendor/package.json)

**Limit.** The triggering actor already holds the relevant administrative authority. Ordinary token holders were not shown to gain it.

### F-11 - Membership authorizations omit the exact registry deployment

**Medium | ACCEPTED_RISK | Core validator governance**

Membership payloads still omit the exact registry deployment address. The historical bounded acceptance remains tied to one active receipt-pinned registry per stated origin/destination domain; this audit neither broadens that acceptance nor authorizes overlapping migration. Transfer messages separately bind their destination ISM/registry.

**Evidence.** E-01, E-05; unchanged membership codec and historical acceptance.

**Remediation / retained control.** Maintain a single active receipt-pinned registry per stated domain. Reopen the design before overlapping migrations and use an explicitly versioned address-bound membership domain if the invariant changes.

**Frozen source.** [xgr-interchain/contracts/XGRInterchainValidatorRegistryV3.sol](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/contracts/XGRInterchainValidatorRegistryV3.sol); [xgr-interchain/contracts/XITADirectProtocol.sol](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/contracts/XITADirectProtocol.sol); [xgr-node/interchain/config.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/config.go)

**Limit.** The audit did not prove absence of every unlisted alternative deployment, nor authorize simultaneous equivalent active registries. The pre-existing acceptance is not expanded.

### F-12 - Minimum validator committee size remains an operating rule

**Low | OPEN | Core validator governance**

The reviewed registry requires a nonempty eligible committee but does not itself enforce the economically meaningful operating minimum. Quorum arithmetic and proof-of-possession remain verified controls, not proof of sufficient independent operators.

**Evidence.** E-01, E-05; unchanged registry bootstrap and membership policy.

**Remediation / retained control.** Monitor the documented operating minimum and rotation continuity. Any hard minimum or altered governance rule needs a separately authorized design and migration decision.

**Frozen source.** [xgr-interchain/contracts/XGRInterchainValidatorRegistryV3.sol](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/contracts/XGRInterchainValidatorRegistryV3.sol)

**Limit.** Consensus migration's five proven keys must not be confused with five independent Interchain operators. Active bridge committee independence was not newly attested.

### F-13 - Wallet proof calldata is not fully bound to selected intent

**Low | OPEN | Wallet / transaction preparation**

The unchanged wallet-side process calldata path still lacks full correspondence with the specifically selected transfer intent. A valid proof cannot thereby forge arbitrary assets, but asking the wallet to submit an unintended valid message is a real user-facing integrity issue, not merely layout quality.

**Evidence.** E-01, E-02; proof-to-selected-intent source boundary.

**Remediation / retained control.** Decode the process arguments and compare the complete authenticated message identity with the selected transfer before requesting wallet submission; test substituted valid messages.

**Frozen source.** [xgr-interchain/apps/web/transfer-actions.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/transfer-actions.js); [xgr-interchain/services/indexer/transfer-recovery.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/transfer-recovery.mjs); [xgr-interchain/runtime/native-relayer/xita-direct-codec.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/runtime/native-relayer/xita-direct-codec.mjs)

**Limit.** No message forgery or principal redirection through a bad signature was demonstrated. Existing proofs and source records remain required.

### F-14 - Regression fixtures and CI discovery drift from the current product

**Low | OPEN | Cross-layer test assurance**

Independent discovery executes all 174 tracked JavaScript test files: eight files fail with 11 TAP failures, matching the previous inventory/fixture/discovery issues. Selected required workflows remain green. These stale assertions and environment assumptions do not demonstrate principal theft, but green selected CI must not be described as a complete passing suite.

**Evidence.** E-02; full results.tsv, individual logs and inherited triage reconciled.

**Remediation / retained control.** Update fixtures narrowly against authenticated current inventory/intentional behavior, retain negative security assertions and discover the full supported test set in CI. Preserve strict receipt/runtime validation when recognizing component aliases.

**Frozen source.** [xgr-interchain/.github/workflows/validate.yml](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/.github/workflows/validate.yml); [xgr-interchain/services/indexer/rpc-read.test.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/rpc-read.test.mjs); [xgr-interchain/services/managed-relay/gas-sponsor.test.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.test.mjs)

**Limit.** Tests were not edited to obtain green results. The audit distinguishes test-file exit status from individual assertions and does not add unrelated suite totals as unique exploit counts.

### F-15 - Production sponsorship and installation readiness remain unproven

**Informational | OPEN | Deployment assurance**

Fresh evidence improves release assurance: v3.5.1 download SHA matches its official manifest and public services respond. The sampled RPCs advertise different versions; both report Go 1.23.11 while the published binary manifest records Go 1.23.12. Routed banners are not host checksum attestations, so actual validator/service binary and migration identity remain qualified. Missing host evidence alone is not a protocol NO-GO.

**Evidence.** E-06; timestamped version/release/health observations and operator rollout assertion.

**Remediation / retained control.** When a concrete installed-service approval depends on it, request existing sanitized revision/role/journal-age/outcome records and installed binary hashes. Do not turn missing evidence alone into a blanket NO-GO.

**Frozen source.** [xgr-interchain/services/managed-relay/server.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/server.mjs)

**Limit.** No new Mainnet transfer or payout was requested. BSC receipt reads were unavailable from the CI vantage point. Separate node release metadata and observed client toolchain strings differ, so per-host binary identity is not established.

### F-16 - Expiry-release evidence trusts one RPC without a canonical reread

**RESOLVED | VERIFIED / RESOLVED | Optional service / quote expiry**

Canonical rereads and the configured second finalized witness remain required before expiry release on external chains. Mismatch and unavailable witness cases retain liabilities. New sponsorship scheduling does not weaken that original repaired gate.

**Evidence.** E-01, E-02; expiry witness and no-release regressions.

**Remediation / retained control.** Retain independent witness configuration, immutable liability age and canonical reread tests; monitor unresolved backlog without dropping uncertain obligations.

**Frozen source.** [xgr-interchain/services/managed-relay/gas-sponsor.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.mjs); [xgr-interchain/services/managed-relay/tax-evidence.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/tax-evidence.mjs)

**Limit.** The audit did not perform a production expiry release. Provider physical independence remains F-05 rather than reopening the eliminated single-view implementation cause.

### F-17 - Unpaid payer aliases still occupy finite sponsor admission capacity

**Medium | PARTIALLY_MITIGATED | Optional service / admission**

Payer/IP/global limits and quote-time budget reservations remain useful bounded controls, but many unpaid payer identities can still occupy finite admission capacity. The new operator admission switch is not an identity or Sybil-resistance mechanism. Existing Medium remains partially mitigated.

**Evidence.** E-01, E-02; tax-evidence admission/funding queries and sponsorAdmissionState tests.

**Remediation / retained control.** Adopt explicitly approved bounded admission and fairness controls while preserving every uncertain/paid liability. Measure saturation and recovery without adding an unrequested mandatory user signature.

**Frozen source.** [xgr-interchain/services/managed-relay/server.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/server.mjs); [xgr-interchain/services/managed-relay/tax-evidence.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/tax-evidence.mjs); [xgr-interchain/services/managed-relay/sponsor-funding.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/sponsor-funding.mjs); [xgr-interchain/services/managed-relay/gas-sponsor.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.mjs)

**Limit.** No production capacity exhaustion was attempted. A per-address limit is not an identity limit, and the audit does not invent operator acceptance of an unlimited free-admission policy.

### F-18 - Conservative daily-limit accounting can count a liability twice

**Low | OPEN | Optional service / budgeting**

The conservative budget calculation can still count economically overlapping spend and unsettled liabilities in the same window. This may reject legitimate admission; it does not establish under-collateralized token minting or an unauthorized payout.

**Evidence.** E-01, E-02; unchanged sponsor-funding and quote reservation arithmetic.

**Remediation / retained control.** Define mutually exclusive confirmed-spend and unsettled-obligation categories and test real-schema transitions/windows. Preserve uncertain obligations exactly once when changing arithmetic.

**Frozen source.** [xgr-interchain/services/managed-relay/tax-evidence.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/tax-evidence.mjs); [xgr-interchain/services/managed-relay/sponsor-funding.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/sponsor-funding.mjs)

**Limit.** No exact production overcount amount was measured; live journals were not inspected.

### F-19 - Paid grant lifecycle can remain unresolved after early delivery or shutdown

**Medium | PARTIALLY_MITIGATED | Optional service / paid outcomes**

New admission can now stop while historical grant servicing continues, and manual escalation events are retained. Neither the event ledger nor a reviewer status fulfills, compensates or waives an outstanding promise. Controlled queued-preflight execution also shows the fresh send path can act after external parent completion while waiting for the effect queue, without a final delivery reread. This refines the existing lifecycle cause rather than creating another Medium. No unattended controlled-outcome policy has been accepted on the operator's behalf.

**Evidence.** E-02, E-08, E-09; source lifecycle plus actual PostgreSQL and controlled transaction-boundary probes.

**Remediation / retained control.** Complete an explicitly approved outcome/escalation workflow with actual fulfillment evidence and accountability. Revalidate relevant current delivery/authorization state at the effect boundary without losing the original prepared transaction or creating blind replacements. Preserve liabilities during uncertainty; treat the review record as evidence, never payment. Correct F-40 metadata attribution separately.

**Frozen source.** [xgr-interchain/services/managed-relay/gas-sponsor.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.mjs); [xgr-interchain/services/managed-relay/sponsor-obligation-audit.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/sponsor-obligation-audit.mjs); [xgr-interchain/services/managed-relay/server.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/server.mjs); [xgr-interchain/services/indexer/sql/014_sponsor_overtaken_obligations.sql](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/sql/014_sponsor_overtaken_obligations.sql)

**Limit.** A staffed, explicitly approved outcome/escalation process may support a narrower operation. No such new policy was accepted on the operator's behalf. Automatic late gifts or debt deletion are not recommended.

### F-20 - Pending recovery work can be removed before durable replacement

**RESOLVED | VERIFIED / RESOLVED | Validator / durable recovery**

The retirement caller now requires an exact same-message current-set successor from the local signer in memory and on disk, rather than inferring success from a nil error. Complete payload comparison includes fee, source/destination identity, registry, gateway and ISM. Persistence synchronizes file and directory before success. New audit tests demonstrate preservation after a blocked successor write and successful restart recovery; wrong/missing/corrupt successors remain rejected. The original consume-before-success cause is closed on the frozen source.

**Evidence.** E-01, E-03, E-04. Five existing repeated cases and ten supplemental repeated test passes; no physical power-cut test or every-host attestation.

**Remediation / retained control.** Retain exact-payload and durable-journal tests. Complete ordinary host rollout verification and preserve journal data. No new fork, staking migration, contract redeployment or weakening of signing eligibility is required for this recovery patch.

**Frozen source.** [xgr-node/interchain/runtime/iln_checkpoint.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_checkpoint.go); [xgr-node/interchain/runtime/iln_storage.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_storage.go)

**Limit.** This is a refinement of the existing finding, not a new duplicate finding. Public material omits a runnable unresolved trigger sequence. Known-hash recovery can mitigate availability but does not prove atomic handoff.

### F-21 - Successful incomplete discovery responses can advance durable cursors

**Medium | OPEN | Validator / event discovery**

A successful but incomplete log response can still advance a durable discovery cursor. Full independent authentication of discovered messages prevents signing invented source activity, but it does not prove that every valid message was discovered. Known-hash recovery mitigates availability, not completeness.

**Evidence.** E-01, E-03; unchanged event scan/cursor and direct-evidence call graph.

**Remediation / retained control.** Use bounded overlapping reconciliation or independently checked completeness, retain known-hash recovery and alert on differing windows. Never weaken complete source verification to gain progress.

**Frozen source.** [xgr-node/interchain/evm/iln_multi_gateway_scan.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/evm/iln_multi_gateway_scan.go); [xgr-node/interchain/runtime/iln_observer_worker.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_observer_worker.go); [xgr-node/interchain/evm/iln_discovery.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/evm/iln_discovery.go); [xgr-node/interchain/runtime/iln_discovery.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_discovery.go)

**Limit.** No unauthorized mint is implied: missing messages affect availability and discovery. No false live response was injected into production.

### F-22 - Admin deployment evidence uses confirmation depth as finality

**Low | PARTIALLY_MITIGATED | Admin / deployment evidence**

Admin reconciliation still uses confirmation-depth acceptance on relevant paths rather than consistently applying the chain-native safe/finalized rule. Explicit finalized handling in supported cases is positive but does not close every L2 path. This is distinct from a mismatch in the live sampled immutable bytecodes.

**Evidence.** E-01, E-02, E-06; unchanged admin receipt policy.

**Remediation / retained control.** Share the chain-native safe/finalized policy across admin reconciliation, pin receipt height/hash and canonical rereads, and keep provisional depth labels distinct from final approval.

**Frozen source.** [xgr-interchain/services/admin/deployment-ledger.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/admin/deployment-ledger.mjs)

**Limit.** No presently deployed contract mismatch or invalid validator signature was demonstrated. Read-only receipt identity checks are not a proof that every admin status path uses native finality.

### F-23 - Orphaned deployment locks require careful manual recovery

**Low | OPEN | Admin / recovery**

Exclusive deployment locks are removed in ordinary finally handling, but an orphan after process termination can require manual owner/journal diagnosis. The current delta changes neither the lock ownership protocol nor safe recovery, so existing Low remains.

**Evidence.** E-01, E-02; unchanged exclusive-intent file lifecycle.

**Remediation / retained control.** Provide explicit stale-owner verification and journal-preserving recovery. Preserve exact signed bytes, nonce and hash; never delete a lock solely because it is old.

**Frozen source.** [xgr-interchain/services/admin/deployment-intents.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/admin/deployment-intents.mjs)

**Limit.** No lock was deleted or service restarted. This is bounded operational availability, not authority to discard an uncertain deployment or duplicate a nonce.

### F-24 - Verified paid-fee backfill still omits required event identity

**Low | OPEN | Optional service / projection**

The paid-fee backfill still constructs an event without the message/transaction identity required by the shared store path. This is an indexing/availability inconsistency, not an independent authorization to move collateral. The relevant source remains unchanged.

**Evidence.** E-01, E-02; transfer-index-worker caller and store input contract.

**Remediation / retained control.** Pass the verified row's message ID and source transaction hash into the stored event and add a successful-store regression with real schema constraints.

**Frozen source.** [xgr-interchain/services/indexer/transfer-index-worker.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/transfer-index-worker.mjs)

**Limit.** No fabricated verified record or stolen fee was demonstrated. The present audit does not claim a new actual-database backfill reproduction.

### F-25 - Dense event windows lack adaptive progress

**Low | OPEN | Optional service / indexing**

Dense event windows still lack a complete adaptive progress strategy under provider range/response limits. Failing closed preserves evidence but may stall progress. No delta change or new saturation proof closes this original cause.

**Evidence.** E-01, E-02; unchanged log-window/cursor handling.

**Remediation / retained control.** Split bounded ranges adaptively and define a safe dense-single-block strategy. Advance only after complete canonical processing, retaining uncertainty rather than dropping records.

**Frozen source.** [xgr-interchain/services/indexer/transfer-index.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/transfer-index.mjs); [xgr-interchain/services/indexer/transfer-index-worker.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/transfer-index-worker.mjs)

**Limit.** No dense Mainnet load was generated. The safety-preserving held cursor is preferable to silently skipping logs, but remains an availability limit.

### F-26 - Unknown route rows can starve background delivery refresh

**RESOLVED | VERIFIED / RESOLVED | Optional service / indexing**

The exact-pair filtering before the bounded delivery-refresh selection remains in place. The original unrelated-route starvation cause stays resolved; this is separate from incomplete discovery and dense-window findings.

**Evidence.** E-01, E-02; existing unrelated-row regression and unchanged repaired source.

**Remediation / retained control.** Retain exact-pair filtering before LIMIT and the unrelated-row starvation regression.

**Frozen source.** [xgr-interchain/services/indexer/transfer-index-worker.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/transfer-index-worker.mjs); [xgr-interchain/services/indexer/sql/002_transfer_operations.sql](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/sql/002_transfer_operations.sql)

**Limit.** Other provider waits and dense-window limits remain separately tracked. This closure is not an unlimited throughput guarantee.

### F-27 - Published CLI version fields are empty despite valid embedded VCS data

**RESOLVED | VERIFIED / RESOLVED | Build / provenance**

The published v3.5.1 release has explicit version, full commit, toolchain and checksum manifests; the streamed binary digest matches. The original empty CLI version-field source cause remains resolved. Mapping a particular live process to that binary is separately qualified under F-15.

**Evidence.** E-01, E-03, E-06; release workflow and actual download integrity.

**Remediation / retained control.** Maintain nonempty version/commit checks and compare actual installed executable hashes with the intended release in ordinary operations.

**Frozen source.** [xgr-node/.github/workflows/release.yml](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/.github/workflows/release.yml); [xgr-node/versioning/versioning.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/versioning/versioning.go); [xgr-node/command/version/version.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/command/version/version.go)

**Limit.** A nonempty version string is not a binary checksum. The observed Go toolchain string differs from the documented published asset toolchain; that traceability gap is explicitly retained in the companion review, without reopening the old empty-field cause.

### F-28 - Compiler advisory applicability remains an assurance gap

**Informational | OPEN | Compiler assurance**

The unchanged Solidity build uses 0.8.24 with reviewed compiler settings. Official 0.8.38-era advisories include optimizer conditions potentially relevant to older versions, but no exact affected XITA instruction sequence or deployed miscompilation was demonstrated here. A new compiler release or lint warning is not itself an exploit and does not automatically justify redeployment. Applicability/equivalence remains an Informational assurance task.

**Evidence.** E-05; official Solidity known-bug/advisory references; no completed corrected-compiler equivalence experiment.

**Remediation / retained control.** Keep this an assurance task. Qualify a specific official issue and exact trigger/settings before asserting exposure; use targeted equivalence or corrected-build evidence rather than ordering redeployment from an unverified historical claim.

**Frozen source.** [xgr-interchain/foundry.toml](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/foundry.toml); [xgr-interchain/vendor/package.json](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/vendor/package.json)

**Limit.** No project miscompilation, affected official advisory trigger or principal-loss path was demonstrated. Node staking's separately pinned Solidity 0.8.30 is a different artifact set.

### F-29 - Membership and governance submission RPC remains unbounded

**Medium | OPEN | Validator / shutdown liveness**

Legacy governance/membership submission and receipt paths still contain RPC waits not uniformly governed by the worker cancellation/deadline. Worker shutdown waits for work completion; the F-20 local journal change does not supply cancellation throughout that call graph.

**Evidence.** E-01, E-03; worker Close and legacy relayer/submit review; no production shutdown fault injection.

**Remediation / retained control.** Carry bounded contexts through preflight, submission and receipt waits; test complete Worker.Close termination while preserving original transaction and nonce identity for uncertain sends.

**Frozen source.** [xgr-node/interchain/evm/client.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/evm/client.go); [xgr-node/interchain/evm/iln_governance_submit.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/evm/iln_governance_submit.go); [xgr-node/txrelayer/txrelayer.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/txrelayer/txrelayer.go); [xgr-node/interchain/runtime/worker.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/worker.go); [xgr-node/interchain/runtime/governance_execute.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/governance_execute.go); [xgr-node/consensus/ibft/ibft.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/consensus/ibft/ibft.go)

**Limit.** No forced production provider outage or node shutdown was performed. An outer timer alone cannot safely roll back a send whose outcome is unknown.

### F-30 - Reconciliation refresh suppresses delayed-grant monitoring

**RESOLVED | VERIFIED / RESOLVED | Optional service / monitoring**

Alert aging still uses immutable creation age rather than a refreshed reconciliation heartbeat. Real-schema monitoring tests pass, retaining the original cause's closure. This is not evidence that each host actually delivers operator alerts.

**Evidence.** E-01, E-02; immutable-age monitor regression.

**Remediation / retained control.** Retain immutable-age predicates and validate installed alert delivery using existing sanitized/synthetic monitoring evidence.

**Frozen source.** [xgr-interchain/services/managed-relay/sponsor-obligation-audit.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/sponsor-obligation-audit.mjs); [xgr-interchain/services/managed-relay/gas-sponsor.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.mjs); [xgr-interchain/services/managed-relay/sponsor-obligation-audit.pg.test.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/sponsor-obligation-audit.pg.test.mjs)

**Limit.** Actual production alert delivery and aged journal contents were not inspected. Those operational checks do not reopen the resolved age-predicate defect.

### F-31 - A failed destination receipt can retain transaction-submitted wording

**Low | OPEN | Wallet / presentation**

An authenticated failed destination receipt can still leave a submitted/pending presentation rather than an explicit failed-state recovery action. This remains a user-facing state issue; the source transaction and on-chain replay protection are separate controls.

**Evidence.** E-01, E-02; unchanged receipt/status rendering.

**Remediation / retained control.** Prioritize authenticated destination failure and offer only the appropriate destination retry while preserving source transaction/message identity.

**Frozen source.** [xgr-interchain/apps/web/app.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/app.js); [xgr-interchain/apps/web/transfer-status-flow.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/transfer-status-flow.js)

**Limit.** The original source evidence should remain valid; a failed destination execution is not a reason to repeat the source lock. This is presentation/recovery guidance rather than message authorization.

### F-32 - Expired unverified route hints leave permanent per-message request storage

**RESOLVED | VERIFIED / RESOLVED | Validator / storage**

Bounded expiry cleanup for unverified unknown-route request hints remains present. Authenticated votes and attestations are outside that cleanup rule. Original permanent request-file accumulation remains resolved on the existing evidence and unchanged source.

**Evidence.** E-01, E-03; storage maintenance review and prior negative cases.

**Remediation / retained control.** Retain bounded unverified admission and age-based cleanup tests, including restart behavior and preservation of authenticated work.

**Frozen source.** [xgr-node/jsonrpc/xgr_iln_quorum.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/jsonrpc/xgr_iln_quorum.go); [xgr-node/interchain/runtime/iln_quorum_request.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_quorum_request.go); [xgr-node/interchain/runtime/iln_discovery.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_discovery.go); [xgr-node/interchain/runtime/iln_storage.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_storage.go)

**Limit.** This is not a general guarantee against every local disk exhaustion or expensive peer workload. Those broader resource boundaries remain F-03/F-04.

### F-33 - Timed-out sponsor recovery can initiate a late prepared payout

**RESOLVED | VERIFIED / RESOLVED | Optional service / replay effects**

The original late callback in prepared-transaction recovery remains fixed: timeout races only read work and a late resolution does not initiate replay. Fresh tests retain that negative control. The separate fresh-send waiting/stale-state observations are recorded under existing F-08/F-19, not used to falsely reopen or duplicate this specific original cause.

**Evidence.** E-02, E-08; zero late effects in timed-out read control.

**Remediation / retained control.** Preserve the read/effect separation and negative late-resolution tests; keep uncertain sends durable. Do not wrap effectful callbacks in a timeout race as an apparent simplification.

**Frozen source.** [xgr-interchain/services/managed-relay/gas-sponsor.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.mjs)

**Limit.** Cancellation is not rollback of a broadcast already started, and a last-read-to-mining race is not claimed eliminated. The closure addresses the original asynchronous callback that initiated a new effect after timeout.

### F-34 - Provisional spendable state diverges from recovered or current receipt evidence

**Low | OPEN | Optional service / grant state**

Provisional spendable inclusion and exact recovered grant identity still have the previously recorded divergence/reorg gaps. A one-confirmation usability indication is not final safe settlement. These paths are unchanged and remain distinct from preservation of raw signed bytes.

**Evidence.** E-01, E-02; spendable/recovery state transitions.

**Remediation / retained control.** Persist recovered transaction identity/submitted transition atomically, and downgrade disproven provisional inclusion without deleting the underlying obligation or reassigning its nonce.

**Frozen source.** [xgr-interchain/services/managed-relay/gas-sponsor.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/gas-sponsor.mjs); [xgr-interchain/services/managed-relay/server.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/server.mjs); [xgr-interchain/services/indexer/sql/015_sponsor_spendable_receipt.sql](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/sql/015_sponsor_spendable_receipt.sql); [xgr-interchain/apps/web/transfer-actions.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/transfer-actions.js)

**Limit.** Provisional spendability is distinct from final settlement. No duplicate payout or principal loss is asserted merely from a stale projection.

### F-35 - An out-of-scope record can indefinitely stall optional gas observation

**Low | PARTIALLY_MITIGATED | Optional service / gas observations**

Some out-of-scope observation cases are classified and skipped, but accepted delivery samples with missing profile/context can still prevent complete bounded progress. The new sponsor scheduler does not alter this separate observer. Existing Low remains partially mitigated.

**Evidence.** E-01, E-02; both optional observer paths and inherited failure cases.

**Remediation / retained control.** Give both optional observers bounded independent progress while retaining accepted-sample verification. Test missing profiles/unmatched operations without advancing mandatory financial cursors unsafely.

**Frozen source.** [xgr-interchain/services/indexer/gas-observer.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/gas-observer.mjs); [xgr-interchain/contracts/XETATokenFactoryV315.sol](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/contracts/XETATokenFactoryV315.sol); [xgr-node/interchain/runtime/iln_discovery.go](https://github.com/xgr-network/xgr-node/blob/723ff829d7380a29a116fd2f29c3b808ec073c0d/interchain/runtime/iln_discovery.go); [xgr-interchain/services/indexer/transfer-index.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/transfer-index.mjs); [xgr-interchain/apps/web/route-availability.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/route-availability.js); [xgr-interchain/services/managed-relay/server.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/server.mjs); [xgr-interchain/apps/web/transfer-gas-profile.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/transfer-gas-profile.js)

**Limit.** This is optional statistical sampling, separate from authenticated main transfer/debt cursors. No authorization weakening is recommended to obtain metric progress.

### F-36 - Creator queue lacks per-item failure isolation

**Medium | PARTIALLY_MITIGATED | Optional service / Creator**

UTF-8 byte parity and deterministic unsigned-queue quarantine now work. Nevertheless the earlier deployed/publication branch still processes one item before new queued work, without per-item failure isolation. Two requests accepted by real registration and email confirmation reach deployed state, then fail public-profile validation for three consecutive sweeps and block a valid sibling. The positive control advances that sibling. This is the same original per-item isolation cause, not a new finding; already-deployed token ownership/mint security was not shown compromised.

**Evidence.** E-02, E-07; actual admission/confirmation/queue/manifest code with mocked external effects.

**Remediation / retained control.** Share complete normalized metadata validation across admission and eventual public-profile generation. Add bounded per-item backoff/quarantine to the already-deployed publication path while retaining every signed transaction and verified token identity. Require valid-sibling progress after repeated publication failures and restart; never redeploy to recover a failed profile publication.

**Frozen source.** [xgr-interchain/services/onboarding/creator-registration.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/onboarding/creator-registration.mjs); [xgr-interchain/services/onboarding/creator-operator.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/onboarding/creator-operator.mjs); [xgr-interchain/contracts/XITAStarterTokenCreator.sol](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/contracts/XITAStarterTokenCreator.sol)

**Limit.** No unauthorized token ownership, minting or principal theft was demonstrated. Detailed unresolved input recipes and executable fixtures are withheld from public publication. Test-fixture removal is not a production recovery instruction.

### F-37 - Contact retention can remove unresolved Creator deployment evidence

**Low | OPEN | Optional service / Creator retention**

The unchanged contact-retention cleanup still removes an unresolved signed Creator deployment record after its retention deadline. A fresh controlled expiry test confirms removal. Personal-contact retention and minimal durable transaction recovery need distinct lifetimes; this finding does not imply a new on-chain mint permission.

**Evidence.** E-01, E-07; isolated filesystem expiry reproduction.

**Remediation / retained control.** Separate contact/PII retention from immutable unresolved deployment evidence. Purge recovery state only after authenticated terminal completion and retain minimal nonpersonal identity until then.

**Frozen source.** [xgr-interchain/services/onboarding/private-store.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/onboarding/private-store.mjs); [xgr-interchain/services/onboarding/creator-operator.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/onboarding/creator-operator.mjs)

**Limit.** The default long retention period is a material prerequisite. No real production record was removed, and no duplicate send or nonce reuse was demonstrated.

### F-38 - Creator child-token proof comparison omits canonical block identity

**Low | OPEN | Optional service / Creator provenance**

The current two-provider Creator child proof compares a projection that omits the creation block hash. Controlled internally consistent responses at one height with different block hashes are accepted. Owner/supply/feature checks remain intact; the missing canonical block identity prevents treating the comparison as independent canonical provenance.

**Evidence.** E-01, E-10; actual verifier, controlled RPC views, zero real network writes.

**Remediation / retained control.** Compare chain, block height and block hash in the verified child proof and require canonical numbered-block rereads before promotion. Retain all token feature/runtime checks.

**Frozen source.** [xgr-interchain/services/onboarding/creator-chain-proof.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/onboarding/creator-chain-proof.mjs)

**Limit.** No fabricated token or unauthorized owner was demonstrated. Two endpoints are still not a cryptographic light client or proof of infrastructure independence.

### F-39 - Mintable Creator presentation retains a no-additional-minting label

**Informational | OPEN | UI / Creator labels**

The mintable Creator summary retains the no-additional-minting wording in an unchanged presentation branch. Contract configuration and project-only mint authority are separate and pass existing tests. This remains Informational, not a bridge custody vulnerability.

**Evidence.** E-01, E-02, E-05; unchanged UI wording and Creator contract feature tests.

**Remediation / retained control.** Derive the summary label from the validated token type and render every fixed/burnable/mintable variant in regression tests.

**Frozen source.** [xgr-interchain/apps/web/token-creator.js](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/apps/web/token-creator.js)

**Limit.** Owner/minter controls and lifetime cap tests pass. No unauthorized mint was demonstrated.

### F-40 - Reviewer INSERT privilege permits unbound actor, time and sponsor metadata

**Low | OPEN | Optional service / operator traceability**

The actual restricted database role can insert an escalation attributed to another operator, a historical timestamp and a different sponsor while referencing a real grant key. The public/manual CLI validates its parameters, but direct use of the same granted database authority bypasses those application-only bindings. UPDATE and private-column reads remain denied. This is a new privileged traceability defect; no payout, signed transaction mutation or bridge asset theft was demonstrated.

**Evidence.** E-09: reviewer-role.json and isolated PostgreSQL probe on migration 017.

**Remediation / retained control.** Restrict INSERT columns and enforce actor/time at the database boundary, with immutable sponsor binding to the referenced obligation. A narrow audited procedure or trigger can assign trusted session identity/time. Test direct SQL by the actual least-privileged role; do not broaden grant/payment privileges.

**Frozen source.** [xgr-interchain/services/indexer/sql/017_sponsor_obligation_reviews.sql](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/indexer/sql/017_sponsor_obligation_reviews.sql); [xgr-interchain/services/managed-relay/sponsor-obligation-review.mjs](https://github.com/xgr-network/xgr-interchain/blob/fe3d63603a09197217c57e61961f6434e39ba07f/services/managed-relay/sponsor-obligation-review.mjs)

**Limit.** Requires the designated reviewer database authority; not a demonstrated unauthenticated public attack. Financial obligations remain present and the role cannot settle or pay them.

## 8. Priority and acceptance criteria

First address the demonstrated post-deployment Creator isolation residual (F-36) without redeployment; then sponsor effect liveness and current-state/outcome controls (F-08/F-19). Correct the small privileged metadata integrity gap (F-40), retain the F-20 fix, reconcile actual node rollout banners and fix the eight stale tests without weakening security assertions. These are targeted maintenance tasks, not a need for Solana or a redesign of immutable bridge contracts.

A closure retest must exercise successful and failed paths under the actual trust boundary. For Creator, show a healthy request advancing past repeated post-deployment metadata/publication errors without a second token deployment. For sponsorship, prove another destination advances while a prior send is unresolved, preserving raw transaction and nonce identity, and prove delayed fresh preflights cannot bypass current delivery policy. For reviewer history, use direct SQL under the real restricted role, not only the CLI. Preserve all paid and uncertain liabilities.

Separate an explicitly staffed operating mode from a claim of complete unattended availability. The core protocol can remain feature-frozen while these narrow application/runtime maintenance items are addressed; this report does not justify a blanket claim that every optional service is finished. No Solana extension is required to repair these causes.

## 9. Evidence index and reproducibility

**E-01.** Frozen Git archives and complete diff inventories from run 43696416777; exact commit/tree and archive hashes retained. Interchain: 235 changed paths, 13 non-audit paths. Node: 13 changed paths, only two Go files. Relevant prior source references: 73 unique files, 66 identical Git blobs and seven changed.

**E-02.** Complete file discovery on frozen Interchain in run 43696812308: 174 test files; 166 pass and eight fail; TAP aggregate 1,046 tests, 1,035 pass, 11 fail, zero skipped/cancelled. The eight failing files are the same historical fixture/discovery issues. An initial harness aborted at the first failure; the corrected run explicitly captured all results. Its continue-on-error is evidence collection, not a full-suite pass.

**E-03.** Fresh frozen-node test run 43696416777: 495 passing test events, one skipped fuzz seed, zero failing test events, six nonempty packages. Five separate repetitions of the existing F-20 journal test pass. This is not the full consensus/EEST suite or a replay of every historical exploit.

**E-04.** Supplemental run 43696812308: five repetitions each of the existing F-20 test and an audit-added blocked-file-write/restart test, ten passes total. Original evidence remains after failed successor write; recovered successor survives old-vote retirement. This exercises logical write failure and restart, not physical power loss or every filesystem failure mode.

**E-05.** Fresh Foundry run 43696812357, job 132759080254, synthetic audit merge 835864e7e228bdb10b1854757da120efdcd337b6 with unchanged product sources: 111 tests across 17 suites pass, zero fail/skip. Foundry 1.9.0, Solidity 0.8.24, 82-source import closure; constructor/sealed-build and runtime/initcode eligibility checks pass.

**E-06.** Read-only production snapshot 2026-11-15T08:56:28.945Z to 08:56:37.063Z. 101 recorded contracts x two configured endpoints = 202 observations: 119 verified, 83 unavailable, zero mismatches. 78 unique receipts have at least one verification, 41 both. rpc1 advertises v3.5.1; rpc2 v3.5.0. Official release binary SHA256 matches the published manifest. Managed/Join/transfer health respond HTTP 200, but sponsorship aggregate availability is false with Base unready. No production write was sent.

**E-07.** Local Node v22.16.0 controlled Creator executions use real admission, email confirmation, queue and manifest validation with mocked mail/RPC/signature/publisher boundaries. Positive control advances a healthy sibling. Two admitted metadata-boundary variants reach deployed state then block three consecutive sweeps and leave a healthy sibling queued. Oversized UTF-8 name now rejects. A separate expired-contact-retention case deletes an unresolved signed record. Zero real sends.

**E-08.** Local export-only instrumentation of the exact frozen gas-sponsor module exercises the actual scheduler, local signer and send function with pre-authenticated fixture preflights and mocked DB/network. A stalled first destination broadcast blocks a healthy second effect beyond four read deadlines although both preflights finish. The second effect can start after its fixture parent completes externally while queued; the fresh-send path has no final delivery reread. A timed-out-read negative control still produces zero late sends. This is not an end-to-end source-authentication bypass or mainnet attack.

**E-09.** Actual isolated PostgreSQL 16 reviewer role: normal CLI succeeds; UPDATE and private recipient-column SELECT fail with 42501. Direct table INSERT nevertheless accepts a different sponsor, arbitrary reviewer identity and historical recorded_at for an existing grant key. The underlying obligation remains present; no grant/payment mutation is authorized.

**E-10.** Local controlled Creator proof test invokes the actual two-RPC verifier with internally consistent but mutually different creation-block hashes at the same height. Normalized comparison accepts both because canonical block identity is omitted. This re-verifies existing F-38; no token-ownership or supply-check bypass is asserted. Zero real RPC calls.

Runnable unresolved metadata/proof fixtures are delivered separately in an operator archive, not placed in the public repository. Public hashes and execution summaries bind the retained originals. Third-party independent rerun access is not claimed without that archive. The scripts use only synthetic identities and mocked external effects.

## 10. Assurance limits and references

The official bytecode receipts and release hashes are independent read-only observations. Production host checksum, full validator inventory, actual restricted database installation and an accepted staffed-outcome policy remain separate evidence. No live impairment or payment was induced. The code review is AI-assisted and shares context with earlier development; the retained executions support findings but are not an external firm certificate.

Official PostgreSQL documentation distinguishes defaults from constraints and permits table-level INSERT to supply columns. That supports the interpretation of the actual F-40 role reproduction. Official Solidity advisories guide F-28 applicability review; no unproven advisory exposure is asserted as a deployed exploit.

[PostgreSQL 16 GRANT: table and column INSERT privileges](https://www.postgresql.org/docs/16/sql-grant.html)

[PostgreSQL 16 default values: defaults do not constrain explicitly supplied values](https://www.postgresql.org/docs/16/ddl-default.html)

[Solidity 0.8.38 release and known optimizer issue context](https://www.soliditylang.org/blog/2026/10/22/solidity-0.8.38-release-announcement/)

[Solidity Yul optimizer knowledge-base stale-bookkeeping advisory](https://www.soliditylang.org/blog/2026/10/22/yul-optimizer-knowledge-base-stale-bookkeeping-bug/)
