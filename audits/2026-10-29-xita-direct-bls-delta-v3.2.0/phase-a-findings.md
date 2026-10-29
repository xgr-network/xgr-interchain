# Phase A - independently completed security delta assessment

Audit ID: `XITA-DBLS-2026-10-29-v3.2.0`. Phase A was completed before reading the historical finding registers or reports in detail. The source freeze is recorded in `scope-and-baselines.json`.

## Independent candidate register

| Phase A ID | Severity | Confidence | Finding and evidence |
|---|---|---|---|
| A-01 | Medium | High | New queries lack the documented least-privilege role grants: quote admission and overtaken-obligation monitoring. Real PostgreSQL 42501 reproductions; quote A-Q1 and sponsor A-SP-04 are one migration/readiness regression, not duplicate findings. |
| A-02 | Medium | High | Timeout does not cancel prepared-payout broadcast; delayed callback can send after completed delivery. Sponsor A-SP-01. |
| A-03 | Low | High | Provisional spendable state is sticky after lost canonical evidence and incompletely restored from a prepared reserved grant. Sponsor A-SP-02, including its A-SP-03 subcase. |
| A-04 | Low | High | One valid but permanently uncatalogued shared-Mailbox event stalls the gas learner cursor. Quote A-Q2; protocol reachability confirmed. |

These are independent candidates, not predetermined final historical IDs. Two other observations are retained without asserting an unmeasured exploit: validator-set workload is absent from the learned gas key, and an unchanged RPC test contains contradictory block-pinned-call expectations. No new Critical/High code defect was demonstrated during Phase A.

The following four workstream records are the complete independent analyses. Reproduction files, logs and provenance are committed in the final evidence archive; their Phase A identities are sealed by the accompanying freeze record.



---

# Phase A - independent integration and frontend assessment

Audit ID: XITA-DBLS-2026-10-29-v3.2.0. Frozen Interchain revision: `5cfc095d0f02271427832ee6bbb268322f38ae2d`; baseline: `26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3`. Node frozen and baseline revision: `51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671`.

## Independence and scope

The independent tracks were assigned after both repository identities, ancestry, complete endpoint diffs and all 62 reachable Interchain commits had been frozen. Only the previous audit's source-freeze metadata was read for baseline verification. Detailed previous finding registers, reports, conclusions and evidence were not consulted. The supplied brief already disclosed selected IDs and priorities; this exposure is acknowledged. Historical audit files newly introduced in the delta were inventoried and their identities retained, with substantive archival review deferred to Phase B to preserve the requested ordering. No additional development repository was accessed.

The complete endpoint diff covers 48 Interchain files: seven frontend files; twenty service, migration and service-test files; and twenty-one historical audit/index artifacts. The union of paths touched by individual commits is the same 48 paths, so no reverted/transient-only source path is missing. Three of the 62 commits are merges. Node has zero delta. Current contracts, deployments, CI workflows and dependency manifests are unchanged; evidence in the protocol track establishes immutable file identities and release/source relationships.

## Changed frontend execution path

`apps/web/transfer-actions.js:282-341` adds an optional unsigned preview before the source transaction. The preview can change the estimated destination gas floor, but it cannot change the actual Gateway, recipient, principal or EIP-712 signature. Stage names, known chain names, decimal gas units and the 21,000-to-5,000,000 envelope are checked. Failure falls back to 1.2 million units. The preview is recalculated independently by the later signed quote. The source operation continues through route enrollment checks, Gateway bindings, wallet-account and chain checks, current allowance verification, signed quote validation, source simulation and real wallet gas affordability. The new preview introduces no new wallet signature.

`apps/web/transfer-sponsor-evidence.js:5-12` accepts `spendable` for a positive committed sponsorship. The surrounding `app.js:535-573` path first reads wallet-specific source evidence and requires the exact account/source transaction/message identity and immutable grant counts. A zero-grant quote has a separate exact-binding check. Unknown responses fail closed. The map and status changes at `app.js:495-532` reset state across identities and make no claim that one grant completes a multi-stage commitment.

`apps/web/transfer-status-flow.js:256-269` renders spendable inclusion separately from safe finality. This accurately describes the intended state but relies on the backend projection being current. Sponsor track A-SP-02 demonstrates that the projection can remain stale after receipt disappearance and remain stuck at reserved after crash recovery. These are state and availability defects, not evidence that a user can be made to sign an unaffordable or principal-redirecting transfer. `transfer-actions.js:694-708` independently checks Mailbox replay state, simulates `process`, estimates current gas, reads current wallet native balance, and performs the affordability check before `eth_sendTransaction`.

`apps/web/transfer-gas-profile.js:14-55` binds gas profiles to chain, stage, representation roles, operation, executor bytecode and router bytecode. Arithmetic is integer-based and rounds upward; the overall modeled multiplier decreases from 2.0 at one sample to 1.3 at twenty samples. The value is a gas estimate, not a protocol guarantee. The quote/protocol tracks assess finalized measurement provenance, cursor liveness and variable verifier work under an unchanged profile. No source-principal authorization is delegated to these learned values.

## Source and test verification

Root executed 33 independent test-file processes against the frozen Interchain source. Their output contains 264 tests: 263 passing, one failing, zero skipped. This includes the existing real PostgreSQL sponsor-obligation suite (12/12), transfer-actions (30/30), transfer-status-flow (31/31), quote/fee binding, exact Direct-BLS codec, receipt/finality, transfer recovery and wallet nonce tests. Agent test runs are separate and must not be inferred from these counts. Per-process metadata records command, timestamp, commit, Node version, exit status and SHA-256 of the output. PostgreSQL is disposable localhost-only 16.15; Node is v24.22.1; ethers 6.13.4 and pg 8.16.3 match repository pins.

### A-R-01: pre-existing contradictory RPC test expectation (verification observation)

`services/indexer/rpc-read.test.mjs:37-52` expects a block-pinned `eth_call` at numeric block 0x1 to be rejected. The same suite's final test explicitly expects block-pinned calls to succeed, and `rpc-read.mjs:42-50` permits bounded numeric-block reads for source/finality recovery. The failed test is therefore a contradictory test assertion. Git blob identities of both source and test are identical at the baseline and frozen HEAD, recorded in `rpc-read-test-triage.json`. The other nine tests in that suite pass. This is disclosed as a pre-existing validation-quality issue; it is not used as proof of a new protocol vulnerability or a NO-GO. No product test was changed to conceal the failure.

## Independent integration conclusions

No new Principal authorization bypass, BLS message forgery, uncontrolled token mint, signature-domain regression, extra sponsorship wallet signature or sponsorship of user-funded native principal was demonstrated by this delta review. This statement is limited to the changed paths and their inspected dependencies; it is not a blanket claim of system security. The sponsor and quote tracks provide independent, reproducible findings for the newly changed service behavior. Their findings are deliberately not yet mapped to historical IDs.

Production findings remain distinct from source findings: successful public RPC and deployment observations are evidence of the endpoints observed, not binary attestations for every host. Conversely a denied supplementary read is only a verification limitation. No productive transfer, payout, wallet signature, deployment, production database write, obligation release or service change was performed.

## Read-only public service observation

At 2026-10-29T08:55:03Z the public GET /api/xita/v1/managed/health returned HTTP 200, paidQuoteReady=true and sponsorship enabled/available on all three listed chains. This shows the observed endpoint health response, not successful quote issuance or proof that the newly required SELECT privileges exist; the independent least-privilege reproduction demonstrates that the health probe omits those checks. No signed quote was requested and no new production reservation was created. The raw public JSON is retained in root/public-sponsor-health.json.

