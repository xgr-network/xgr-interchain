# XITA V1 - targeted PR #419 closure addendum

**Audit revision 3.4.1 | 15 November 2026 | Node remains v3.5.1**

This is a targeted follow-up to the published v3.4.0 delta audit, not another whole-system audit or a software release. The prior report and historical finding rows remain unchanged. AI-assisted reassessment with prior implementation context; not a blind review or independent audit-firm certificate.

## 1. Decision summary

Two original causes can be closed in the reviewed source/schema: **F-36 and F-40**. The specific fresh-send serialization defect in F-08 is fixed, but the same cross-chain blocking cause survives in stored-transaction recovery. F-19 remains partially mitigated. No new finding ID is introduced, and no Critical/High issue was demonstrated in this narrow review.

| Finding | Source-level disposition | Production/operating qualification |
| --- | --- | --- |
| F-36 | VERIFIED RESOLVED | Original per-item validation/publication blocking cause. Broader Creator risks are not waived. |
| F-40 | VERIFIED RESOLVED | Requires migration 018 and its grants on the real database. Production installation was not independently inspected. |
| F-08 | PARTIALLY MITIGATED | Fresh sends progress by chain; an unresolved stored-transaction replay still delays later chains and fresh work. |
| F-19 | PARTIALLY MITIGATED | Review history is not fulfillment. Outcome policy and current-state handling remain incomplete. |
| F-20 | Prior closure retained | Node source is unchanged; no new node version or re-release is required by PR #419. |

The user reported deployment. That is retained as an operator assertion, not silently upgraded to a per-host binary, service or database attestation. Missing production database access is an evidence limit, not a new vulnerability or a blanket NO-GO for the bridge.

## 2. Frozen scope and method

| Reference | Exact revision |
| --- | --- |
| Interchain after PR #419 | 6e78cadc631fcdff8605ea0428965e7b911076cd |
| Interchain tree | 89fdf0ccf5aee01102f55733130e4f64931c35af |
| Published audit baseline | 233d1b357e1f949ea79647e9b0a852787f2a7e0e |
| Prior tested product source | fe3d63603a09197217c57e61961f6434e39ba07f |
| Unchanged XGR node / v3.5.1 | 723ff829d7380a29a116fd2f29c3b808ec073c0d |

The remediation changes eleven paths, all under optional services and their tests/migration/runbook. There is no change to Solidity contracts, tracked chain/deployment configuration or browser source. The archived source was checked against all **1,327 tracked Git blobs**, with zero mismatches. Node branch identity was separately read through GitHub; this review did not re-run a whole-node audit.

Fresh evidence comprises eleven affected test files, an independently written PostgreSQL migration replay, replay of the prior protected counterexamples on the old source, and new A/B probes against the exact current source. Local probes use Node 22.16.0; CI records Node 24.22.2. Dependencies are captured with the CI artifact rather than claimed to be byte-identical across environments.

All wallets, mail delivery, GitHub publication and chain RPC in adversarial probes are fixtures. The sponsor probe exports private helpers only in a temporary copy; scheduler, signature checks, reservation ordering and replay logic are not replaced. The authenticated source preflight is a pre-satisfied fixture, not a demonstrated forged chain proof. PostgreSQL runs in an explicitly allowlisted, disposable loopback database. No production payments, contracts, keys, services or databases were changed.

## 3. F-36 - original Creator isolation cause closed

The original accepted-input counterexamples were reproduced on the pre-PR419 source. The current admission code now rejects the same public-contact and category-normalization cases before confirmation/signing; a public-link variant was also rejected. This aligns the admission and eventual publication boundary for the reviewed cases.

More importantly, already-admitted historical records were tested through the current worker. A bad record reached verified-deployed state, failed profile publication, entered bounded backoff and then quarantine, while a valid sibling advanced to its own signed deployment. Original transaction hash, token address and verified proof were retained. Repeated worker invocations did not redeploy that token. An ambiguous remote publication result entered `needs-review`; only one remote attempt occurred, and valid sibling work still advanced.