## Evidence map

- `source/scope-and-baselines.json`, complete endpoint/per-commit patches, commit list and per-file inventory.
- `root/coverage.json`, seven changed frontend paths with individual review reasons.
- `root/test-logs/`, `root/test-summary.json`, `root/environment.json`, `root/rpc-read-test-triage.json`.
- `sponsor/phase-a.md`, `quote/phase-a.md`, `protocol/phase-a.md` for independent component reviews and new candidates.

This phase record is to be frozen before the detailed historical finding reconciliation begins.


---

# Phase A: independent sponsor-worker and obligation review

Audit: `XITA-DBLS-2026-10-29-v3.2.0`.

Source: `xgr-network/xgr-interchain`, frozen commit `5cfc095d0f02271427832ee6bbb268322f38ae2d`; baseline `26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3`.

## Scope and independence

This workstream inspected the entire final implementations of `gas-sponsor.mjs`, `sponsor-obligation-audit.mjs`, the three new sponsorship migrations (013, 014, 015), their changed unit and PostgreSQL tests, and the changed sponsor-status test. It also read the unchanged grant/commitment/resolution schemas, the wallet source-verification and finality helpers, the quote-budget caller, the public sponsorship view, and the worker service lifecycle. The per-commit sponsor implementation diff was read in addition to the net baseline diff. `coverage.json` records paths and hashes.

No historical report, historical finding CSV, or historical evidence archive was read to determine these Phase A observations. The user brief, source comments, test names, and operator documentation expose some historical identifiers; this unavoidable exposure is declared rather than presented as a blind assessment. Identifiers below are temporary workstream IDs, not final historical mappings. Root must de-duplicate after Phase A is hashed.

Only local source, mock-provider tests, and disposable-database tests are used in this workstream. No production transaction, production wallet signature, service restart, database mutation, or contract deployment was performed. Ephemeral signing keys in local tests are generated at runtime; logs contain neither private keys nor signed transaction bytes.

## Validated design properties

### Payment authorization and principal separation

`sponsorStage` (lines 29-42) rejects missing payer, message, paid-fee identity, amount, stage or `delivered !== false`. The first hop, hub continuation, and final delivery are derived from the original first-source operation. The worker does not create another user transaction. `checkCandidate` (125-159) independently rehydrates the original source receipt through `findWalletSourceTx`; the latter binds the sender, documented gateway/adapter, unique operation and Dispatch events, paid fee event, and chain-native source finality before returning a confirmed operation (`apps/web/wallet-transfers.js:298-411`). The candidate must still be awaiting delivery, and payer/recipient/final recipient are constrained to the original account. Two-hop stages additionally require the immutable onward route and unused hub parent.

The initial candidate verifies the current adapter fee beneficiary against the configured signer (`gas-sponsor.mjs:216-220`). The amount comes from the durable quoted promise, not a later wallet balance or a recomputed destination amount (`227-232`). `verifiedCommittedGrant` binds nonce, fee, route, asset, amount and destinations to that promise (`63-80`). The isolated unit suite rejects altered nonce, route, amount, account and fee.

The gas-only estimator bounds the allowed contribution and explicitly excludes the user's own native principal (`44-61`). The quote workstream must verify the actual quote-generation path using the same economic assumptions; this worker proof is not a substitute for that separate check.

### Atomic reservation and same-transaction recovery

The worker now populates and locally signs the payout, then checks recovered sender, recipient, value, nonce, chain ID and gas limit before database admission (`252-266`). No network broadcast precedes the database commit. A stale source comment at 268 says reservation occurs before signing; actual sequencing is signing, durable reservation, then broadcast. Local signing itself has no on-chain effect.

`reserveGrant` verifies the raw-byte hash and transaction fields, locks the sponsor/chain and shared quote-budget domain, inserts the grant and prepared bytes within one PostgreSQL transaction, and rolls back both on any error (`330-370`). The existing grant schema uniquely constrains `(chain_name, sponsor_address, wallet_nonce)` and the grant key; migration 013 uniquely constrains the prepared hash and restricts deletion through its foreign key. The transaction's amount, target and nonce cannot be changed by restart reconciliation without failing the recovered signature/hash/row comparisons (`460-471`). Subsequent broadcasts use those identical bytes. This is a substantial improvement over persisting a nonce without a recoverable transaction.

A broadcast error is recorded while preserving the recoverable grant (`296-299`, `372-375`). Successful source receipt observation and a currently undelivered canonical destination are rechecked before a prepared transaction is replayed (`437-458`, `473-489`). A consumed latest nonce results in `needs-review`, not a newly signed replacement. However, the authorization deadline and effect boundary are defective as described in A-SP-01.

### Receipt identity and provisional usability

`verifiedSponsorInclusion` verifies the exact hash, success status, block number and current canonical block hash (`163-177`). This supports provisional gas usability without declaring safe-chain settlement. `verifiedSponsorFinality` independently requires a native-safe head and the original canonical receipt; XGR uses its committed-chain policy with two blocks of additional depth (`182-201`). No confirmation fallback to latest is added for Base or Arbitrum. The raw signed transaction and observed transaction are checked against the durable amount/recipient/nonce before reconciliation confirms anything (`460-504`).

The new `spendable_at` is not a safe-finality state. Its persistence and recovery transitions are nevertheless incomplete (A-SP-02 and A-SP-03). A future receipt observation must not be confused with proof that its first observed canonical inclusion is still present.

### Expiry proof and financial obligations

External-chain expiry reconciliation uses a second configured endpoint with a distinct hostname, verifies chain identity, pins both witnesses to the same finalized height and hash, requires agreement on the adapter's payer/nonce state, and rereads hashes after the calls (`107-122`, `628-673`). It will not release on wall-clock expiry alone. A lagging witness, missing evidence, nonce disagreement or changed hash retains the obligation. The source-native XGR path uses the documented committed-chain policy. Two endpoint hosts are not proof of independent upstream operators; correlated-provider trust remains explicit.

The expiry work list is partitioned by source chain, and RPC observation is bounded before any resolution write (`678-725`). Crucially, this expiry path remains read-only inside its deadline and performs its database insert only after a complete result. This provides a useful minimal model for repairing the prepared-payout path. A retained used quote remains reserved by the quote-budget query; only `expired-unused` suppresses the commitment from outstanding-capacity calculations (`tax-evidence.mjs:147-162`).

The overtaken-obligation ledger is append-only at the worker privilege level. Its insertion joins the paid operation to nonce, fee, route, asset, amount, final recipient and quoted stage, and records only delivered operations lacking an exactly matching confirmed grant (`729-754`). It does not authorize a late payment, erase the original commitment, or assert financial settlement. A liability register is not a settlement policy. The unrestricted operator still has to decide and document the resolution of externally completed, previously paid promises. The new monitor query preserves those unresolved obligations, but its documented read-only deployment is broken by the missing role grant (A-SP-04).

## Independent observations

### A-SP-01 - Timed-out prepared-payout inspection can broadcast afterward

**Classification:** demonstrated code defect introduced by the delta; proposed Medium; confidence High. User principal is not affected. The bounded amount is an operator gas grant already signed for the intended account.

**Locations:** `gas-sponsor.mjs:423-431`, `473-489`, `539-540`. Introduced by the recovery addition in commit `c8960f129770fa724d2efd773123a3e72de791a6`; the later canonical-delivery gate in `85973bd9c8ab35cdc33ecb5b6fd919468eacdac9` does not cancel late continuations.

**Cause:** the code still treats the inspection callback as read-only, but the callback now invokes `broadcastTransaction`. `Promise.race` returns when its timer fires and does not stop the pending callback. A slow nonce or transaction lookup can therefore resume after the workstream has reported the grant as held and moved on. The destination-delivery gate was evaluated before the slow read and is not repeated before the late effect.

**Preconditions:** a prepared grant exists (for example, crash after the committed reservation but before the original broadcast), no receipt is initially found, the original destination is undelivered at the gate, and a later provider call exceeds the configured 12-second reconciliation deadline but eventually completes while the process remains alive. The original destination may be completed independently during that delay.

**Reproduction:** `recovery-adversarial.test.mjs`, test `A-SP-01`, drives the real exported `reconcileSponsorGrants` with a generated ephemeral signer, a durable-row mock and isolated provider mocks. The nonce call is held behind a controllable promise. After the 20 ms test deadline, reconciliation returns `{held:1, chainFailures:1}` with zero broadcasts. The fixture then marks destination delivery complete and releases the nonce call. The same previously prepared bytes are broadcast, without another delivery read or status transition. The shorter test deadline exercises the same code path as the production default. `adversarial-recovery-direct.log` records the observation.

**Impact and limits:** this violates the promised worker boundary that timed-out observations cannot send and can issue a gas payment after the transfer has completed. It also leaves a side effect outside the returned reconciliation result and subsequent operator hold. Identical-byte rebroadcast does not create duplicate Ethereum transactions or change the recipient/amount; the finding does not claim arbitrary theft, duplicate token issuance or nonce reuse. The failure is a stale authorization/control-boundary defect with bounded sponsor cost.

**Minimal remediation:** make all deadline-raced operations strictly read-only; return an immutable candidate plus a deadline/cancellation token. Perform any broadcast only in the still-active caller after current eligibility is checked. A timed-out callback must be unable to reach a payout even if every pending read later resolves. Preserve exact bytes and the original nonce. Add the late-resolution case as a regression, including a destination completion during the delay.

### A-SP-02 - Provisional spendable-state projection has inconsistent recovery and reorganization transitions

**Classification:** demonstrated state-transition defects; proposed Low availability/UX; confidence High. Both the missing crash-recovery transition and the sticky reorganization marker below belong to this one finding, not separate finding counts.

**Locations:** `gas-sponsor.mjs:542-550`; `server.mjs:334-335` (cross-workstream source verification).

**Cause:** reconciliation can find a canonical included transaction using `prepared_hash` while the grant is still `reserved` and `tx_hash IS NULL`. Its spendable branch writes only `spendable_at`. It does not persist the known hash or transition the grant to `submitted`. The API's public spendable mapping only applies to status `submitted`.

**Reproduction:** test `A-SP-02` provides a valid prepared transaction, its canonical receipt and transaction identity, with native safe confirmation deliberately not yet satisfied. The worker sets `spendable_at`, leaving status/hash unchanged. No payout is duplicated or modified. A later successful safe-finality observation promotes the row correctly; until then, the fast-availability benefit is lost precisely on the crash-recovery path.

**Minimal remediation:** atomically record the exact prepared hash and `submitted` status with the verified inclusion marker, while keeping final `confirmed` separate. Verify that the API sees the restored transition without introducing another signature or payment.

#### A-SP-03 test subcase of A-SP-02: a disappeared or reorganized receipt leaves spendable evidence sticky

**Classification:** demonstrated stale status within A-SP-02; Low; confidence High for stale evidence, no claim of principal loss. Root traced `apps/web/transfer-actions.js:696-702`: the continuation rechecks delivery, performs its call/estimate and verifies actual wallet native balance before requesting a signature.

**Locations:** `gas-sponsor.mjs:491-500`, `541-550`, `577-581`; `server.mjs:334-335`.

**Cause:** `spendable_at` is written monotonically. A later absent or noncanonical receipt returns pending/held without clearing or qualifying the marker. The API interprets a submitted row with any old marker as currently spendable. A timestamp proves a past observation, not continued canonical inclusion.

**Reproduction:** test `A-SP-03` starts from a submitted, previously spendable grant and returns no receipt. Reconciliation records retry metadata only; no inclusion marker is revoked. The public-status workstream confirms the API mapping. A real L2 reorganization or temporarily inconsistent RPC can produce this condition.

**Impact and limits:** the user may be shown available gas that is no longer evidenced at the selected provider, causing a failed continuation or misleading progress. Actual on-chain balance/transaction execution still constrains spending; this does not itself authorize excess token issuance, a second payout or a changed amount. Remediation should clear/downgrade a disproved provisional inclusion and retain the financial obligation, without rewriting immutable transaction intent or treating a missing receipt as settlement.

### A-SP-04 - New overtaken-obligation query lacks the documented read-only role grant

**Classification:** source-proven and independently reproduced migration/monitor incompatibility; proposed Medium operational visibility; confidence High. Disposable PostgreSQL reproduction is tracked separately in `test-executions.json`.

**Locations:** `services/indexer/sql/014_sponsor_overtaken_obligations.sql:14-23`; `sponsor-obligation-audit.mjs:65-75,96-104,112-126`; existing role declarations in migration 009:118-125 and migration 010:60-63.

**Cause:** the new table revokes PUBLIC access and grants SELECT/INSERT only to the sponsor and transfer workers. The operator diagnostic always performs the new SELECT after its older queries, using `XITA_SPONSOR_STATUS_DATABASE_URL`. The documented `xita_sponsor_status_reader` receives grants for the older tables but none for the new one. The function throws before returning any aggregated alert results.

**Preconditions:** the documented restricted reader role is used and no unrecorded manual grant, broader membership or owner privilege compensates for the migration. This is not an assertion about every installed production host.

**Executed reproduction:** `postgres-adversarial.test.mjs` ensures the declared role exists before applying the actual source migrations in disposable `xita_sponsor_audit`, then executes the actual monitor under `SET ROLE`. PostgreSQL 16.15 returned `42501` naming the overtaken table. A control granted only SELECT in that disposable database and repeated the query successfully, then revoked the test grant. `postgres-adversarial.log` contains both results. No production role was changed.

**Impact:** the aggregate diagnostic fails instead of returning aged grant and paid-liability alerts. It fails visibly with a nonzero exit, rather than falsely marking liabilities settled. However, financial and nonce-recovery controls that depend on that monitoring are unavailable under the intended least-privilege setup. Green owner-role tests do not detect this.

**Minimal remediation:** add a narrow conditional SELECT grant for the actual documented status reader to migration 014 (and the deployment grant reconciliation for existing installations); retain the worker-only write boundary. Execute monitoring tests under the real restricted role, not only as table owner.

## Additional residual observations, not counted here as new delta findings