**Closure basis:** the demonstrated malformed-item/publication cause no longer monopolizes the worker. This does not remove the deliberate hold on an unresolved signed deployment nonce, or guarantee operation when shared infrastructure is unavailable. Existing F-37 retention and F-38 provenance findings remain separate and inherited.

Source anchors: `creator-registration.mjs:36-67`; `creator-manifests.mjs:14-31`; `creator-operator.mjs:182-236`. Evidence: E-01, E-02 and protected operator packet.

## 4. F-40 - database attribution cause closed with migration 018

The independent PostgreSQL probe first restored the old migration-017 permission boundary in the disposable database. Its real restricted reviewer role reproduced the original forged actor/time/sponsor INSERT. Applying the exact migration 018 then blocked that INSERT with SQLSTATE 42501.

Normal CLI insertion still succeeded. The saved sponsor came from the referenced immutable obligation; reviewer was the executing PostgreSQL role; time came from the database clock. UPDATE, DELETE and access to private grant columns remained denied. A wrong-sponsor CLI attempt and an unknown-obligation direct INSERT were rejected. The existing liability and historical review rows remained intact.

**Closure basis:** column-scoped INSERT and the trigger enforce the original metadata bindings. This is attribution to the database role, not proof of a named human's identity. It does not protect against a superuser deliberately replacing the schema.

**Deployment qualification:** migration 018 and effective role grants were tested in disposable PostgreSQL, not read back from the production host. A general deployment assertion is not proof of that specific schema state. Source/schema closure is recorded without claiming production verification.

Source anchors: `018_sponsor_review_attribution.sql:5-40`; `sponsor-obligation-review.mjs:15-34`. Evidence: E-01 and E-03.

## 5. F-08 - fresh path fixed, stored-payment recovery still serial

The original fresh-send counterexample no longer succeeds: an Arbitrum payout began while another chain's broadcast remained unresolved. Both signed hashes matched the exact durably reserved records. A separate same-chain control showed that the second read/send waited for the first effect, and a timed-out read produced no late send.

The broader existing F-08 criterion is not yet met. `reconcileSponsorGrants` still iterates stored rows serially and awaits `broadcastTransaction(row.raw_tx)` inside that loop. `runSponsorSweep` awaits this reconciliation before calling the repaired fresh scheduler.

A controlled recovery probe used actual signed fixture transactions and the real reconciliation function. While the first chain's permitted exact-byte rebroadcast was held, the healthy second chain received **no receipt read and no replay**, even after six configured read-deadline intervals. Releasing the first broadcast allowed both rows to progress; original bytes and hashes were unchanged. This is delayed cross-chain recovery, not demonstrated principal theft or an observed production outage.

This is the same historical liveness cause in another explicitly in-scope stage, **not a new Medium finding or an added acceptance criterion**. The prior v3.4.0 remediation already required independently progressing chain-scoped lifecycles, recovery and process-deadline coverage. A read timeout cannot cancel a broadcast that has already started. The one-shot service's 120-second process limit is an operational bound, not evidence of independent recovery; the notification listener waits for its child to exit.

**Remaining closure requirement:** isolate recovery/rebroadcast by chain as well as fresh sends, preserve immutable bytes and nonce ownership, and test healthy recovery/fresh progress while another replay is unresolved. Do not race-and-forget effectful callbacks or re-sign uncertain payments to manufacture liveness.

Source anchors: `gas-sponsor.mjs:538-640` (especially 565 and 586), `814-864`, `911-920`; `sponsor-event-listener.mjs:13-29`; service timeout declaration. Evidence: E-02. F-08 remains **PARTIALLY MITIGATED**.

## 6. F-19 - unchanged technical and outcome limitations

PR #419 does not add a fulfillment/compensation mechanism or an approved outcome policy. The admission switch continues to distinguish new promises from old servicing, and obligations remain recorded. The repaired reviewer metadata improves evidence quality but neither pays, fulfills nor waives an outstanding promise.