The new timeout isolation covers expiry, reserve monitoring and grant reconciliation, but the new-candidate loop still serially awaits `sponsorOneCandidate` without an outer bounded, effect-safe stage. Its provider fee/balance/nonce/estimate reads and the optional 30-second receipt wait can consume the service's 120-second oneshot window. The globally ordered candidate LIMIT also has no per-chain retry scheduling (`gas-sponsor.mjs:771-805`; `xita-gas-sponsor.service.example:18`). Slow old candidates can therefore delay healthy later work. This pre-existing architecture must be reconciled with the historical RPC-isolation finding rather than automatically declared fully resolved because the newly changed helper tests pass. Do not repair it by simply wrapping the whole payout function in another uncancellable `Promise.race`, which would reproduce A-SP-01.

The expiry negative test named `N-06 expires only after finalized source nonce evidence` still matches an obsolete SELECT prefix at `gas-sponsor.test.mjs:328`. The actual query now starts `WITH due AS`, so this particular test receives no rows and can pass without exercising its unavailable-provider case. Other new witness tests directly exercise hash disagreement, nonce disagreement, reorganization and lagging witnesses. The obsolete stub is a test-coverage defect, not evidence that expiry release itself is unsafe.

The delayed-grant monitor now uses immutable `created_at`, so normal retry-heartbeat changes cannot indefinitely postpone the age alert (`sponsor-obligation-audit.mjs:10-12,53-55`). This cause is corrected in source and has a real-schema regression in the repository. Its operational delivery still depends on the role correction above and an installed invocation/alerting path.

An overtaken-liability row is neither payment nor refund. There is no automatic settlement operation in the reviewed delta. Existing commitments remain reserved, and the new table improves persistence and aggregate visibility once access is corrected. Operator reconciliation remains a necessary operating condition; no new risk acceptance is inferred from a merge.

## Test evidence and limitations

Fresh direct executions include the 20 sponsor tests, six obligation-monitor tests, seven public-status tests, three focused recovery adversarial tests, and three real PostgreSQL scenarios (39 leaf tests altogether). The PostgreSQL scenarios demonstrated the reader-permission defect, concurrent nonce serialization, and rollback of the grant insert after an injected prepared-journal failure. The adversarial tests intentionally assert observed defects; a passing reproduction means the defect was demonstrated, not that the desired invariant passed. `test-executions.json` records exact commands, source revision, Node version, timestamps, exit status and log hashes. Aggregate `node --test` runs are retained as separate file-level evidence and are not double-counted with direct subtest runs.

The first disposable PostgreSQL attempt failed before connection because the filesystem sandbox denied localhost TCP (`EPERM`). It is retained as environment evidence, not an application failure. The approved localhost-only rerun executed all three scenarios successfully. No local result establishes deployment of migrations, role grants, service files or a particular source revision on production hosts. This workstream has not observed an actual production exploitation.

## Phase A conclusion for this workstream

Three independent candidate findings are proposed for later historical de-duplication: A-SP-01 (Medium, late payout after timeout), A-SP-02 (Low, two provisional-state transition subcases), and A-SP-04 (Medium, restricted-reader monitoring failure). No new Critical or High issue is established by this workstream. Exact-byte journal safety is materially improved, but recovery deadlines, monitoring privileges and provisional-state projections are incomplete. The remaining serial candidate path and unsettled paid liabilities are residual observations requiring historical reassessment. Phase A source/reproduction evidence has not been rewritten to fit a prior verdict.


---

# Phase A - Quote admission, liability reserves, gas measurement and database boundaries

Audit: XITA-DBLS-2026-10-29-v3.2.0. Track: independent quote/gas review. Product source: `xgr-network/xgr-interchain@5cfc095d0f02271427832ee6bbb268322f38ae2d`. Delta base: `26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3`. No historical finding register, report, or severity matrix was read before this record. Historical IDs appearing in existing code comments and the user brief were not used as a checklist. The source freeze and endpoint diff were supplied by the coordinating auditor.

## Scope and method

All eleven assigned changed files were read in full, together with the complete quote-generation, HTTP signing, wallet-aware allocation, PostgreSQL reservation, gas-measurement, and readiness paths. The inventory in `coverage.json` records each changed file, relevant adjacent dependencies, and the actual evidence. No product source or historical audit was edited. The database changes below were confined to a newly created disposable loopback PostgreSQL database; they are test fixtures, not remediation deployed to the product.

The analysis followed inputs across the following trust boundaries: HTTP request to verified catalog route; operator EIP-712 quote to immutable database intent; live wallet balances to deterministic stage allocations; concurrent reservations to serialized database budgets; canonical source/destination receipts to gas observations; aggregate gas profile to immutable quoted native grant; and published service readiness to the actual restricted database role. Proof/contract reachability for uncatalogued permissionless routes was independently checked by the protocol track and is identified explicitly below.

## A-Q1 - New database reads lack matching restricted-role grants

**Classification:** confirmed source/installation regression; Medium severity; High confidence. **Primary impacts:** availability of new paid sponsored quotes and visibility of outstanding obligations. **No principal-authentication bypass or demonstrated production outage is claimed.**

### Root cause and source evidence

The new durable per-wallet admission check at `services/managed-relay/tax-evidence.mjs:101-112` runs a SELECT against `xita_sponsor_quote_intents` before persisting a quote. The supported isolated signer role receives INSERT on that table in `services/indexer/sql/010_wallet_aware_sponsor_commitments.sql:50-55`. The runtime repair installer at `services/indexer/sql/011_quote_writer_runtime_grants.sql:25-26` grants INSERT on intents and SELECT on commitments, grants, resolutions and transfers, but still omits SELECT on intents. Its internal verification at lines 27-36 likewise checks only INSERT on intents. The external readiness query at `services/managed-relay/server.mjs:92-103` repeats this omission.

Consequently a correctly installed isolated `xita_tax_quote_writer` can satisfy every current readiness predicate while every wallet-aware signed-quote request fails with PostgreSQL SQLSTATE 42501 at the new admission SELECT. The transaction rolls back both tax evidence and intent creation. A consolidated writer role that already has SELECT on intents can be unaffected; this does not remove the defect in the supported isolated-role installation path. Live host role grants were not inspected and are not inferred from source.

An adjacent instance of the same missing database-contract update affects obligation monitoring. The new unconditional read at `services/managed-relay/sponsor-obligation-audit.mjs:99` queries `xita_sponsor_overtaken_obligations`. Migration `services/indexer/sql/014_sponsor_overtaken_obligations.sql:14-22` revokes PUBLIC and grants only the sponsor/transfer workers. It does not grant the documented `xita_sponsor_status_reader`, even though the CLI uses `XITA_SPONSOR_STATUS_DATABASE_URL` and a read-only transaction at lines 113-124. On that supported role the entire obligation-report call throws before returning its combined result. The sponsor track independently found this instance; it must not be counted twice.

### Preconditions and impact bounds

The quote failure requires wallet-aware sponsorship enabled and a restricted signer without separately added SELECT-on-intents. It prevents new quotes; it neither authorizes a payout nor silently removes an existing paid obligation. The monitoring failure requires the canonical status-reader role without an out-of-band grant on the new table. The CLI exits with an error, so this is a failed report, not a falsely clean report; an operator who checks exit status can detect it. There is no evidence that either condition is presently installed on production hosts.

### Reproduction and observed results

`phase-a-postgres.test.mjs` creates the documented roles only if absent and applies migrations 002, 003, 004, 009, 010, 012, 011, 013, 014, 015 and 016 to a clean schema in **only** `postgresql://xita_ci@127.0.0.1:55432/xita_quote_audit`. The migration-011 psql variable is substituted with its literal canonical role, equivalent to the installer argument. The exact readiness SQL is extracted from the frozen server file rather than approximated.

Observed with PostgreSQL 16.15 and Node v24.22.1:

1. Every current `paidQuoteDatabaseReady` predicate is true under `SET ROLE xita_tax_quote_writer`.
2. `has_table_privilege(...,'xita_sponsor_quote_intents','SELECT')` is false.
3. Calling the actual `saveQuoteEvidence` rejects with SQLSTATE 42501 naming the intents table; zero tax-evidence rows and zero intent rows remain.
4. Calling the actual `inspectSponsorObligations` under `SET ROLE xita_sponsor_status_reader` rejects with SQLSTATE 42501 naming the overtaken-obligations table.
5. Adding **only** SELECT-on-intents in the disposable test database allows the unchanged source to pass the reservation/concurrency tests described below. This is evidence of a small sufficient correction for the demonstrated quote failure, not evidence that the frozen source is already corrected.

Full TAP: `postgres-reproducible.log`; command/time/runtime metadata: `postgres-reproducible.json`. The earlier successful run is retained separately as `postgres-adversarial.log/json`. An initial restricted-network invocation failed before connecting with EPERM; it was a harness access restriction and was followed by an authorized loopback-only execution. Both successful database runs contain seven child cases plus their parent test, all passed. Passing here means the tests successfully demonstrated the expected defect or invariant; it does not mean the defect is fixed.

### Minimal remediation

Grant SELECT on intents to the actual permitted signer role in the existing runtime-grants installer and verify that privilege in both installer and readiness query. Grant SELECT on the overtaken-obligations table to the status-reader role used by the CLI. Add genuine role-based integration tests to CI. Neither change requires contract deployment, additional user signatures, a new worker architecture or modification of existing liabilities. Keep the quote signer unable to UPDATE/DELETE commitments.

## A-Q2 - A permanently unprofileable record can stop gas learning indefinitely

**Classification:** confirmed learner-availability defect; Low severity; High confidence. **Impacts:** persistent per-chain delivery-sample stall or global onward-sample stall, stale gas estimates, repeated RPC/DB work. No loss of principal or demonstrated sponsor underfunding is claimed.

### Root cause and source evidence

`services/indexer/gas-observer.mjs:107-110` fetches every ProcessId event from the chain's shared Mailbox. Each event must then match exactly one `xita_transfer_operations` row with `delivered=TRUE` (lines 116-120), a currently catalogued route (123-124), and a recognizable gas profile (125-127). A permanently absent match sets `incomplete`, and line 133 skips the cursor update. Once a prior cursor exists, every tick restarts at the same `scanned_to+1`. There is no deferred-item queue, permanent-exclusion status or bounded skip for a valid event outside this observer's catalog scope.

The onward collector has the same head-of-line property: `observeOnwardGas` stops at the first row with no profile (lines 56-58), an ineligible receipt (60-64), or an exception (73), preventing later independent measurements from advancing the singleton cursor. A route removed from the current generated catalog can make an old indexed child row permanently unprofileable.

### Reachability and impact

A missing row is not necessarily a transient indexer delay. `contracts/XETATokenFactoryV315.sol:136-168,189-229` permits caller-owned router deployment and route registration without UI-catalog enrollment; routers use the shared Mailbox. The node's `xgr-node@51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671:interchain/runtime/iln_discovery.go:93-140` discovers registry routes independently. In contrast, `services/indexer/transfer-index.mjs:36-48` derives indexed source routes from `deployedRoutes(catalog)`, and `apps/web/route-availability.js:65-73` only iterates catalog assets/routes. These source references were confirmed independently by the protocol track. A valid self-financed route outside the UI catalog can therefore produce a valid shared-Mailbox ProcessId with no eventual row in this particular indexer. No forged BLS proof is necessary. Deployment/source/destination gas costs are prerequisites; the attack is not described as costless.

This is an ancillary gas learner, not the consensus observer or transfer authorizer. The defect does not stop Direct-BLS verification or mutate financial obligations. Its risk is amplified operationally because the quote read at `server.mjs:212-214` retrieves only sample count and p95, and `quotedGasUnits` at `apps/web/transfer-gas-profile.js:43-54` has no freshness test. A stopped collector can leave the last learned profile in use indefinitely. This is evidence of stale estimation, not proof of a specific grant deficit.

### Reproduction

`phase-a-observer.test.mjs` uses the actual frozen deployment catalog and actual observer functions with deterministic canonical RPC/DB fixtures. With an existing Base cursor at block 80 and safe head 120, a valid-looking ProcessId at block 81 without a matching indexed row causes two consecutive calls to query exactly blocks 81-100 and never update that chain's cursor. A separate case places one unknown-route child row before a valid child row; the collector makes zero receipt reads and zero cursor writes. No live chain transaction was performed.

The same file verifies that chain-ID mismatch and expected-block-hash mismatch prevent recording; it also demonstrates the existing absence of a profile-age fallback. Four tests pass with detailed per-test TAP in `observer-adversarial-detailed.log`. These fixtures prove the control-flow defect; the contract/node/indexer source comparison establishes normal permissionless reachability.

### Minimal remediation

For optional gas statistics, skip or quarantine permanently out-of-scope measurements with an explicit counter/reason and continue the scan. Distinguish them from inconsistent RPC evidence, which must still fail closed. A smaller acceptable design can drop an unindexed statistical sample and retain a conservative fallback; it must not use that skip as evidence to release a sponsor liability. Add an age-aware fallback when the profile collector is stalled. Preserve the existing canonical receipt and chain-native-finality checks for accepted measurements. No protocol or contract changes are required.

## Confirmed positive invariants and negative tests

### Signed quote binding and release to callers

`quote-service.mjs:12-23,212-225` retains EIP-712 fields for payer, gateway, route ID, first/final destination and recipient, onward route, amount, bridge value, service fee, nonce and issued time, under chain ID and execution-contract domain separation. The changed gas-profile code affects fee and immutable stage-commitment values but does not remove these fields. `server.mjs:121-175` verifies the execution-gateway address/runtime against the frozen catalog and checks its live owner, registry, fee beneficiary and service wallet. Request keys at 458-461 reject caller-injected first-hop metadata. These are static control-flow observations, not claims about live deployments.

The operator computes its quote signature before persistence, but `server.mjs:465-480` returns the signed response only after `saveQuoteEvidence` succeeds. Error paths return a bounded error message rather than the quote/signature. The new admission failure therefore fails closed for new promises. No extra user signature was introduced in the changed server/quote paths.

### Reservation and concurrency boundaries

`tax-evidence.mjs:83-198` holds one database transaction for tax evidence, immutable intent and every stage grant. The wallet advisory lock is acquired before counting active intents and before insertion; destination-chain advisory locks are acquired in sorted order before reading outstanding liabilities and live funding. New commitments are inserted only after every chain passes capacity checks. Failure rolls back all of the new quote's records.

The real-PostgreSQL tests validate, after the explicitly identified test-only SELECT correction:

- Three simultaneous requests for one wallet admit exactly two and reject the third, leaving exactly two tax rows, intents and commitments.
- Two wallets racing for a daily budget that covers only one grant produce exactly one accepted quote; the loser leaves no orphan evidence.
- A quote involving two chains fails the later chain's capacity check and leaves zero rows across all three quote tables.
- Expired quote intents stop counting against the short-lived per-wallet admission ceiling but remain in total outstanding commitment reservations. A third quote is refused when the old promises consume capacity.
- A live-funding RPC exception while the chain-budget lock is held rolls back every new record.