The current `sendFreshSponsorCandidate` still awaits signing and durable reservation before broadcast without another current-delivery observation. In a controlled pre-authenticated fixture, external completion during that reservation was followed by a fresh broadcast. This does not show a forged source proof or theft; it confirms that the previously documented lifecycle/current-state issue was not removed merely by changing the fresh scheduler.

Absolute cross-chain atomicity is not claimed or required. The required control is an explicitly defined, testable outcome for a promise overtaken by external completion, with an appropriate last-current-state gate and preservation of every uncertain signed transaction. Whether to fulfill, compensate or handle that promise in another authorized way is an operator policy decision, not something this audit may invent.

No explicit new compensation/outcome approval or production obligation-ledger inspection was supplied in the reviewed evidence. **F-19 remains PARTIALLY MITIGATED**, not merely a missing signature on a form. F-17 and other inherited sponsorship limits are unchanged.

## 7. Scoped operating decisions

| Surface | Decision after this addendum |
| --- | --- |
| Self-funded permissionless core transfers | Prior CONDITIONAL GO retained. No new contract/config/browser change; previous finality, RPC trust, recipient and recovery bounds still apply. |
| Node v3.5.1 / F-20 | Prior verified source closure retained; no new release required. No fresh all-validator installation attestation is claimed. |
| Creator per-item isolation | F-36 no longer supplies the old blocker. This is not blanket unattended approval while F-37/F-38 remain inherited. |
| Reviewer traceability | F-40 source/schema cause closed; production readiness still depends on actual migration 018 and restricted role grants. |
| Unrestricted unattended sponsorship | No full all-chain availability/outcome approval while F-08, F-19 and inherited F-17 remain. |
| Staffed, bounded services / UI | Separate conditional assessment; no operator risk acceptance is invented. UI/email maintenance is not a contract exploit. |

**Roll-forward register arithmetic only:** 40 unique causes remain: 9 Medium, 15 Low, 3 Informational and 13 resolved at source/schema level. Previously: 10 / 16 / 3 / 11. Only F-36 and F-40 change disposition here. F-11 remains a previously accepted Medium; all non-targeted findings are inherited, not freshly re-audited or silently downgraded.

## 8. Evidence, limits and publication

E-01: fresh isolated CI run **43738410591**, source artifact **14170887571**. All eleven affected test files pass: **83 TAP tests, 83 pass, zero fail**. The separate reviewer replay also passes. Artifact SHA256: `b14d28195128cef8fb97445f430f746ea260b27057328951ca6a13365fd9c1fb`.

E-02: protected local baseline/current Creator and sponsor probes, plus sanitized result JSON and source hash verification. Positive controls reproduce the earlier defects; current controls exercise real scheduler/signature/recovery code with mocked external effects. Detailed unresolved input fixtures are supplied only in the operator packet, with a public checksum reference.

E-03: independent database replay from migration 017 to 018 under the actual least-privileged role. The executable probe and output are retained with the public evidence because the original attribution defect is closed in the reviewed schema.

Two initial audit-harness failures are disclosed, not product failures: the first collector used a database name rejected by the fixture's safety guard; the next standalone probe imported the CommonJS PostgreSQL client incorrectly. Both were corrected without changing product source. The final run passes. The earlier v3.4.0 finding about eight broader historical test-file failures is inherited; this targeted eleven-file run does not claim the complete product suite is green.

No fresh multi-chain live-transfer or full deployed-bytecode census was performed. This addendum does not replace prior protocol evidence. Production migration inspection remains a precise evidence request, not an assumed failure. All previous audit files stay unchanged, and no production operation is part of this publication.

### Source and execution references

- Frozen source: https://github.com/xgr-network/xgr-interchain/tree/6e78cadc631fcdff8605ea0428965e7b911076cd
- Remediation: https://github.com/xgr-network/xgr-interchain/pull/419
- Fresh evidence run: https://github.com/xgr-network/xgr-interchain/actions/runs/43738410591
- Prior report: `audits/2026-11-15-xita-v1-delta-v3.4.0/report.md`
- This publication: https://github.com/xgr-network/xgr-interchain/pull/420