The last two tests are material to the financial invariant: ending a 90-second admission window is not treated as cancellation of a possible paid promise. The reviewed capacity query excludes only explicitly expired-unused resolutions or confirmed matching grants; it does not use wall-clock expiration alone. Strong expiry-resolution validation is owned by the sponsor track.

### Native principal and stage allocation

`quote-service.mjs:115-120` subtracts native second-hop principal before adding the onward protocol fee. `wallet-aware-sponsorship.mjs:26-40` allocates only gas and explicit protocol fee across first-delivery, hub-onward and final-delivery stages. The same chain's wallet balance is consumed once across stages. New profile estimates are resolved before this allocation and before all stage commitments are persisted. Existing tests rerun exact cases for native-principal exclusion, per-stage learned values, funded-wallet zero grants, all-stage two-hop precommitment, quote mismatches and budget rollback.

### Gas-observation authentication and bounds

`gas-observer.mjs:23-38` checks profile chain, successful receipt, transaction hash, positive bounded block height/gas, optional expected block identity, chain-native finality, and the canonical block hash before calling the database function. The helper `readNativeFinalityHead` rejects wrong chain ID and inconsistent pinned finality head. The collector does not hold a signing key. It does not use sponsor-wallet balances as gas measurements.

Migration 016's function serializes each profile with a transaction-scoped advisory lock, deduplicates `(profile_key,chain_name,tx_hash)`, retains at most 1,000 unique samples, and atomically updates p95. Its SQL values are parameterized; PUBLIC permissions are revoked. The function is security-invoker and the worker has scoped table permissions. Quote readers get SELECT only on profiles. The quote service catches absent profile tables, unavailable reads and invalid profile values and uses the bounded fallback, so failure to install the optional gas profile service does not by itself authorize an unsafe amount.

### Public status boundary

The changed `publicSponsorshipView` uses submitted plus `spendable_at` for a usable-before-safe-finality status, leaving confirmed separate. It exposes stage/status and expected-stage counts, not payout amounts, wallet nonces or signing material. The sponsor track identified that spendable evidence is not cleared after later receipt disappearance; root is evaluating its frontend impact. That shared issue is intentionally not counted again in this track.

## Residual assumptions and non-findings

A learned p95 is a statistical gas estimate, not an execution upper bound. The profile key binds stage, representation classes and executor/router bytecode, but not current validator set, all mutable state, recipient execution behavior or sample age. The protocol track confirmed that `XGRInterchainBLSVerifier.sol:58-74` iterates public keys and adds selected keys, while `XGRInterchainValidatorRegistryV3.sol:315-343,368` permits the verification set/threshold to change with membership. No overrun was measured in this track. It would be inaccurate to call an unmeasured possible gas deficit a proven release-blocking vulnerability. A bounded operational precaution is to invalidate or conservatively refresh learned profiles when relevant membership/state changes, and retain a fallback on aged data.

Unauthenticated signed-quote admission is not proof of wallet control until TX1. The persistent two-active-quotes-per-wallet guard survives process restarts and cross-process requests, but distributed callers can rotate wallet identities; the existing IP/global rate limiter and finite reserve/daily limits constrain exposure rather than eliminate availability pressure. No additional user signature is recommended or required by this observation. Historical mapping and any previously accepted risk will be assessed only in Phase B.

A gas-profile worker with write permission can affect statistical pricing inputs. Accepted gas values and quoted units remain bounded, and the independent quote-capacity/max-grant checks remain in force. There is no evidence from this review that arbitrary profile writes bypass Direct-BLS principal verification. The operator's actual process roles and service installation require separate deployment evidence.

## Execution evidence and limitations

The main existing-test selection reran 50 actual tests across eight files, all passing with `--test-isolation=none --test-reporter=tap`. This flag records individual test assertions rather than only Node's default per-file aggregate. `existing-tests-detailed.json` includes command, frozen commit, runtime, timestamps and result. `observer-adversarial-detailed.json` and `postgres-reproducible.json` describe the additional safe reproductions. Repeated executions verify the harness/clean-schema reproducibility; they must not be summed as new distinct test coverage.

No new mainnet transfers, sponsor payments, user signatures, contract deployments, production database writes or service changes were performed. The only newly signed data, where other tracks use local wallets, is test data; this track does not use any operator key. No production role or host installation was attested. No historical finding was classified before Phase A freeze.


---

# Phase A - Protocol, contracts, native node and deployment identity

Audit: `XITA-DBLS-2026-10-29-v3.2.0`  
Track: Independent protocol review  
Interchain source: `xgr-network/xgr-interchain@5cfc095d0f02271427832ee6bbb268322f38ae2d`  
Interchain comparison baseline: `26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3`  
Node source and comparison baseline: `xgr-network/xgr-node@51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671`

## Independence and boundaries

This track was completed before consulting the prior finding registers or detailed historical audit reports. The assignment disclosed the existence and selected topics of historical findings, which cannot be erased from the reviewer's context. Repository source comments, including comments describing accepted design boundaries, were read as source evidence; those comments are not themselves treated as an operator's fresh acceptance of risk. Historical mapping and any acceptance decision belong to Phase B.

Only the two authorized repositories were inspected. All live interactions used public read-only JSON-RPC methods. No transaction was signed, broadcast, replaced or cancelled. No token transfer, sponsor payment, deployment, validator action, production database mutation or host reconfiguration occurred.

## Scope and reproducible identity proof

The Node frozen commit is exactly the prior baseline. Therefore its complete Git tree is unchanged, rather than merely appearing unchanged in selected files. The Interchain endpoint diff does not change Solidity, deployment manifests, pinned vendor dependency files or the native relayer. Full supporting identities are in `source-identity.json`, generated by `verify_source_identity.py`.

The expanded identity manifest checks 126 Interchain files under `contracts/`, `deployments/`, `vendor/`, `runtime/native-relayer/`, `script/` and `test/`, including all 26 repository Solidity files. Each entry records its Git blob, byte size and SHA-256 and compares actual bytes obtained with `git show` at both frozen revisions. All 126 comparisons matched. It also checks 120 Node files covering Interchain policy, EVM evidence verification, observer/runtime recovery, message encoding, relevant JSON-RPC endpoints, consensus accounting and precompile-adjacent paths; all 120 matched. These are byte-identity checks, not a claim that every unchanged line underwent a new full audit.

Sixty manifest-to-receipt references were resolved locally. Every referenced address and runtime hash matched its receipt record. The 57 distinct deployment receipt addresses were subsequently checked live. The 43 distinct deployment approval source commits contain the same executable Solidity and pinned vendor files as the frozen Interchain source; their only change inside those directories is `contracts/README.md`. Thus no post-deployment source change was silently treated as installed contract code.

The `v3.4.0` Node tag resolves to `cbe6f8a4ae1718429a9924dcf87f0d28591d74e1`. Its difference from the frozen Node commit contains exactly `README.md`, `docs/ILN_V340_OPERATOR_REFERENCE.md` and `interchain/CHAIN_OBSERVER_ACCEPTANCE.md`. Executable Node source is identical to the tagged release. This establishes source identity, not the digest of each installed host binary.

## Direct-BLS authorization and message binding

The active transport is a per-message BLS authorization. It does not depend on a Merkle root, insertion index or checkpoint proof. Historical filenames containing `checkpoint` do not alter the current wire semantics.

`contracts/XITADirectProtocol.sol:25-50` uses one fixed domain string and fixed-width fields. The encoded authorization binds source chain ID, source domain, destination domain, route ID, validator set ID, source block number, source registry, gateway, source router, source mailbox, destination router, paid validator fee and message ID. Destination ISM and destination registry addresses are appended to prevent reuse across those deployments. The Go encoder in `consensus/ibft/interchain/xita_direct_message.go:38-69` uses the same field order and widths. Its decoder at lines 74-97 requires exact length, the exact domain string, and successful re-encoding validation; extra, missing, zero or out-of-range fields are rejected.

The message ID covers the complete serialized message, including nonce, recipient and token payload. It therefore binds payload content indirectly through the cryptographic message hash. The source block hash is verified independently by source evidence readers and compared across RPC witnesses; it is not itself an additional field in the signed authorization. That distinction matters when explaining the trust model.

`XITADirectBLSISM.sol:52-90` requires the current destination validator set, validates domain/router/header identity and `keccak256(message)`, verifies the recipient's canonical reverse-route relationship, and delegates bitmap/signature verification to the configured immutable registry. The current-set requirement means a rotated set requires re-attestation of an undelivered message; it does not require repeating the source lock. No code change in this delta relaxes those checks.

## Source authentication and finality

Every newly signed authorization passes `interchain/runtime/iln_direct_signing.go:27-69`. XGR sources use `NativeXGRReader`; other supported chains require `GetQuorumVerifiedDirectILNOperation`. The constructed payload uses independently retrieved route, fee and contract values, rather than accepting these values from a caller-provided proof object. The signer entry point at lines 95-135 checks synchronization before evidence work and again immediately before signing, checks current destination set and delivery state, persists the local vote before gossip, and refuses an already delivered message.

For remote chains, `interchain/evm/iln_direct_operation.go:92-134` pins the entire operation verification to one RPC client. It rejects an operation beyond the finality head, duplicate or missing gateway operations, missing or wrong transaction receipts, noncanonical source receipts, inconsistent Mailbox dispatches and unproven FeeVault allocations. `VerifyDirectILNReceipt` at lines 15-85 requires exactly one matching gateway operation and exactly one matching Mailbox dispatch in the same successful transaction. It rejects removed logs, wrong transaction/block identity, malformed bounded serialization and mismatched routers, domains or message hashes.

`interchain/evm/finality.go:15-34` obtains the chain's compiled policy and requires `safe` on Base and Arbitrum. It performs a second numeric-height lookup and compares the reported hash; failure does not fall back to `latest`. Receipt verification at lines 37-65 requires a successful receipt at or below that checked head and a matching canonical numeric block. The compiled policy in `interchain/config.go:47-123` fixes chain identities, finality rule, registry addresses and RPC operator identities. Finality is a Node verification condition; replacing a UI relayer cannot waive it.

`interchain/evm/rpc_evidence_quorum.go:31-89` accepts only two matching observations from distinct configured operators. All receipt, route and fee verification for an observation uses one endpoint, avoiding the construction of a synthetic proof from unrelated RPC responses. `sameILNWitness` at lines 94-113 compares canonical block hash, transaction hash, log index, message ID, route ID, source block, destination domain, fee, serialized message and route snapshot. Distinct URLs owned by one configured operator count once. An unavailable, malformed or contradictory provider cannot by itself authorize signing; two matching other operators may still permit progress.

This remains an RPC-witness trust model on external chains. Two colluding or jointly compromised operators can provide correlated false evidence, and each validator may rely on the same configured operator set. Two endpoints do not become two consensus light clients. This is an existing architectural residual risk, with no weakening introduced by the current source delta. Its historical severity and acceptance status must be reconciled in Phase B rather than assumed here.

## Native XGR evidence and consensus boundary

`interchain/evm/iln_native_evidence.go:32-95` derives the operation from locally committed IBFT transactions, receipts and a state-root-bound read view. It rejects an uncommitted height, missing block/view, transaction/receipt count mismatch, duplicate operation, reverted receipt, inconsistent dispatch and missing immutable fee allocation. It does not call an external source RPC to decide what its own chain committed.

Consensus accounting remains fork gated by `params.forks.securityAccounting` through `consensus/ibft/security_accounting.go:11-61`. After activation it validates the exact epoch system transaction and checked base-fee calculation. The reviewed code does not hardcode the production activation height, so observing a v3.4.0 client alone is not proof of every host's configured fork schedule. Live agreement at the documented activation block and after it is affirmative operational evidence. Exact configuration attestation must be kept separate from source verification.

No Node change after the preceding baseline introduced a new consensus, accounting, RPC-witness or finality dependency.

## Membership, governance and replay boundaries

`XGRInterchainValidatorRegistryV3.sol:72-94` verifies possession of the BLS key before membership eligibility. Bootstrap checks duplicate addresses/keys and verifies possession. Current transitions at lines 350-415 require expected set ID, bounded validity, current quorum and a valid signature; successful transitions advance the set and commit a snapshot. `verifyQuorum` at lines 315-343 requires the requested set and a bitmap meeting `ceil(2*n/3)`.

The direct-transfer payload binds the destination registry address. The membership payload at lines 428-460 does not bind `address(this)`. Therefore a properly signed transition could be replayed against a second registry with matching origin chain, destination domain, set ID and keys. The one-active-registry-per-chain policy is an operating restriction, not a cryptographic elimination of that condition. This was identified from executable source and source comments during Phase A; mapping it to a historical finding and validating documented risk acceptance is deferred to Phase B. This track does not manufacture a second finding for the same unchanged cause.

## Permissionless routes, hub routing and principal safety

`XETATokenFactoryV315.sol:136-168` permits caller-owned collateral and synthetic router creation. `registerRoute` at lines 189-229 requires creator ownership and valid hub-and-spoke routing, and atomically creates the gateway, registers its source route and bootstraps the router. A public UI catalog is not a prerequisite for the on-chain route. Node discovery in `interchain/runtime/iln_discovery.go:93-140` persists and validates registry-discovered routes independently of the UI catalog.

The optional execution gateway is a fee and source-call adapter. `XITAExecutionGateway.sol:178-247` binds its EIP-712 quote to payer, route, hop/final recipients, onward route, amount, exact bridge value, service fee, nonce and issuance time. It requires `msg.sender == payer`, an unused nonce, a valid current service-wallet signature, an enabled registered route, a current on-chain gateway quote and exact `msg.value`. User allowances and token balance deltas are handled with SafeERC20, reset approvals and post-call debit checks at lines 296-313. The service quote signer cannot use that signature to execute a transfer as the payer.

Two-hop continuation at lines 256-292 is a separate user-initiated source transaction on XGR and is linked by payer/parent. It does not grant a sponsor or relayer authority to move principal. The local indexer must independently authenticate parent-child linkage for sponsorship/accounting; core token authenticity remains enforced by router, gateway and Direct-BLS checks. No changed service gas estimate can change the on-chain principal required by `bridge` or mint tokens without the destination authorization.

For native receipts, `XETAGuardedNativeWarpRouter.sol:68-85` deducts all already pending claims from available collateral before a new payout. Insufficient unreserved backing reverts the authenticated delivery. A recipient that rejects the bounded 30,000-gas native send receives a recorded claim rather than preventing unrelated deliveries. Only the original beneficiary may withdraw its claim to another nonzero payout address; accounting is cleared before the external call and restored by transaction revert on failure, with a reentrancy guard at lines 25-37. A contract beneficiary that cannot invoke that withdrawal can still face a recovery limitation. The delta does not alter this existing behavior.

## Recovery, observer cursors and relayer independence

`interchain/runtime/iln_scan_catchup.go:61-111` advances a durable cursor only after the full window is processed and its commit callback succeeds. A regressed finality head or noncontiguous/invalid range stops progress. RPC/backoff failures preserve the uncommitted window, and the signing path stores a vote before publishing it. These properties prevent silently skipping observed source operations during a transient outage.

Completed quorum import in `interchain/runtime/iln_completed_quorum.go:43-106` validates the canonical encoded payload, exact route/chain/registry/ISM/current-set bindings, metadata consistency, bounded signer bitmap and consistency of compressed and EIP-2537 signature forms, then verifies the aggregate signature. It does not require a new external source witness round merely to retrieve an already valid aggregate proof. Newly generated votes continue to require full source evidence. Current-set rotation remains a separate availability consideration.

Permissionless source dispatch and public proof/recovery paths mean a failure of the optional XITA gas worker does not authorize a malformed core transfer or inherently prevent a self-funded valid delivery. It can still create a separate service funding or availability obligation, which the sponsor and quote tracks assess.

## Cross-track findings support

### Gas observation cursor poisoning reachability

The new gas observer scans shared deployed Mailboxes. Source review confirms the quote track's adversarial scenario is reachable by valid permissionless activity: a caller can create/register its own route and use the same immutable Mailbox, while `services/indexer/transfer-index.mjs:36-48` indexes only `deployedRoutes(catalog)` and `apps/web/route-availability.js:65-73` enumerates catalog assets/routes. Therefore not every valid `ProcessId` in that shared Mailbox must acquire a row in `xita_transfer_operations`. The quote track's safe mock reproduction demonstrates the resulting pinned learner cursor. This is not a forged BLS proof, token-minting bypass or principal-loss finding. Its final independent ID and severity are owned by the combined Phase A register to avoid duplication.

### Learned gas profile and validator cardinality

The profile identity in `apps/web/transfer-gas-profile.js:37-39` binds code hashes and operation/representation categories, not the current destination validator set. Yet `XGRInterchainValidatorRegistryV3.sol:536-553` loads every verification key, and `XGRInterchainBLSVerifier.sol:58-74` iterates all public keys and performs a G1 addition for every additional selected signer. Membership growth therefore changes verification work while those profile keys remain constant. The ISM's current-set rule makes fresh proofs use the new work profile.

This is a proven workload-identity omission and a plausible underfunding condition, not a measured production shortfall. No claim is made that one ordinary validator addition exceeds the current margin. No benchmark for the exact overrun threshold was executed in this track. Minimal remediation candidates are profile invalidation/versioning on set change, a conservative floor, or a current-call estimate once a proof exists. The quote track will reconcile this with immutable paid obligations and its own test evidence.

## Newly collected live evidence

The bounded probe `read_only_rpc.py` performed 169 public RPC reads. Complete responses and timestamps are preserved in `rpc-observations.json`; structured deployment observations are in `rpc-deployment-results.json`. `verify_deployment_hashes.mjs` computes Ethereum Keccak-256 locally with ethers 6.13.4 and produces `deployment-identity-checks.json`.

| Chain | Deployment addresses | Runtime hashes matching records | Successful, canonical recorded receipts |
|---|---:|---:|---:|
| XGRChain | 21 | 21 | 21 |
| Base | 18 | 18 | 18 |
| Arbitrum | 18 | 18 | 18 |
| Total | 57 | 57 | 57 |

The two XGR RPC endpoints independently reported `xgrchain/v3.4.0/linux-amd64/go1.23.11`. Their observed heads were 12,265,855 and 12,265,856, both beyond 12,186,213. Each named head matched its numeric-height response. Both returned the same block hash at the documented activation height: `0x55c7c034fc458073271fe953bd64aa348f96b64beae9b9a12b38a1f65f5d042d`. A subsequent shared-height comparison at 12,265,855 also agreed.

Base official and PublicNode endpoints returned numerically verified `safe` heads at 53,237,238 and 53,237,211 respectively. These heights were sampled at different service views; unequal latest safe heights do not demonstrate contradictory block history. Arbitrum official and PublicNode endpoints returned the same safe height 519,308,119 and hash. Deployment bytecode and receipts were read at a pinned numeric head on one successful endpoint per chain and compared with immutable repository evidence; this does not claim independent two-provider confirmation of every bytecode read.

Additional read-only XGR registry checks found three active members, threshold two, a consistent set view, and different execution-gateway owner and service-wallet addresses. This confirms public address separation, not private-key custody or access controls. The supplementary registry probe made 36 requests: 12 XGR calls succeeded; the 24 later Base/Arbitrum requests returned HTTP 403. These later retrieval failures do not invalidate the earlier 57 successful code/receipt comparisons, and do not prove an on-chain or production service defect. No NO-GO decision is inferred from them.

## Executed checks, failed harness attempts and limits

1. `python3 audit-work/protocol/verify_source_identity.py`: passed. Byte equality, Git blobs and SHA-256 verified for the enumerated unchanged scope; all 60 manifest references agree.
2. `python3 audit-work/protocol/read_only_rpc.py`: completed. All six public endpoint head checks succeeded; all 57 deployment records had successful canonical receipts and nonempty code.
3. `node audit-work/protocol/verify_deployment_hashes.mjs`: passed after moving Git subprocess reads into Python. The initial Node child-process attempt returned `spawnSync git EPERM`; this was a harness/environment limitation and did not constitute a protocol test failure. The attempt is retained in `harness-attempts.json`.
4. `node audit-work/protocol/read_only_registry.mjs`: interrupted after repeated `fetch failed` transport errors from the Node HTTP client. Its partial responses are retained in `rpc-registry-observations.json`. No source conclusion depends on these failed calls.
5. `node audit-work/protocol/registry_plan.mjs prepare`, `python3 audit-work/protocol/probe_registry.py`, and `node audit-work/protocol/registry_plan.mjs analyze`: completed; twelve successful XGR views and twenty-four HTTP 403 observations are explicitly separated in the evidence.

Go and Foundry were not installed in the task environment. This track did not claim newly executed Go cryptography/consensus tests or a new Solidity compile/EVM suite. Existing tests were inspected for relevant cases but are not represented as rerun. Runtime-hash agreement with published receipts is not a fresh compiler reproduction. These limitations do not transform unchanged source into a demonstrated vulnerability. The parent audit may add separately labeled test evidence before its final determination.

## Phase A disposition for this track

No new core Direct-BLS authorization, principal-accounting or consensus regression was demonstrated in this delta. Unchanged source, unchanged deployment approvals and live bytecode/receipt identities provide affirmative evidence for the core boundary. The gas-observer reachability and gas-profile workload observations are supplied to the combined independent Phase A register. The external RPC trust assumption, membership cross-registry replay boundary, current-set recovery behavior and contract-beneficiary claim limitations must be mapped to historical findings in Phase B.

This track does not issue the overall release verdict before the sponsor/quote tracks and historical reconciliation are complete. Missing per-host binary or configuration attestation is recorded as a limitation, not an invented exploit or automatic NO-GO.
