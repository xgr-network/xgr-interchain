# Historical finding reassessment

Audit XITA-DBLS-2026-10-27-v3.0.0. Every baseline ID is retained by date. The complete PDF contains the same records.

The24 October public register identifies a29-page PDF with SHA-256 `6a1423bd937eb261adf2b0da15085f7cb09dcb8ba82d16e2ea3e48e64d8ebab4`. The recovered readable PDF copy has 252,266 bytes and SHA-256 `df4f43d0aa070b46ea1657732515f39ed3bd4c56391bfe11151ba03759a4640d`; its text is German. It was used as a readable technical source but is not claimed to be the exact committed original identity. The67-entry October24 evidence ZIP has 862,448 bytes and SHA-256 `66dbc0551b4602686903b650eeda36ab090a2eac22d29de39f8d1b0290d4ded2`, exactly matching the historical commitment. The PDF discrepancy remains unresolved and is not silently repaired by changing the old register.

The35-page October25 original PDF and137-entry confidential ZIP were not recovered from connected storage. Its public report/ledger is incomplete at finding level. The original final response dated 2026-10-25T10:42:18Z supplied the 12 new N-01 through N-12 conditions and the carried-forward inventory. This is secondary historical evidence, not authenticated original report bytes. Current code, corrections and test results were then independently examined. No missing original PoC, test output or finding line number was invented.

The26-entry v2 unresolved set consists of H-01, M-04 through M-06, L-01 through L-07, I-01 through I-03 and N-01 through N-12. The earlier M-01/M-02 were historically marked verified and M-03 fixed in code; they remain individually reassessed in the 17-entry v1 matrix. The later L-02 description concerns chain-specific gas overhead, while the earlier L-02 concerns code-bearing wallets. Both descriptions are preserved under their dates; their shared gas-estimation correction is counted once as a present technical control.

### 2026-10-24 - 17 preserved identities

| ID | Historical severity | Current severity | Disposition | Current entry |
| --- | --- | --- | --- | --- |
| H-01 | High | Medium | OPEN | F-05 |
| M-01 | Medium | Resolved original condition | VERIFIED | Original condition closed/pending direct verification |
| M-02 | Medium | Resolved original condition | VERIFIED | Original condition closed/pending direct verification |
| M-03 | Medium | Resolved original condition | FIXED_IN_CODE | Original condition closed/pending direct verification |
| M-04 | Medium | Medium | OPEN | F-29 |
| M-05 | Medium | Medium | OPEN | F-03 |
| M-06 | Medium | Resolved original condition | VERIFIED | Original condition closed/pending direct verification |
| L-01 | Low | Low | OPEN | F-13 |
| L-02 | Low | Resolved original gas-estimation condition | VERIFIED | Original condition closed/pending direct verification |
| L-03 | Low | Low | OPEN | F-10 |
| L-04 | Low | Low | OPEN | F-22 |
| L-05 | Low | Low | OPEN | F-23 |
| L-06 | Low | Low | OPEN | F-24 |
| L-07 | Low | Low | OPEN | F-25 |
| I-01 | Informational | Low (combined assurance drift) | OPEN | F-14 |
| I-02 | Informational | Informational | OPEN | F-27 |
| I-03 | Informational | Informational | OPEN | F-28 |

### 2026-10-25 - 26 preserved identities

| ID | Historical severity | Current severity | Disposition | Current entry |
| --- | --- | --- | --- | --- |
| H-01 | High | Medium | OPEN | F-05 |
| M-04 | Medium | Medium | OPEN | F-29 |
| M-05 | Medium | Medium | OPEN | F-03 |
| M-06 | Medium | Resolved original condition | VERIFIED | Original condition closed/pending direct verification |
| L-01 | Low | Low | OPEN | F-13 |
| L-02 | Low | Resolved original gas-estimation condition | VERIFIED | Original condition closed/pending direct verification |
| L-03 | Low | Low | OPEN | F-10 |
| L-04 | Low | Low | OPEN | F-22 |
| L-05 | Low | Low | OPEN | F-23 |
| L-06 | Low | Low | OPEN | F-24 |
| L-07 | Low | Low | OPEN | F-25 |
| I-01 | Informational | Low (combined assurance drift) | OPEN | F-14 |
| I-02 | Informational | Informational | OPEN | F-27 |
| I-03 | Informational | Informational | OPEN | F-28 |
| N-01 | High | Medium | OPEN | F-04 |
| N-02 | High | Resolved original condition | VERIFIED | Original condition closed/pending direct verification |
| N-03 | Medium | Medium | OPEN | F-20 |
| N-04 | Medium | Medium | OPEN | F-21 |
| N-05 | High | Resolved original circular stage dependency | VERIFIED | Original condition closed/pending direct verification |
| N-06 | Medium | Medium | OPEN | F-17 |
| N-07 | Medium | Resolved original aggregate-accounting condition | VERIFIED | Original condition closed/pending direct verification |
| N-08 | Medium | Resolved original premature-confirmation condition | VERIFIED | Original condition closed/pending direct verification |
| N-09 | Medium | Medium | OPEN | F-09 |
| N-10 | Low | Resolved original condition with bounded local retention | VERIFIED | Original condition closed/pending direct verification |
| N-11 | Medium | Medium | OPEN | F-26 |
| N-12 | Medium | Resolved original no-promise candidate poisoning condition | VERIFIED | Original condition closed/pending direct verification |

### 11.2 Finding-by-finding evidence

The following records retain original severity separately, name the current disposition, explain the failure boundary, identify corrective merge evidence, and state the actual validation and production limit. Repeated date-qualified identities refer to the same underlying present defect unless the record states a changed historical condition.

### 2026-10-24 / H-01 - External RPC source evidence and correlated-provider trust

**Historical: High. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** Common external RPC sources supplied signer source evidence, including XGR. Same-provider consistency checks and failover did not independently authenticate the provider view. Control over source evidence consumed by enough otherwise honest signers; a malicious relayer alone is insufficient. Currently external evidence needs two matching operator-labelled complete witnesses, while native XGR uses locally committed state.

**Current assessment.** Each external witness is pinned to one endpoint for the complete receipt/route/FeeVault verification; exact block, transaction, log index, message, route and fee fields must match. One successful operator, duplicate labels or two disagreeing observations cannot reach the threshold. Any matching pair of distinct labels returns immediately. An earlier disagreement is not a global conflict veto and all configured providers need not be queried. Native XGR uses its synchronized local committed chain. L2 source evidence requires safe finality with numeric canonical hash equality and no latest fallback. Operator labels do not establish upstream independence. Two correlated matching views can affect every signer. This is not a provider-independent header/receipt inclusion proof; L2 safe is not final Ethereum settlement.

**Source anchors.** `interchain/config.go:47-71`; `interchain/evm/rpc_evidence_quorum.go:31-113`; `interchain/runtime/iln_direct_signing.go:27-68`; `interchain/runtime/iln_direct_signing.go:95-135`; `interchain/evm/finality.go:17-62`; `audits/H01_RPC_WITNESS_SECURITY_EVIDENCE.md`.

**Correction history.** [xgr-node PR58](https://github.com/xgr-network/xgr-node/pull/58), merge `b2c3bb26b9efff774e9d16a91c212d71526b59e2` (Merged mitigation is present; correlated external-source trust remains); [xgr-node PR59](https://github.com/xgr-network/xgr-node/pull/59), merge `39175b868dfd39da17be9d6a87de87273c6b85bf` (Merged mitigation is present; correlated external-source trust remains); [xgr-node PR62](https://github.com/xgr-network/xgr-node/pull/62), merge `0184eaec64a4634c5604fa734652afe13cb8feb6` (Merged mitigation is present; correlated external-source trust remains).

**Independent checks.** TestIndependentSourceWitnessRequiresExactBlockAndReceipt PASS (Exact witness equality.); TestTwoIndependentOperatorsWithFailover PASS (Operator threshold and failover.); TestOneOperatorAndConflictingProvidersFailClosed PASS (One surviving operator and a conflicting pair reject; not evidence of a global conflict veto.); TestSafeFinalityNoFallbackToLatest PASS (Finality policy.); TestReceiptMustMatchFinalizedCanonicalBlockHash PASS (Canonical block binding.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. The later-added first-honest-disagreement/next-matching-pair case was not run after the automated interruption; current behavior follows static control flow. No real-provider compromise, forged live receipt or production mint was created. Current residual maps to F-05.

### 2026-10-24 / M-01 - Gas sponsorship accepts source confirmations below the adopted native finality boundary

**Historical: Medium. Current: Resolved original condition. Disposition: VERIFIED.**

**Original condition and boundary.** findWalletSourceTx accepted latest plus a confirmation depth without requiring the L2 safe head or matching the receipt block hash to the canonical block. checkCandidate reused that confirmed flag to authorize a company-funded gas grant. The optional sponsor is active and funded. An otherwise valid payer-bound paid source operation lies above the safe head or its receipt becomes orphaned. Route, fee, wallet and budget checks remain necessary. This concerns sponsor treasury exposure, not additional Direct-BLS mint authority.

**Current assessment.** The shared native-finality helper checks chain identity, requires the configured native head, pins that head by number/hash and compares the source receipt block hash. findWalletSourceTx returns a nonconfirmed state above that head, and sponsorOneCandidate refuses it before reservation or payment. The original latest=112/source=100/safe=64 condition and the orphaned receipt condition both fail closed in the actual current sponsor entrypoint.

**Source anchors.** `apps/web/chain-finality.js:15-50`; `apps/web/wallet-transfers.js:387-399`; `services/managed-relay/gas-sponsor.mjs:100-116`.

**Correction history.** [xgr-interchain PR292](https://github.com/xgr-network/xgr-interchain/pull/292), merge `31e5b4116ab58ccd96f78931d762219534401f9d` (Shared native-safe source and delivery verification. The source sponsorship portion closes M-01.).

**Independent checks.** Two targeted tests pass: the actual sponsor entrypoint rejects source block 100 above safe 64 before reservation/send, and rejects an orphaned receipt block hash before reservation/send. Synthetic RPC and sender fixtures; no live payout. 4/4 shared-finality tests pass, including unsupported safe signals, chain policy, canonical receipt comparison and pinned Mailbox-state observations. 23/23 wallet-transfer tests pass, reused from the lead auditor's run.

**Production/release limit.** Current source and local failure-path behavior verified. Installed sponsor version and a real paid payout at the adopted source-finality boundary remain unverified. No bypass of the original finality threshold was found through the current sponsor entrypoint. A malicious sole RPC can fabricate mutually consistent state; the code does not supply independent consensus evidence. The protocol's native safe threshold is not a claim of stronger L1 finalization.

### 2026-10-24 / M-02 - Provisional destination delivery becomes permanently completed indexed state

**Historical: Medium. Current: Resolved original condition. Disposition: VERIFIED.**

**Original condition and boundary.** Mailbox state was read at latest despite a finality label; an initial true survived database refresh and wallet reconciliation after a canonical negative observation. A provisional destination execution is reorganized or an RPC returns transiently inconsistent positive state; source transfer can remain valid.

**Current assessment.** checkedDelivery now uses native-finality-qualified, block-pinned Mailbox state. Reconciliation revisits completed rows, persists block/hash and allows canonical false to overwrite true. The wallet accepts an independently qualified reversal. Queue starvation is separate N-11, not proof the old sticky-true condition remains.

**Source anchors.** `services/indexer/transfer-index.mjs:63-72`; `services/indexer/transfer-index-worker.mjs:197-225`; `apps/web/verified-journey.js:94-121`; `services/indexer/sql/010_native_delivery_finality.sql`.

**Correction history.** [xgr-interchain PR292](https://github.com/xgr-network/xgr-interchain/pull/292), merge `31e5b4116ab58ccd96f78931d762219534401f9d`.

**Independent checks.** Executed indexer M-02 finality-qualified false regression and browser verified-journey reversal regression; both passed. No real L2 reorganization.

**Production/release limit.** Current source verified; backend deployment/database migration not independently attested. Live endpoint alone does not establish rollout.

### 2026-10-24 / M-03 - On-demand Direct-BLS signing lacked synchronization protection

**Historical: Medium. Current: Resolved original condition. Disposition: FIXED_IN_CODE.**

**Original condition and boundary.** Public/peer quorum hints could reach the common signer without the synchronization guard used by the periodic loop, allowing eligibility checks against stale local PoS state. An unsynchronized node retains a route and locally active signer and receives an otherwise valid source-operation hint. Source evidence and destination set checks still applied.

**Current assessment.** signDirectILNMessage checks IsSynchronized before evidence acquisition and immediately before SignByBLS. Automatic observation and public/peer hints converge on this signer; current-set and delivery checks precede signing. Existing tests cover signer activity/key binding, but no dedicated stale/lost-sync regression for all entry paths was found. Code correction is established, but targeted entry-path and lost-synchronization tests are needed for VERIFIED.

**Source anchors.** `interchain/runtime/iln_direct_signing.go:92-135`; `interchain/runtime/iln_quorum_request.go:195-210`; `interchain/runtime/iln_quorum_request.go:211-238`; `consensus/ibft/interchain_runtime.go:28-75`.

**Correction history.** [xgr-node PR58](https://github.com/xgr-network/xgr-node/pull/58), merge `b2c3bb26b9efff774e9d16a91c212d71526b59e2` (Central early and immediate pre-signing synchronization checks); [xgr-node PR59](https://github.com/xgr-network/xgr-node/pull/59), merge `39175b868dfd39da17be9d6a87de87273c6b85bf` (Central early and immediate pre-signing synchronization checks).

**Independent checks.** TestInterchainSignerEligibilityIsOptInActiveAndMatchingBLS PASS (Eligibility/key binding; not a direct synchronization regression.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No dynamic unsynchronized or mid-proof loss-of-sync reproduction in Phase B.

### 2026-10-24 / M-04 - Unbounded RPC can block failover and orderly worker shutdown

**Historical: Medium. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** In the original baseline, an established remote RPC call could wait indefinitely, including while a chain-selection mutex was held, preventing failover and orderly shutdown. A stalled provider or network was sufficient; no flood was required.

**Current assessment.** boundedILNRPC read/evidence calls use real context cancellation, twelve-second request/four-second dial timeouts and a response limit; Worker.Close cancels that shared context. SubmitMembership and SubmitILNGovernance select a verified URL, then create txrelayer.NewTxRelayer without injecting the bounded client or worker shutdown context. Both run preflight reads through relayer.Client and then SendTransaction. The node-owned txrelayer creates its own legacy jsonrpc.NewClient. The pinned ethgo HTTP transport constructs a fasthttp client without read/write deadlines and calls Do; those defaults are unlimited. Its Close method has no cancellation effect. WithReceiptTimeout changes the sleep between receipt polls, not the timeout of GetTransactionReceipt or any other HTTP call. These are reachable worker paths: governanceExecuteLoop synchronously calls executeGovernanceJob and is part of the WaitGroup; the main loop calls tick -> trySubmissions -> trySubmit -> SubmitMembership. Worker.Close waits for them; IBFT.Close invokes it before closing the syncer. Separately, chain-selection locks still span bounded provider I/O, finality polling can continue to five minutes after cancellation, and native receipt polling has a two-minute outer deadline without the worker shutdown context. Unbounded external submission/preflight I/O can still hold a worker and orderly shutdown despite read-side cancellation. Per-call or polling-loop limits on other clients do not impose deadlines on this separate transport. No live consensus stall is asserted. Current residual prerequisites: an authorized governance execution or eligible membership preflight/submission is active against an external chain and its separate legacy transport stalls. Actual consensus halt was not demonstrated.

**Source anchors.** `interchain/evm/rpc_transport.go:23-125`; `interchain/evm/rpc_failover.go:231-284`; `interchain/runtime/worker.go:325-348`; `interchain/evm/finality.go:64-86`; `consensus/ibft/interchain_runtime.go:218-238`; `interchain/runtime/governance_execute.go:24-47`; `interchain/runtime/governance_execute.go:75-83`; `interchain/evm/iln_governance_submit.go:130-153`; `interchain/evm/client.go:400-448`; `txrelayer/txrelayer.go:61-80`; `txrelayer/txrelayer.go:95-135`; `txrelayer/txrelayer.go:256-275`; `interchain/runtime/worker.go:351-372`; `interchain/runtime/worker.go:446-453`; `interchain/runtime/worker.go:1070-1082`; `interchain/runtime/worker.go:1168-1183`; `consensus/ibft/ibft.go:688-700`; `go.mod:60-63`; `go.mod:240-243`.

**Correction history.** [xgr-node PR63](https://github.com/xgr-network/xgr-node/pull/63), merge `fd39a0fb4d20163c6a6d93cb8cf5dc25f017f188` (PR63 corrects bounded read/evidence transport; external txrelayer submission/preflight remains outside that cancellation scope.).

**Independent checks.** TestILNRPCRequestCancellationOnWorkerShutdown PASS (Cancels only a boundedILNRPC parent context during mock HTTP I/O. Does not exercise txrelayer, external membership/governance submission, or complete Worker.Close.); TestILNRPCRejectsOversizedResponseAndMismatchedID PASS (Transport size and response-identity checks.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No new tests or transactions. No deliberately hung txrelayer request or full lifecycle shutdown reproduction was run; the conclusion is current-source and pinned-dependency static analysis. Current residual maps to F-29.

### 2026-10-24 / M-05 - Interchain work is not completely bounded inside the validator process

**Historical: Medium. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** Per-message goroutines, expensive proof acquisition before authentication and governance proposals without total count/maximum future lifetime limits leave aggregate work and persistence unbounded. An admitted peer submits syntactically acceptable frames. Proposals must satisfy current source/set checks. Interchain shares process and host resources with the regular validator.

**Current assessment.** Direct checkpoint votes call full source verification before voter membership, eligibility and signature checks. Direct vote and quorum-hint work lacks comprehensive pre-I/O global/per-peer admission. Some other frame types are throttled. Gossip starts a goroutine per delivered message. Governance proposals reject expired payloads/duplicates but have no global count/disk or maximum-future-expiry bound before insertion/persistence. Response/connection/time limits and batching reduce cost without bounding total admitted work. Separation from synchronous IBFT verification hooks does not establish CPU, memory, RPC or disk isolation. No actual IBFT halt or invalid IBFT state was demonstrated.

**Source anchors.** `network/gossip.go:108-122`; `interchain/runtime/worker.go:830-880`; `interchain/runtime/iln_checkpoint.go:167-201`; `interchain/runtime/iln_quorum_request.go:211-238`; `interchain/runtime/governance.go:201-240`; `interchain/runtime/iln_storage.go:123-134`; `interchain/evm/rpc_transport.go:27-58`.

**Correction history.** [xgr-node PR63](https://github.com/xgr-network/xgr-node/pull/63), merge `fd39a0fb4d20163c6a6d93cb8cf5dc25f017f188` (Partial transport/batching/completed-quorum improvements; no complete aggregate admission fix); [xgr-node PR75](https://github.com/xgr-network/xgr-node/pull/75), merge `9a00ff7d30c602e2eedb0b2ba3ff988c039f553c` (Partial transport/batching/completed-quorum improvements; no complete aggregate admission fix).

**Independent checks.** TestILNRPCRejectsOversizedResponseAndMismatchedID PASS (Per-response bound, not aggregate isolation.); TestILNCompletedQuorumVerificationRejectsForgedAndStale PASS (Proof validity, not aggregate workload.); existing_race PASS (102 existing race tests; no workload saturation or consensus-latency assertion.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No live P2P flood, saturation, consensus-halt test or new attack-oriented test after the interruption. Current residual maps to F-03.

### 2026-10-24 / M-06 - Unresolvable route hints can indefinitely crowd discovery progress

**Historical: Medium. Current: Resolved original condition. Disposition: VERIFIED.**

**Original condition and boundary.** The first eight sorted hint files were repeatedly selected; unresolved/unknown hints remained without a lease and could indefinitely starve later valid hints in the bounded admission queue. Unresolvable public hints precede legitimate later entries. No quorum is needed to create a hint; event discovery/gossip remain alternate paths.

**Current assessment.** Hints sort by retry mtime/name and failed attempts rotate to the back. A fixed fifteen-minute first-seen lease cannot be renewed by retry rotation; legacy lease admission is synced. Unknown chain pairs, invalid names and conclusively noncanonical routes are removed; transient failures remain retryable. Eight-per-tick work bound remains while later legitimate hints can progress. Closure is for route-hint discovery only, not the separate fixed-order observer retry queue (N-01/NODE-A-04).

**Source anchors.** `interchain/runtime/iln_discovery.go:161-202`; `interchain/runtime/iln_discovery.go:209-272`; `interchain/runtime/iln_discovery_test.go:287-356`.

**Correction history.** [xgr-node PR73](https://github.com/xgr-network/xgr-node/pull/73), merge `7b8c88a172cb2d7f14af785955f476981bcfb582` (Exact original fairness/lease correction).

**Independent checks.** TestILNHintQueueCannotStarveValidRouteBehindEightInvalidNames PASS (Valid later hint served despite unusable earlier hints.); TestILNHintQueueTransientRPCFailureRotatesAndPreservesOriginalLease PASS (Rotation preserves immutable lease.); TestILNHintDiscoveryRequiresCanonicalRegistryProof PASS (Hint progress does not confer authorization.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No live hint-queue flooding.

### 2026-10-24 / L-01 - Wallet recovery does not bind Process calldata to the selected message

**Historical: Low. Current: Low. Disposition: OPEN.**

**Original condition and boundary.** Returned metadata is checked but the encoded message inside process calldata is not independently decoded and hashed against wallet intent. Compromised proof response plus a different independently valid authenticated message. Contract authentication remains required.

**Current assessment.** The frozen browser/indexer retain metadata, destination, selector and zero-value checks but no complete calldata-to-intent binding. Honest relayer construction is strongly bound. This can waste gas or confuse progress; no principal diversion or arbitrary mint is claimed.

**Source anchors.** `apps/web/transfer-actions.js:614-674`; `services/indexer/transfer-recovery.mjs:65-87`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** Current transfer-actions suite passed; exact missing browser binding established by static inspection. No malicious mainnet transaction.

**Production/release limit.** app.js and catalog match source; exact dependent-module rollout not fully attested. Current residual maps to F-13.

### 2026-10-24 / L-02 - A fixed 21,000 gas limit prevents native gas grants to code-bearing wallets

**Historical: Low. Current: Resolved original gas-estimation condition. Disposition: VERIFIED.**

**Original condition and boundary.** The sponsor always broadcast a native gift with gasLimit=21000. EIP-7702 delegated accounts and receiving contracts can execute code requiring more gas. Reservation preceded the failed transaction; its one-shot journal then required manual recovery. Optional sponsorship is active and the authenticated recipient executes receiving/delegation code requiring more than 21,000 gas. The original evidence used an actual isolated Prague delegation requiring 21,005 gas. No principal or mint-authorization bypass was alleged.

**Current assessment.** The worker estimates the exact sender, recipient and grant value before reserving a nonce. It accepts estimates from 21,000 through 100,000 gas, adds a rounded 20 percent margin, caps the resulting gas limit at 120,000 and checks the sponsor balance including that gas. This removes the fixed-EOA-budget assumption for supported recipients.

**Source anchors.** `services/managed-relay/gas-sponsor.mjs:191-215`; `services/managed-relay/gas-sponsor.mjs:219-223`.

**Correction history.** [xgr-interchain PR308](https://github.com/xgr-network/xgr-interchain/pull/308), merge `4daf33ccf38e2227f9b60015ed94b2e19c9c1038` (Exact bounded native-gift gas estimation before reservation. The PR describes L2 overhead; the same change also removes the original delegated-wallet fixed-limit condition.).

**Independent checks.** Two targeted tests pass through the actual sponsor entrypoint: exact-gift estimate 22005 produces gasLimit 26406 and value 1300000 wei; estimate 100001 returns unsafe-gas-estimate before any reservation. The RPC estimator and sender are mocked. The repository's static regression guard confirms estimation precedes reserveGrant, both bounds exist and fixed gasLimit:21000n is absent.

**Production/release limit.** No new real EIP-7702 or L2 gift transaction was sent. The original local Prague result establishes the historical trigger; current estimation-path behavior is verified with controlled RPC fixtures. Receiving wallets above the configured 100,000 estimate cap intentionally remain unsupported and fail closed. Receiver behavior may change between estimate and inclusion; failed or ambiguous sends still require journal recovery. That recovery gap is the separately discovered S-A02, not evidence the old fixed 21,000 limit remains.

### 2026-10-24 / L-03 - Inherited ownership transfer can collapse service-wallet and recovery-admin separation

**Historical: Low. Current: Low. Disposition: OPEN.**

**Original condition and boundary.** The role inequality is checked at initialization and service-wallet rotation, but not at both ownership transfer stages. A pending handover can also be invalidated by a later service-wallet change. Existing recovery owner intentionally or accidentally initiates the handover and the proposed owner accepts. The current service wallet or another unprivileged actor cannot force an unsolicited takeover.

**Current assessment.** The role inequality is checked at initialization and service-wallet rotation, but not at both ownership transfer stages. A pending handover can also be invalidated by a later service-wallet change. The online quote signer, sponsor and fee payee can also become recovery owner, eliminating independent key recovery after a later service-key compromise. No added authority to mint or unlock bridge principal.

**Source anchors.** `contracts/XITAExecutionGateway.sol:31,130-161`; `access/Ownable2Step.sol:35-37,52-55`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** PASS; constructor starts with distinct roles, inherited transfer and acceptance leave owner()==serviceWallet(). Local isolated contract test; no production role mutation. The untested alternate pending-owner/service-wallet ordering is a source-proven additional case, not claimed as independently executed.

**Production/release limit.** Different addresses do not prove independent key custody or hardware protection. Current residual maps to F-10.

### 2026-10-24 / L-04 - Deployment receipt promotion uses confirmation depth while claiming finality

**Historical: Low. Current: Low. Disposition: OPEN.**

**Original condition and boundary.** The verifier authenticates the current canonical receipt and runtime code but its acceptance rule only compares latest height to receipt height. Depth does not establish the chain's chosen safe/finalized boundary. A future deployment reaches the configured depth while still above the required finality boundary, is promoted, and subsequently loses canonicality in a reorganization.

**Current assessment.** The verifier authenticates the current canonical receipt and runtime code but its acceptance rule only compares latest height to receipt height. Depth does not establish the chain's chosen safe/finalized boundary. A prematurely published deployment catalog can bind to a creation later removed by reorganization, disrupting recovery and configured node bindings. This does not demonstrate any false current receipt.

**Source anchors.** `services/admin/deployment-ledger.mjs:107-167`; `config/chains/base/chain.json`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** PASS: actual verifyDeploymentReceipt accepts Base receipt block 100 at latest 112 with 13 confirmations even though fixture safe/finalized height is 64; recorded calls never query safe/finalized. Injected read-only RPC fixture, no actual reorganization or catalog publication. Independent current-chain receipt checks are separately documented by root.

**Production/release limit.** Current deployed code and configuration are independently checked in this audit; no future deployment, real reorganization, production journal crash or compiler equivalence is implied. Current residual maps to F-22.

### 2026-10-24 / L-05 - An orphaned empty lock file blocks deployment journal recovery after process death

**Historical: Low. Current: Low. Disposition: OPEN.**

**Original condition and boundary.** A persistent empty lock file is not tied to an operating-system process lock or verifiable live owner. Abrupt termination skips finally and leaves later processes unable to mutate the journal. Admin process terminates while the mutation lock is held. No external filesystem attacker is required.

**Current assessment.** A persistent empty lock file is not tied to an operating-system process lock or verifiable live owner. Abrupt termination skips finally and leaves later processes unable to mutate the journal. Later writes fail with EEXIST despite restart, blocking an unresolved wallet operation from normal recovery. Existing journal bytes remain; no double broadcast, principal loss or unauthorized transaction was shown.

**Source anchors.** `services/admin/deployment-intents.mjs:96-117`; `services/admin/deployment-intents.mjs:203-214`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** PASS: prepared intent, simulated orphaned empty lock, two fresh store objects; read still succeeds, attachHash throws EEXIST both times, journal stays byte-identical and lock survives. The exact post-crash filesystem state was constructed locally; no production process was killed, and no actual restart timing/failure distribution was measured.

**Production/release limit.** Current deployed code and configuration are independently checked in this audit; no future deployment, real reorganization, production journal crash or compiler equivalence is implied. Current residual maps to F-23.

### 2026-10-24 / L-06 - Paid-fee backfill rejects valid rows because canonical event identity fields are omitted

**Historical: Low. Current: Low. Disposition: OPEN.**

**Original condition and boundary.** storeVerifiedOperation requires event.messageId and event.txHash, but backfillPaidFeeTax constructs an event containing only block and log fields. Even a fully verified paid receipt is rejected by the shared provenance guard and counted as held. An indexed paid-adapter operation has positive interchain_fee_wei and a missing quote_nonce. Its receipt and canonical source block verify successfully. Ordinary new ingestion is a separate path and does not require this historical backfill.

**Current assessment.** The exact original omission remains in the frozen code. The actual current verifiedTransfer accepts the fixture and recovers quote nonce 4242, but the actual backfill returns verified=0 and held=1. The transaction executes BEGIN followed by ROLLBACK before any INSERT. This is a fee-booking/data-quality failure, not authorization of a payment or loss of bridge principal.

**Source anchors.** `services/indexer/transfer-index-worker.mjs:54-61`; `services/indexer/transfer-index-worker.mjs:494-524`; `services/indexer/transfer-index-worker.mjs:517-520`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** 1/1 targeted regression passes by reproducing the original defect. The matched historical evidence fixture was relocated to the isolated testbed and its safe-head response updated to satisfy the current finality precondition. Application source was unchanged; actual receipt verification and actual backfill/store functions were used with a recording database fixture.

**Production/release limit.** No production backlog was inspected. The defect is deterministic for qualifying rows under the frozen source, independent of whether such rows currently exist in production. Repeated sweeps cannot repair the omitted fields. Adding row.message_id and row.source_tx_hash to this already-verified event is the narrow corrective action, followed by a regression that reaches the successful store path. A separate selection limitation involving already non-null quote_nonce is not the original L-06 identity and must not substitute for it. Current residual maps to F-24.

### 2026-10-24 / L-07 - Dense historical event windows can permanently halt route indexing

**Historical: Low. Current: Low. Disposition: OPEN.**

**Original condition and boundary.** A complete but oversized event response is rejected while the unchanged block window is retried without adaptive splitting. A route/source has more actual operations than the configured window event bound; legitimate volume suffices. Synthetic malformed events were used only to exercise the early size guard in the new check.

**Current assessment.** The route scanner retains the size cap and no adaptive splitting; the grouped scanner scales the cap by route count but retains the same failure mode. The default worker groups routes, so the current shared cap is distinct from the original single-route threshold. Manual known-transaction recovery and announcements mitigate availability impact.

**Source anchors.** `services/indexer/transfer-index.mjs:236-286`; `services/indexer/transfer-index.mjs:348-360`; `services/indexer/transfer-index-worker.mjs:539-589`.

**Correction history.** [xgr-interchain PR300](https://github.com/xgr-network/xgr-interchain/pull/300), merge `b35a1a3e531081512fc51296404811decad6ffe8` (Grouped observation improves efficiency; does not add adaptive dense-window progress.).

**Independent checks.** Two additional isolated tests passed by reproducing the non-adaptive route and shared-source bounds. Not a live high-volume transfer test.

**Production/release limit.** No current dense-window production stall established. Current residual maps to F-25.

### 2026-10-24 / I-01 - Existing negative-test and compatibility-checker defects

**Historical: Informational. Current: Low (combined assurance drift). Disposition: OPEN.**

**Original condition and boundary.** A misplaced expected-revert is consumed by a helper constructor; a legacy compatibility checker does not recognize the intended hook receipt alias and enumerates only two chains. Running the existing checks; no adversary required.

**Current assessment.** The Solidity fixture still fails unchanged; an isolated corrected setup confirms the actual factory guard. The old checker still has the restrictive chain regex and direct component equality. Five UI assertions and one indexer assertion additionally drift from current catalog/behavior. These are test-assurance gaps, not demonstrated factory or hook exploits.

**Source anchors.** `test/XITAXGRHubTopologyV315.t.sol:82-93`; `tools/assert-xita-v320-compatible-deploy.mjs:13-19,84-95`; `.github/workflows/validate.yml`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** 103 Solidity tests:102 pass/1 fixture fail; isolated fixture validation passes. Full UI280:273 pass/5 stale assertions/2 missing-browser failures; indexer137:136 pass/1 stale assertion. Legacy checker condition statically inspected, not newly rerun.

**Production/release limit.** Testing quality and coverage do not attest deployed behavior. Current residual maps to F-14.

### 2026-10-24 / I-02 - Release workflow targets an obsolete versioning package path

**Historical: Informational. Current: Informational. Disposition: OPEN.**

**Original condition and boundary.** Linker -X flags target a package inconsistent with the module's imported versioning package; application version fields have empty defaults. A build uses the affected workflow. Go's independent VCS metadata is not controlled by these version strings.

**Current assessment.** The v3.3.8 release workflow still uses an incorrect linker package target. The downloaded published binary's version subcommand exited 0 and returned <none> for Release version, Git branch, Commit hash and Build time. Independent Go VCS metadata and downloaded digest match the frozen source; this is separate evidence from the broken application fields. Application self-report cannot establish provenance; correct published binary build info is not proof of per-validator installation.

**Source anchors.** `.github/workflows/release-light-v338.yml:124-134`; `versioning/versioning.go:9-15`; `command/version/version.go:1-30`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** Read-only published executable version subcommand Four application version fields <none>, exit 0; Go build metadata and checksum Frozen source SHA and vcs.modified=false

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No daemon start or installed host inspection. Current residual maps to F-27.

### 2026-10-24 / I-03 - Known compiler exposure SOL-2026-7 remains unexcluded for deployed artifacts

**Historical: Informational. Current: Informational. Disposition: OPEN.**

**Original condition and boundary.** The observed compiler version and enabled Yul optimizer fall within the advisory range. Actual miscompilation additionally requires specific intermediate-code address derivation/reassignment and runtime aliasing. Those conditions are not established for XITA; upstream Low is not a discovered Low-severity bridge vulnerability. Affected compiler/configuration and project-specific intermediate-code trigger conditions; applicability remains unproven.

**Current assessment.** The observed compiler version and enabled Yul optimizer fall within the advisory range. Actual miscompilation additionally requires specific intermediate-code address derivation/reassignment and runtime aliasing. Those conditions are not established for XITA; upstream Low is not a discovered Low-severity bridge vulnerability. An unresolved source-to-executable assurance boundary. Runtime correspondence and passing tests cannot exclude a compiler defect common to the source build and deployed bytecode. No confirmed miscompile or mint/unlock exploit.

**Source anchors.** `foundry.toml:11-16`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** No same-release compiler with the targeted fix, no L/E-disabled behavioral comparison, and no exhaustive equivalence analysis. Ordinary test coverage and general recompilation with a later version would not be definitive exclusion. 57 runtimes have no unexplained instruction differences after compiler-declared immutables and exact IPFS digest positions are separated. Metadata is not exactly reproduced. Exposed immutable bindings are checked in evidence/live/route-configuration.json.

**Production/release limit.** Current deployed code and configuration are independently checked in this audit; no future deployment, real reorganization, production journal crash or compiler equivalence is implied. Current residual maps to F-28.

### 2026-10-25 / H-01 - External RPC source evidence and correlated-provider trust

**Historical: High. Current: Medium. Disposition: OPEN.** Duplicate mapping: 2026-10-24/H-01.

**Original condition and boundary.** The original 24 October H-01 condition included common external RPC evidence for XGR. By the 25 October baseline, native XGR verification had moved to locally committed state and external-source verification used matching operator-labelled witnesses. H-01 remained High in that reassessment because correlated external witnesses still constituted a shared trust dependency. Its historical severity is preserved; the current residual assessment is Medium with the stated operational conditions. Control over source evidence consumed by enough otherwise honest signers; a malicious relayer alone is insufficient. Currently external evidence needs two matching operator-labelled complete witnesses, while native XGR uses locally committed state.

**Current assessment.** Each external witness is pinned to one endpoint for the complete receipt/route/FeeVault verification; exact block, transaction, log index, message, route and fee fields must match. One successful operator, duplicate labels or two disagreeing observations cannot reach the threshold. Any matching pair of distinct labels returns immediately. An earlier disagreement is not a global conflict veto and all configured providers need not be queried. Native XGR uses its synchronized local committed chain. L2 source evidence requires safe finality with numeric canonical hash equality and no latest fallback. Operator labels do not establish upstream independence. Two correlated matching views can affect every signer. This is not a provider-independent header/receipt inclusion proof; L2 safe is not final Ethereum settlement.

**Source anchors.** `interchain/config.go:47-71`; `interchain/evm/rpc_evidence_quorum.go:31-113`; `interchain/runtime/iln_direct_signing.go:27-68`; `interchain/runtime/iln_direct_signing.go:95-135`; `interchain/evm/finality.go:17-62`; `audits/H01_RPC_WITNESS_SECURITY_EVIDENCE.md`.

**Correction history.** [xgr-node PR58](https://github.com/xgr-network/xgr-node/pull/58), merge `b2c3bb26b9efff774e9d16a91c212d71526b59e2` (Merged mitigation is present; correlated external-source trust remains); [xgr-node PR59](https://github.com/xgr-network/xgr-node/pull/59), merge `39175b868dfd39da17be9d6a87de87273c6b85bf` (Merged mitigation is present; correlated external-source trust remains); [xgr-node PR62](https://github.com/xgr-network/xgr-node/pull/62), merge `0184eaec64a4634c5604fa734652afe13cb8feb6` (Merged mitigation is present; correlated external-source trust remains).

**Independent checks.** TestIndependentSourceWitnessRequiresExactBlockAndReceipt PASS (Exact witness equality.); TestTwoIndependentOperatorsWithFailover PASS (Operator threshold and failover.); TestOneOperatorAndConflictingProvidersFailClosed PASS (One surviving operator and a conflicting pair reject; not evidence of a global conflict veto.); TestSafeFinalityNoFallbackToLatest PASS (Finality policy.); TestReceiptMustMatchFinalizedCanonicalBlockHash PASS (Canonical block binding.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. The later-added first-honest-disagreement/next-matching-pair case was not run after the automated interruption; current behavior follows static control flow. No real-provider compromise, forged live receipt or production mint was created. Current residual maps to F-05.

### 2026-10-25 / M-04 - Unbounded RPC can block failover and orderly worker shutdown

**Historical: Medium. Current: Medium. Disposition: OPEN.** Duplicate mapping: 2026-10-24/M-04.

**Original condition and boundary.** In the original baseline, an established remote RPC call could wait indefinitely, including while a chain-selection mutex was held, preventing failover and orderly shutdown. A stalled provider or network was sufficient; no flood was required.

**Current assessment.** boundedILNRPC read/evidence calls use real context cancellation, twelve-second request/four-second dial timeouts and a response limit; Worker.Close cancels that shared context. SubmitMembership and SubmitILNGovernance select a verified URL, then create txrelayer.NewTxRelayer without injecting the bounded client or worker shutdown context. Both run preflight reads through relayer.Client and then SendTransaction. The node-owned txrelayer creates its own legacy jsonrpc.NewClient. The pinned ethgo HTTP transport constructs a fasthttp client without read/write deadlines and calls Do; those defaults are unlimited. Its Close method has no cancellation effect. WithReceiptTimeout changes the sleep between receipt polls, not the timeout of GetTransactionReceipt or any other HTTP call. These are reachable worker paths: governanceExecuteLoop synchronously calls executeGovernanceJob and is part of the WaitGroup; the main loop calls tick -> trySubmissions -> trySubmit -> SubmitMembership. Worker.Close waits for them; IBFT.Close invokes it before closing the syncer. Separately, chain-selection locks still span bounded provider I/O, finality polling can continue to five minutes after cancellation, and native receipt polling has a two-minute outer deadline without the worker shutdown context. Unbounded external submission/preflight I/O can still hold a worker and orderly shutdown despite read-side cancellation. Per-call or polling-loop limits on other clients do not impose deadlines on this separate transport. No live consensus stall is asserted. Current residual prerequisites: an authorized governance execution or eligible membership preflight/submission is active against an external chain and its separate legacy transport stalls. Actual consensus halt was not demonstrated.

**Source anchors.** `interchain/evm/rpc_transport.go:23-125`; `interchain/evm/rpc_failover.go:231-284`; `interchain/runtime/worker.go:325-348`; `interchain/evm/finality.go:64-86`; `consensus/ibft/interchain_runtime.go:218-238`; `interchain/runtime/governance_execute.go:24-47`; `interchain/runtime/governance_execute.go:75-83`; `interchain/evm/iln_governance_submit.go:130-153`; `interchain/evm/client.go:400-448`; `txrelayer/txrelayer.go:61-80`; `txrelayer/txrelayer.go:95-135`; `txrelayer/txrelayer.go:256-275`; `interchain/runtime/worker.go:351-372`; `interchain/runtime/worker.go:446-453`; `interchain/runtime/worker.go:1070-1082`; `interchain/runtime/worker.go:1168-1183`; `consensus/ibft/ibft.go:688-700`; `go.mod:60-63`; `go.mod:240-243`.

**Correction history.** [xgr-node PR63](https://github.com/xgr-network/xgr-node/pull/63), merge `fd39a0fb4d20163c6a6d93cb8cf5dc25f017f188` (PR63 corrects bounded read/evidence transport; external txrelayer submission/preflight remains outside that cancellation scope.).

**Independent checks.** TestILNRPCRequestCancellationOnWorkerShutdown PASS (Cancels only a boundedILNRPC parent context during mock HTTP I/O. Does not exercise txrelayer, external membership/governance submission, or complete Worker.Close.); TestILNRPCRejectsOversizedResponseAndMismatchedID PASS (Transport size and response-identity checks.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No new tests or transactions. No deliberately hung txrelayer request or full lifecycle shutdown reproduction was run; the conclusion is current-source and pinned-dependency static analysis. Current residual maps to F-29.

### 2026-10-25 / M-05 - Interchain work is not completely bounded inside the validator process

**Historical: Medium. Current: Medium. Disposition: OPEN.** Duplicate mapping: 2026-10-24/M-05.

**Original condition and boundary.** Per-message goroutines, expensive proof acquisition before authentication and governance proposals without total count/maximum future lifetime limits leave aggregate work and persistence unbounded. An admitted peer submits syntactically acceptable frames. Proposals must satisfy current source/set checks. Interchain shares process and host resources with the regular validator.

**Current assessment.** Direct checkpoint votes call full source verification before voter membership, eligibility and signature checks. Direct vote and quorum-hint work lacks comprehensive pre-I/O global/per-peer admission. Some other frame types are throttled. Gossip starts a goroutine per delivered message. Governance proposals reject expired payloads/duplicates but have no global count/disk or maximum-future-expiry bound before insertion/persistence. Response/connection/time limits and batching reduce cost without bounding total admitted work. Separation from synchronous IBFT verification hooks does not establish CPU, memory, RPC or disk isolation. No actual IBFT halt or invalid IBFT state was demonstrated.

**Source anchors.** `network/gossip.go:108-122`; `interchain/runtime/worker.go:830-880`; `interchain/runtime/iln_checkpoint.go:167-201`; `interchain/runtime/iln_quorum_request.go:211-238`; `interchain/runtime/governance.go:201-240`; `interchain/runtime/iln_storage.go:123-134`; `interchain/evm/rpc_transport.go:27-58`.

**Correction history.** [xgr-node PR63](https://github.com/xgr-network/xgr-node/pull/63), merge `fd39a0fb4d20163c6a6d93cb8cf5dc25f017f188` (Partial transport/batching/completed-quorum improvements; no complete aggregate admission fix); [xgr-node PR75](https://github.com/xgr-network/xgr-node/pull/75), merge `9a00ff7d30c602e2eedb0b2ba3ff988c039f553c` (Partial transport/batching/completed-quorum improvements; no complete aggregate admission fix).

**Independent checks.** TestILNRPCRejectsOversizedResponseAndMismatchedID PASS (Per-response bound, not aggregate isolation.); TestILNCompletedQuorumVerificationRejectsForgedAndStale PASS (Proof validity, not aggregate workload.); existing_race PASS (102 existing race tests; no workload saturation or consensus-latency assertion.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No live P2P flood, saturation, consensus-halt test or new attack-oriented test after the interruption. Current residual maps to F-03.

### 2026-10-25 / M-06 - Unresolvable route hints can indefinitely crowd discovery progress

**Historical: Medium. Current: Resolved original condition. Disposition: VERIFIED.** Duplicate mapping: 2026-10-24/M-06.

**Original condition and boundary.** The first eight sorted hint files were repeatedly selected; unresolved/unknown hints remained without a lease and could indefinitely starve later valid hints in the bounded admission queue. Unresolvable public hints precede legitimate later entries. No quorum is needed to create a hint; event discovery/gossip remain alternate paths.

**Current assessment.** Hints sort by retry mtime/name and failed attempts rotate to the back. A fixed fifteen-minute first-seen lease cannot be renewed by retry rotation; legacy lease admission is synced. Unknown chain pairs, invalid names and conclusively noncanonical routes are removed; transient failures remain retryable. Eight-per-tick work bound remains while later legitimate hints can progress. Closure is for route-hint discovery only, not the separate fixed-order observer retry queue (N-01/NODE-A-04).

**Source anchors.** `interchain/runtime/iln_discovery.go:161-202`; `interchain/runtime/iln_discovery.go:209-272`; `interchain/runtime/iln_discovery_test.go:287-356`.

**Correction history.** [xgr-node PR73](https://github.com/xgr-network/xgr-node/pull/73), merge `7b8c88a172cb2d7f14af785955f476981bcfb582` (Exact original fairness/lease correction).

**Independent checks.** TestILNHintQueueCannotStarveValidRouteBehindEightInvalidNames PASS (Valid later hint served despite unusable earlier hints.); TestILNHintQueueTransientRPCFailureRotatesAndPreservesOriginalLease PASS (Rotation preserves immutable lease.); TestILNHintDiscoveryRequiresCanonicalRegistryProof PASS (Hint progress does not confer authorization.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No live hint-queue flooding.

### 2026-10-25 / L-01 - Wallet recovery does not bind Process calldata to the selected message

**Historical: Low. Current: Low. Disposition: OPEN.** Duplicate mapping: 2026-10-24/L-01.

**Original condition and boundary.** Returned metadata is checked but the encoded message inside process calldata is not independently decoded and hashed against wallet intent. Compromised proof response plus a different independently valid authenticated message. Contract authentication remains required.

**Current assessment.** The frozen browser/indexer retain metadata, destination, selector and zero-value checks but no complete calldata-to-intent binding. Honest relayer construction is strongly bound. This can waste gas or confuse progress; no principal diversion or arbitrary mint is claimed.

**Source anchors.** `apps/web/transfer-actions.js:614-674`; `services/indexer/transfer-recovery.mjs:65-87`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** Current transfer-actions suite passed; exact missing browser binding established by static inspection. No malicious mainnet transaction.

**Production/release limit.** app.js and catalog match source; exact dependent-module rollout not fully attested. Current residual maps to F-13.

### 2026-10-25 / L-02 - A fixed 21,000 gas limit can fail native gifts on chains with extra execution overhead

**Historical: Low. Current: Resolved original gas-estimation condition. Disposition: VERIFIED.** Duplicate mapping: 2026-10-24/L-02. The v2 public register describes a later chain-specific native-gas failure under the same label; preserve both descriptions. PR308 addresses both estimation boundaries.

**Original condition and boundary.** The old native-gift transaction supplied a fixed 21,000 gas limit even when the destination-chain estimate for the exact transfer was higher. Optional sponsorship is active, a paid immutable grant is due, and the destination requires more than 21,000 gas for the exact native gift.

**Current assessment.** The exact transfer is estimated before nonce reservation and sent with a bounded 20 percent margin. Current entrypoint tests demonstrate the transaction can carry more than 21,000 gas and rejects abnormal estimates before reserving funds.

**Source anchors.** `services/managed-relay/gas-sponsor.mjs:191-223`.

**Correction history.** [xgr-interchain PR308](https://github.com/xgr-network/xgr-interchain/pull/308), merge `4daf33ccf38e2227f9b60015ed94b2e19c9c1038`.

**Independent checks.** The same two gas-estimation tests cited for 24-Oct L-02 apply. They are reused evidence, not two additional executed tests.

**Production/release limit.** Destination-specific live gift acceptance was not performed; sponsor readiness was false in the read-only live observation. Estimate-to-inclusion changes and definitively failed or ambiguous transaction recovery remain operational concerns; no claim is made that every possible recipient fits the explicit gas policy.

### 2026-10-25 / L-03 - Inherited ownership transfer can collapse service-wallet and recovery-admin separation

**Historical: Low. Current: Low. Disposition: OPEN.** Duplicate mapping: 2026-10-24/L-03.

**Original condition and boundary.** The role inequality is checked at initialization and service-wallet rotation, but not at both ownership transfer stages. A pending handover can also be invalidated by a later service-wallet change. Existing recovery owner intentionally or accidentally initiates the handover and the proposed owner accepts. The current service wallet or another unprivileged actor cannot force an unsolicited takeover.

**Current assessment.** The role inequality is checked at initialization and service-wallet rotation, but not at both ownership transfer stages. A pending handover can also be invalidated by a later service-wallet change. The online quote signer, sponsor and fee payee can also become recovery owner, eliminating independent key recovery after a later service-key compromise. No added authority to mint or unlock bridge principal.

**Source anchors.** `contracts/XITAExecutionGateway.sol:31,130-161`; `access/Ownable2Step.sol:35-37,52-55`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** PASS; constructor starts with distinct roles, inherited transfer and acceptance leave owner()==serviceWallet(). Local isolated contract test; no production role mutation. The untested alternate pending-owner/service-wallet ordering is a source-proven additional case, not claimed as independently executed.

**Production/release limit.** Different addresses do not prove independent key custody or hardware protection. Current residual maps to F-10.

### 2026-10-25 / L-04 - Deployment receipt promotion uses confirmation depth while claiming finality

**Historical: Low. Current: Low. Disposition: OPEN.** Duplicate mapping: 2026-10-24/L-04.

**Original condition and boundary.** The verifier authenticates the current canonical receipt and runtime code but its acceptance rule only compares latest height to receipt height. Depth does not establish the chain's chosen safe/finalized boundary. A future deployment reaches the configured depth while still above the required finality boundary, is promoted, and subsequently loses canonicality in a reorganization.

**Current assessment.** The verifier authenticates the current canonical receipt and runtime code but its acceptance rule only compares latest height to receipt height. Depth does not establish the chain's chosen safe/finalized boundary. A prematurely published deployment catalog can bind to a creation later removed by reorganization, disrupting recovery and configured node bindings. This does not demonstrate any false current receipt.

**Source anchors.** `services/admin/deployment-ledger.mjs:107-167`; `config/chains/base/chain.json`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** PASS: actual verifyDeploymentReceipt accepts Base receipt block 100 at latest 112 with 13 confirmations even though fixture safe/finalized height is 64; recorded calls never query safe/finalized. Injected read-only RPC fixture, no actual reorganization or catalog publication. Independent current-chain receipt checks are separately documented by root.

**Production/release limit.** Current deployed code and configuration are independently checked in this audit; no future deployment, real reorganization, production journal crash or compiler equivalence is implied. Current residual maps to F-22.

### 2026-10-25 / L-05 - An orphaned empty lock file blocks deployment journal recovery after process death

**Historical: Low. Current: Low. Disposition: OPEN.** Duplicate mapping: 2026-10-24/L-05.

**Original condition and boundary.** A persistent empty lock file is not tied to an operating-system process lock or verifiable live owner. Abrupt termination skips finally and leaves later processes unable to mutate the journal. Admin process terminates while the mutation lock is held. No external filesystem attacker is required.

**Current assessment.** A persistent empty lock file is not tied to an operating-system process lock or verifiable live owner. Abrupt termination skips finally and leaves later processes unable to mutate the journal. Later writes fail with EEXIST despite restart, blocking an unresolved wallet operation from normal recovery. Existing journal bytes remain; no double broadcast, principal loss or unauthorized transaction was shown.

**Source anchors.** `services/admin/deployment-intents.mjs:96-117`; `services/admin/deployment-intents.mjs:203-214`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** PASS: prepared intent, simulated orphaned empty lock, two fresh store objects; read still succeeds, attachHash throws EEXIST both times, journal stays byte-identical and lock survives. The exact post-crash filesystem state was constructed locally; no production process was killed, and no actual restart timing/failure distribution was measured.

**Production/release limit.** Current deployed code and configuration are independently checked in this audit; no future deployment, real reorganization, production journal crash or compiler equivalence is implied. Current residual maps to F-23.

### 2026-10-25 / L-06 - Paid-fee backfill rejects valid rows because canonical event identity fields are omitted

**Historical: Low. Current: Low. Disposition: OPEN.** Duplicate mapping: 2026-10-24/L-06.

**Original condition and boundary.** storeVerifiedOperation requires event.messageId and event.txHash, but backfillPaidFeeTax constructs an event containing only block and log fields. Even a fully verified paid receipt is rejected by the shared provenance guard and counted as held. An indexed paid-adapter operation has positive interchain_fee_wei and a missing quote_nonce. Its receipt and canonical source block verify successfully. Ordinary new ingestion is a separate path and does not require this historical backfill.

**Current assessment.** The exact original omission remains in the frozen code. The actual current verifiedTransfer accepts the fixture and recovers quote nonce 4242, but the actual backfill returns verified=0 and held=1. The transaction executes BEGIN followed by ROLLBACK before any INSERT. This is a fee-booking/data-quality failure, not authorization of a payment or loss of bridge principal.

**Source anchors.** `services/indexer/transfer-index-worker.mjs:54-61`; `services/indexer/transfer-index-worker.mjs:494-524`; `services/indexer/transfer-index-worker.mjs:517-520`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** 1/1 targeted regression passes by reproducing the original defect. The matched historical evidence fixture was relocated to the isolated testbed and its safe-head response updated to satisfy the current finality precondition. Application source was unchanged; actual receipt verification and actual backfill/store functions were used with a recording database fixture.

**Production/release limit.** No production backlog was inspected. The defect is deterministic for qualifying rows under the frozen source, independent of whether such rows currently exist in production. Repeated sweeps cannot repair the omitted fields. Adding row.message_id and row.source_tx_hash to this already-verified event is the narrow corrective action, followed by a regression that reaches the successful store path. A separate selection limitation involving already non-null quote_nonce is not the original L-06 identity and must not substitute for it. Current residual maps to F-24.

### 2026-10-25 / L-07 - Dense historical event windows can permanently halt route indexing

**Historical: Low. Current: Low. Disposition: OPEN.** Duplicate mapping: 2026-10-24/L-07.

**Original condition and boundary.** A complete but oversized event response is rejected while the unchanged block window is retried without adaptive splitting. A route/source has more actual operations than the configured window event bound; legitimate volume suffices. Synthetic malformed events were used only to exercise the early size guard in the new check.

**Current assessment.** The route scanner retains the size cap and no adaptive splitting; the grouped scanner scales the cap by route count but retains the same failure mode. The default worker groups routes, so the current shared cap is distinct from the original single-route threshold. Manual known-transaction recovery and announcements mitigate availability impact.

**Source anchors.** `services/indexer/transfer-index.mjs:236-286`; `services/indexer/transfer-index.mjs:348-360`; `services/indexer/transfer-index-worker.mjs:539-589`.

**Correction history.** [xgr-interchain PR300](https://github.com/xgr-network/xgr-interchain/pull/300), merge `b35a1a3e531081512fc51296404811decad6ffe8` (Grouped observation improves efficiency; does not add adaptive dense-window progress.).

**Independent checks.** Two additional isolated tests passed by reproducing the non-adaptive route and shared-source bounds. Not a live high-volume transfer test.

**Production/release limit.** No current dense-window production stall established. Current residual maps to F-25.

### 2026-10-25 / I-01 - Existing negative-test and compatibility-checker defects

**Historical: Informational. Current: Low (combined assurance drift). Disposition: OPEN.** Duplicate mapping: 2026-10-24/I-01.

**Original condition and boundary.** A misplaced expected-revert is consumed by a helper constructor; a legacy compatibility checker does not recognize the intended hook receipt alias and enumerates only two chains. Running the existing checks; no adversary required.

**Current assessment.** The Solidity fixture still fails unchanged; an isolated corrected setup confirms the actual factory guard. The old checker still has the restrictive chain regex and direct component equality. Five UI assertions and one indexer assertion additionally drift from current catalog/behavior. These are test-assurance gaps, not demonstrated factory or hook exploits.

**Source anchors.** `test/XITAXGRHubTopologyV315.t.sol:82-93`; `tools/assert-xita-v320-compatible-deploy.mjs:13-19,84-95`; `.github/workflows/validate.yml`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** 103 Solidity tests:102 pass/1 fixture fail; isolated fixture validation passes. Full UI280:273 pass/5 stale assertions/2 missing-browser failures; indexer137:136 pass/1 stale assertion. Legacy checker condition statically inspected, not newly rerun.

**Production/release limit.** Testing quality and coverage do not attest deployed behavior. Current residual maps to F-14.

### 2026-10-25 / I-02 - Release workflow targets an obsolete versioning package path

**Historical: Informational. Current: Informational. Disposition: OPEN.** Duplicate mapping: 2026-10-24/I-02.

**Original condition and boundary.** Linker -X flags target a package inconsistent with the module's imported versioning package; application version fields have empty defaults. A build uses the affected workflow. Go's independent VCS metadata is not controlled by these version strings.

**Current assessment.** The v3.3.8 release workflow still uses an incorrect linker package target. The downloaded published binary's version subcommand exited 0 and returned <none> for Release version, Git branch, Commit hash and Build time. Independent Go VCS metadata and downloaded digest match the frozen source; this is separate evidence from the broken application fields. Application self-report cannot establish provenance; correct published binary build info is not proof of per-validator installation.

**Source anchors.** `.github/workflows/release-light-v338.yml:124-134`; `versioning/versioning.go:9-15`; `command/version/version.go:1-30`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** Read-only published executable version subcommand Four application version fields <none>, exit 0; Go build metadata and checksum Frozen source SHA and vcs.modified=false

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No daemon start or installed host inspection. Current residual maps to F-27.

### 2026-10-25 / I-03 - Known compiler exposure SOL-2026-7 remains unexcluded for deployed artifacts

**Historical: Informational. Current: Informational. Disposition: OPEN.** Duplicate mapping: 2026-10-24/I-03.

**Original condition and boundary.** The observed compiler version and enabled Yul optimizer fall within the advisory range. Actual miscompilation additionally requires specific intermediate-code address derivation/reassignment and runtime aliasing. Those conditions are not established for XITA; upstream Low is not a discovered Low-severity bridge vulnerability. Affected compiler/configuration and project-specific intermediate-code trigger conditions; applicability remains unproven.

**Current assessment.** The observed compiler version and enabled Yul optimizer fall within the advisory range. Actual miscompilation additionally requires specific intermediate-code address derivation/reassignment and runtime aliasing. Those conditions are not established for XITA; upstream Low is not a discovered Low-severity bridge vulnerability. An unresolved source-to-executable assurance boundary. Runtime correspondence and passing tests cannot exclude a compiler defect common to the source build and deployed bytecode. No confirmed miscompile or mint/unlock exploit.

**Source anchors.** `foundry.toml:11-16`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** No same-release compiler with the targeted fix, no L/E-disabled behavioral comparison, and no exhaustive equivalence analysis. Ordinary test coverage and general recompilation with a later version would not be definitive exclusion. 57 runtimes have no unexplained instruction differences after compiler-declared immutables and exact IPFS digest positions are separated. Metadata is not exactly reproduced. Exposed immutable bindings are checked in evidence/live/route-configuration.json.

**Production/release limit.** Current deployed code and configuration are independently checked in this audit; no future deployment, real reorganization, production journal crash or compiler equivalence is implied. Current residual maps to F-28.

### 2026-10-25 / N-01 - One failed operation can stall the shared source-observer cursor

**Historical: High. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** One failed source operation in a shared scan window prevented progress of route cursors and could hold healthy transfers behind the same repeated work. A malformed or temporarily unverifiable operation is observed in a shared source scan. Impact is recovery/liveness, not authority to sign false source evidence.

**Current assessment.** Healthy siblings are processed in the same window. Failed observations enter an immutable file- and directory-synced retry journal before the cursor can pass them. Every retry invokes full current proof/signing checks. Journal content is a hint, not authorization. Journal limits are 4096 records per route, twenty-four retries per source poll and two per route, with thirty-second minimum retry interval. Routes are visited in fixed sorted order; at least twelve earlier routes with two continuously eligible records each can consume the budget before a late route is attempted. Corruption/capacity failures propagate at source-group scope; failed work is retained rather than discarded. The original blocker is materially mitigated; autonomous fairness and journal-failure isolation remain incomplete. The demonstrated scheduler boundary requires a later route behind at least twelve earlier routes with two continuously eligible records each; it is not an observed stall in the current smaller route set.

**Source anchors.** `interchain/runtime/iln_observer_worker.go:128-161`; `interchain/runtime/iln_observer_worker.go:180-210`; `interchain/runtime/iln_observer_retry.go:17-25`; `interchain/runtime/iln_observer_retry.go:71-105`; `interchain/runtime/iln_observer_retry.go:141-199`.

**Correction history.** [xgr-node PR72](https://github.com/xgr-network/xgr-node/pull/72), merge `ecb2841ed622b75a3c4d96cabacc7a3adb3de3e5` (Substantial shared-window and durable admission improvement; not full fair recovery/capacity isolation).

**Independent checks.** TestSharedObserverContinuesSigningHealthySiblingButNeverAdvancesFailedWindow PASS (Current assertions actually require cursor advancement after durable retry admission and a retained failed-message record. The old name is not interpreted literally.); TestObserverRetryDurableDedupConflictAndReverification PASS (Immutable deduplication, conflict rejection and proof re-verification.); TestObserverRetryRejectsCorruptJournalWithoutSigning PASS (Corruption cannot authorize a signature.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No disk power-loss or production large-route recovery test. No Phase B adversarial reproduction; safe Phase A scheduler findings are already in the frozen report. Current residual maps to F-04.

### 2026-10-25 / N-02 - Valid multi-Dispatch receipts can be rejected

**Historical: High. Current: Resolved original condition. Disposition: VERIFIED.**

**Original condition and boundary.** Unrelated valid canonical Mailbox dispatches in the same successful source transaction could cause rejection of the selected fee-qualified operation. One successful source transaction dispatches multiple legitimate messages. The issue blocks liveness; it does not demonstrate signature bypass.

**Current assessment.** Dispatch bytes are decoded and hashed; unrelated messages are ignored before selected-message route-topic checks. Exactly one matching Gateway operation and bound canonical Dispatch remain required. Same-message topic conflicts and duplicated matching Gateway/Dispatch events reject. Current verifier behavior verified locally; no production installation claim. Malformed canonical logs may remain fail-closed under the verifier's policy.

**Source anchors.** `interchain/evm/iln_direct_operation.go:27-85`.

**Correction history.** [xgr-node PR71](https://github.com/xgr-network/xgr-node/pull/71), merge `2a001b61b710f2a058eda7e66404b58b9a6b2ac5` (Matching-message dispatch selection and duplicate/topic-conflict regressions).

**Independent checks.** TestDirectReceiptAcceptsUnrelatedCanonicalDispatches PASS (Positive multi-dispatch receipt.); TestDirectReceiptRejectsSameMessageWithConflictingDispatchTopics PASS (Same-message router/destination conflict.); TestDirectReceiptRejectsDuplicatedGatewayOrMailboxEvents PASS (Selected operation/dispatch uniqueness.); TestDirectReceiptFailsOnMissingOrDuplicateGatewayOperation PASS (Missing or duplicate matching Gateway operation.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No live-chain batched transfer submitted.

### 2026-10-25 / N-03 - Pending recovery work can be deleted before durable replacement

**Historical: Medium. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** Pending recovery work may be deleted before durable replacement for the current set exists. Already-advanced source cursors can leave it without automatic rediscovery. An undelivered persisted vote sees an absent route after restart or a destination-set rotation; replacement signing then fails/is interrupted. Temporary source/destination unavailability or lost synchronization suffices.

**Current assessment.** rebroadcastILNCheckpointVotes deletes a persisted vote immediately when its route is absent. On set rotation, it deletes the old vote before calling signDirectILNMessage; an error only logs waiting and creates no replacement recovery record in this branch. After thirty days, undelivered quorum archives may be pruned when fresh source verification suggests regeneration is possible; canRegenerateILNQuorum does not persist a replacement or recovery job. The failed-observation journal added for N-01 is not invoked by these rotation/pruning paths. Recovery can depend on another node's retained archive or another operator/user hint despite already-paid source work. No principal loss or false BLS authorization demonstrated.

**Source anchors.** `interchain/runtime/iln_checkpoint.go:131-164`; `interchain/runtime/iln_checkpoint.go:362-407`; `interchain/runtime/iln_storage.go:78-120`; `interchain/runtime/iln_direct_signing.go:95-135`; `interchain/runtime/iln_observer_worker.go:137-149`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** TestILNStoragePrunesOnlyProvenDeliveredQuorums PASS (Young pending/unverifiable old pending data retained; proven delivered removed. Does not cover re-verifiable old pending archive deletion without a replacement.); TestILNDiscoveryRestoresRouteAfterWorkerRestart PASS (Clean catalog restart recovery, not lost vote handoff.); TestILNCompletedQuorumVerificationRejectsForgedAndStale PASS (Aggregate integrity/current set, not durable pending handoff.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No destructive restart, rotation, interrupted handoff or power-loss reproduction. Original detailed reproduction is unavailable; current conclusion is static order/deletion analysis. Current residual maps to F-20.

### 2026-10-25 / N-04 - Incomplete successful discovery responses can advance durable cursors

**Historical: Medium. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** Returned events are checked, but a successful incomplete/empty single-provider log list is accepted as a completed range. Cursors advance past omitted events. One external source discovery provider returns a successful partial/empty log list for a window containing relevant events. Signing actually found messages still requires independent full source witnesses.

**Current assessment.** ScanILNMultiGatewayWindow retries recognized provider errors, but returns immediately on the first successful log response. scanSharedILNSource advances all relevant route cursors after handling returned events only; missing events create no retry records. RouteAdded discovery has the same single-provider completeness dependency before durable cursor progress. Native XGR scans locally committed blocks/receipts and does not use external discovery for this source. Independent witness checking protects authenticity of found messages, not completeness of discovery. Other nodes, peer hints and explicit public recovery mitigate liveness but do not prove autonomous reconciliation.

**Source anchors.** `interchain/evm/iln_multi_gateway_scan.go:42-100`; `interchain/evm/iln_multi_gateway_scan.go:103-138`; `interchain/runtime/iln_observer_worker.go:110-155`; `interchain/evm/iln_discovery.go:39-63`; `interchain/runtime/iln_discovery.go:285-321`.

**Correction history.** No corrective merge closing the condition was identified in the inspected history.

**Independent checks.** TestSharedILNObserverReducesExternalRequestsAndPreservesDurableCursors PASS (Normal batching/cursor behavior; not successful omitted-log completeness.); TestSharedILNObserverLateRouteBackfillsWithoutRepeatingExistingVotes PASS (Late-route backfill, not repair of already-advanced omission.); TestILNDiscoveryRetryOnTransientRegistryFailure PASS (Explicit-error retry; successful omission is distinct.)

**Production/release limit.** Published v3.3.8 download digest and embedded VCS revision match the frozen source. Actual installed validator binary hashes remain unverified. No new omitted-log adversarial test or live provider manipulation. Primary historical procedure/evidence ZIP unavailable. Current residual maps to F-21.

### 2026-10-25 / N-05 - Two-hop sponsorship can deadlock before the final-destination gas grant exists

**Historical: High. Current: Resolved original circular stage dependency. Disposition: VERIFIED.**

**Original condition and boundary.** The zero-native-balance two-hop journey required progress toward TX3 before a later grant became payable, while that progress itself required the destination gas whose grant had not yet been issued. The second-hop message/stage dependency created a circular liveness prerequisite. A valid paid two-hop source quote promises gas, the wallet lacks the required downstream native gas, and the service follows its original stage-dependent grant schedule. No compromised actor is necessary.

**Current assessment.** All immutable positive quote grants are selected and authenticated from finalized TX1. The first-delivery, hub-onward and final-delivery stages do not require child operation records, TX2 delivery or TX3 execution. The normal wallet path requires confirmed upfront grants before TX2, while an exactly matched immutable zero-grant quote is allowed to continue without waiting for the sponsor.

**Source anchors.** `services/managed-relay/gas-sponsor.mjs:25-40`; `services/managed-relay/gas-sponsor.mjs:61-78`; `services/managed-relay/gas-sponsor.mjs:100-134`; `services/managed-relay/gas-sponsor.mjs:451-470`; `apps/web/app.js:530-567`; `apps/web/transfer-sponsor-evidence.js:6-25`.

**Correction history.** [xgr-interchain PR309](https://github.com/xgr-network/xgr-interchain/pull/309), merge `ab6d98395824beb71733577b0f49b2d167ab2761` (Initial parent-authenticated final-delivery promise at continuation; later superseded by the fully upfront schedule.); [xgr-interchain PR311](https://github.com/xgr-network/xgr-interchain/pull/311), merge `f65cdf89b55953778e2c5c6a50f341d22d3b7052` (All original signed grants become due immediately after independently verified TX1; wallet continuation gates on those grants.).

**Independent checks.** Executed the exact candidate SQL extracted from frozen runSponsorSweep against the actual PostgreSQL engine and current schemas. One paid two-hop parent with three immutable commitments and zero child operations yields all three grant stages immediately. Stage-eligibility, immutable quote binding, grant tampering and reserve-before-payment tests pass in the 92-test managed-relay suite. 3/3 wallet evidence tests pass: paid fees alone do not imply grants, positive promises remain gated, and only exact immutable zero-grant evidence permits ungated continuation.

**Production/release limit.** No paid empty-gas one-hop or two-hop production journey was executed. Live sponsor availability was false. Source closure of N-05 therefore does not establish commercial end-to-end readiness. The old circular dependency is removed. A distinct boundary remains: an external permissionless TX2 completion before all grants are issued makes later grants ineligible because the parent must remain undelivered. The ordinary UI prevents this sequence, but other clients can perform it. S-A02 nonce stranding and S-A03 cross-chain RPC aborts are also separate service-availability findings; they do not recreate the original child-message prerequisite.

### 2026-10-25 / N-06 - Unpaid public quotes can consume the rolling daily sponsor budget

**Historical: Medium. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** An unauthenticated public caller can obtain unused signed quotes whose positive gas commitments consume the finite sponsor budget even though no source fee is paid. Honest quotes then fail capacity admission. Sponsorship and positive quote issuance are enabled and sufficiently funded. Enough valid requests with native deficits are admitted to consume the available commitment budget; cheap replacement payer addresses and, if needed, multiple client IPs satisfy the bounded per-identity limits. The attacker does not need to broadcast TX1 or receive the gas grant.

**Current assessment.** The holding period is materially reduced, but the original public-reservation resource-exhaustion mechanism remains. Quote admission still records an unpaid positive promise and charges spentToday plus all unsettled promises to daily capacity. Request throttles allow four attempts per IP, two per payer and 120 globally per minute. The caller supplies a payer address without proving control or paying a reservation cost. Repeated admitted requests can keep a finite budget occupied; this is a conditional capacity attack, not a claim that every treasury or gas-price configuration is saturable from one IP.

**Source anchors.** `services/managed-relay/server.mjs:339-360`; `services/managed-relay/server.mjs:441-461`; `services/managed-relay/tax-evidence.mjs:125-175`; `services/managed-relay/sponsor-funding.mjs:42-52`; `services/managed-relay/gas-sponsor.mjs:393-434`; `services/managed-relay/sponsor-policy.mjs:11-13`.

**Correction history.** [xgr-interchain PR330](https://github.com/xgr-network/xgr-interchain/pull/330), merge `54ec66f59070b342ba07d4d0a17a274ace5cc399` (Partial mitigation: release only expired unused quote liabilities after a finalized source nonce observation; executed or ambiguous obligations remain reserved.); [xgr-interchain PR331](https://github.com/xgr-network/xgr-interchain/pull/331), merge `fdfd342671936fa7c74fc18be5e60ef8679f61c0` (Partial mitigation: lower the expiry selection grace from ten to five minutes; signed source execution lifetime remains 90 seconds.).

**Independent checks.** The rate-limiter test passes. The expiry regression checks the five-minute SQL threshold and confirms unavailable finality evidence causes no release. It does not simulate adversarial continuous quote saturation. A separate actual expiry-function test confirms one finalized-head response plus a number-tagged nonce call can append a resolution without an independent witness or post-call hash recheck. This is a separate trust/release caveat, not the unpaid-reservation DoS reproduction.

**Production/release limit.** The deployed positive-quote permission path, treasury levels and achievable saturation rate were not measured. The read-only sponsor readiness state was already unavailable, so this audit cannot attribute live unavailability to N-06. Time alone no longer authorizes release, and an honest unavailable nonce observation retains the obligation. Used quotes are not reclassified as unused. Those are valuable protections against underfunding but do not authenticate demand or prevent budget occupation. The five-minute selection threshold is not a guaranteed release time: source finalized-state age, worker cadence and the bounded 80-row reconciliation queue can extend it. The receipt-free admission path and budget arithmetic establish the remaining mechanism statically; no live rate-limit exhaustion was attempted. Current residual maps to F-17.

### 2026-10-25 / N-07 - Sponsor admission does not reserve aggregate spendable treasury against outstanding promises

**Historical: Medium. Current: Resolved original aggregate-accounting condition. Disposition: VERIFIED.**

**Original condition and boundary.** New signed quotes could each pass a per-quote or stale funding check without accounting for all outstanding promises, allowing aggregate signed obligations to exceed the spendable sponsor treasury. Multiple valid sponsored quotes arrive while finite native funds are shared across their promised stages. Concurrent admission increases exposure; malicious private keys or principal-authentication bypass are unnecessary.

**Current assessment.** Positive quote commitments are appended within one transaction after sorted per-chain advisory locks. Under each lock the code counts every unsettled promise except a proven expired-unused quote or a confirmed grant, reads current wallet balance and gas price, includes a bounded payout-gas reserve for every outstanding and new grant, and enforces both liquidity and daily capacity. Any failure rolls the whole quote transaction back before the HTTP response exposes its signature.

**Source anchors.** `services/managed-relay/tax-evidence.mjs:118-180`; `services/managed-relay/sponsor-funding.mjs:21-53`; `services/managed-relay/server.mjs:453-463`; `services/managed-relay/gas-sponsor.mjs:280-303`.

**Correction history.** [xgr-interchain PR330](https://github.com/xgr-network/xgr-interchain/pull/330), merge `54ec66f59070b342ba07d4d0a17a274ace5cc399` (Aggregate outstanding-liability, fresh-funding and payout-gas accounting under the common per-chain advisory lock.).

**Independent checks.** Pure aggregate-capacity tests and actual saveQuoteEvidence calls with a fake pool verify rejection of insufficient funds/budget, one atomic commit for all grants, rollback and nonce/fee binding. These tests passed within 92/92 managed-relay tests. An actual PostgreSQL-engine run applied the exact migrations and exercised actual saveQuoteEvidence under the documented dedicated writer role. It exposed S-A01: the newly required operations-table SELECT is missing although health readiness checks pass; the permission failure rolls back all rows. This is a separate availability/permission integration defect, not permission to overcommit.

**Production/release limit.** S-A01 blocks a documented dedicated-role installation until grants/readiness are corrected; a consolidated worker role may already possess the needed SELECT. The actual deployed role and live concurrency behavior were not inspected. VERIFIED is limited to original source-level accounting and executed local checks, not production reserve assurance. The original omission of aggregate liabilities is closed in code. Multi-process lock scheduling was reviewed, not stress-tested against separate PostgreSQL sessions. Treasury funds are observed, not escrowed: independent withdrawals, unreliable RPC evidence or future price changes remain operational assumptions. Unconfirmed grants are conservatively counted in both outstanding liabilities and spentToday, which can reduce availability without creating the old undercount. A false single-RPC unused resolution could release a real obligation; that trust caveat is recorded separately.

### 2026-10-25 / N-08 - Outgoing gas-gift receipts can become permanently confirmed before the adopted native-chain finality threshold

**Historical: Medium. Current: Resolved original premature-confirmation condition. Disposition: VERIFIED.**

**Original condition and boundary.** The worker could treat the first successful native-gift receipt as final and permanently close the one-shot grant, even while the payment remained above the adopted safe/committed native-chain threshold. A sponsor payout is initially mined successfully, then reorganized or inconsistently reported before the adopted native finality threshold. The original durable confirmed state suppresses a legitimate later payment/recovery path.

**Current assessment.** Both immediate receipt handling and submitted-grant reconciliation invoke verifiedSponsorFinality before recording confirmed. The helper requires a successful matching receipt, a native head covering the receipt, matching canonical receipt block hashes and a freshly observed successful receipt. Base/Arbitrum use safe; XGRChain uses latest with two additional blocks. Unsupported or insufficient evidence retains submitted status and does not authorize duplicate payment.

**Source anchors.** `services/managed-relay/gas-sponsor.mjs:136-158`; `services/managed-relay/gas-sponsor.mjs:227-240`; `services/managed-relay/gas-sponsor.mjs:340-360`.

**Correction history.** [xgr-interchain PR330](https://github.com/xgr-network/xgr-interchain/pull/330), merge `54ec66f59070b342ba07d4d0a17a274ace5cc399` (Safe/canonical native payout confirmation used on the initial path and restart reconciliation.).

**Independent checks.** The actual finality-helper regression passes: Base receipt block 100 is held at safe 99 and accepted at safe 100; XGRChain requires latest at least 102 for block 100; unsupported safe RPC is held. The equality checks for canonical block and refreshed receipt hashes were additionally inspected in both call paths. No real reorganization or live payout was generated.

**Production/release limit.** Runtime support for required tags was not established through a real outgoing gift. The installed worker and production recovery journal were not read; no RELEASED conclusion is warranted. The old one-confirmation shortcut is removed. Consistently dishonest RPC data can still satisfy a single-provider check, and safe means the adopted native threshold rather than arbitrary stronger finality. Reserved/needs-review rows without a recorded transaction hash are not reconciled; that distinct crash-recovery gap is S-A02. One submitted-row RPC exception can abort the whole sweep; that distinct availability defect is S-A03.

### 2026-10-25 / N-09 - UI can present deferred native principal as completed payout without a claim action

**Historical: Medium. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** The native router deliberately treats a fully reserved deferred payout as successful message handling. Presentation equates final Mailbox handling with beneficiary balance receipt, and does not discover or expose the beneficiary-only withdrawal. Authenticated inbound native XGR transfer to a recipient whose receive/fallback rejects or exceeds the bounded payout gas. No malicious BLS signer or transport replay is needed.

**Current assessment.** The native router deliberately treats a fully reserved deferred payout as successful message handling. Presentation equates final Mailbox handling with beneficiary balance receipt, and does not discover or expose the beneficiary-only withdrawal. A user can see an apparently completed principal payout while value remains in router custody and requires a claim. A general smart wallet can call the claim function itself or direct payout to another address; a contract with no arbitrary-call or claim facility may be unable to recover. External ownership of a contract does not authorize an EOA to claim its balance.

**Source anchors.** `contracts/XETAGuardedNativeWarpRouter.sol:12-38,68-85`; `services/indexer/transfer-index.mjs:62-71,97-115`; `services/indexer/transfer-index-store.mjs:47-57`; `apps/web/transfer-status-flow.js:25-26,119-126`; `apps/web/transfer-token-journey.js:10-19,63-85`.

**Correction history.** [xgr-interchain PR328](https://github.com/xgr-network/xgr-interchain/pull/328), merge `dcf73448e0e190ade818c8c92de385323a3afeec` (Adds compact token journey labels; no claim-state recovery.); [xgr-interchain PR332](https://github.com/xgr-network/xgr-interchain/pull/332), merge `4b8541b804a3e59608695ff371b54f86a1d22ba1` (Status/balance-refresh changes do not turn a reserved claim into principal receipt.); [xgr-interchain PR334](https://github.com/xgr-network/xgr-interchain/pull/334), merge `b22e285a1fa8378bf14edc996b342dcaa15249a7` (Latest status modal refinements still mark the delivered path complete without pending-claim discovery.).

**Independent checks.** Real Mailbox and native router with explicitly mocked accepting ISM: delivered=true, recipient balance unchanged, claim fully backed, replay rejected, original beneficiary claims to alternate recipient, no residual debt. The actual UI projection reports: "Transfer complete", "no further wallet action", "native unlock step complete", and the summary "XGR unlocked on XGRChain. Delivery verified." These displayed claims do not establish beneficiary balance availability. No claim about a named third-party wallet's exact implementation; local composition is not a browser end-to-end or production transaction. BLS verification is mocked only for this payout test and covered separately in cryptographic tests.

**Production/release limit.** Current deployed code and configuration are independently checked in this audit; no future deployment, real reorganization, production journal crash or compiler equivalence is implied. Current residual maps to F-09.

### 2026-10-25 / N-10 - Known provisional source transfers disappear from displayed history after wallet reconnection

**Historical: Low. Current: Resolved original condition with bounded local retention. Disposition: VERIFIED.**

**Original condition and boundary.** A wallet broadcast locator was lost on reconnect/reload before durable indexed discovery became available. A broadcast has not yet been independently indexed; wallet/session reconnects.

**Current assessment.** Public transaction hints are saved per wallet, restored on reconnect and shown separately from canonically verified pending journeys. Invalid/stale hints do not authorize actions. Retention is bounded to 32 hints and 365 days; cross-device recovery depends on canonical index or a known hash, not browser local storage.

**Source anchors.** `apps/web/source-tx-hints.js:1-76`; `apps/web/app.js:20,272,359-369`; `apps/web/wallet-index-projection.js`.

**Correction history.** [xgr-interchain PR319](https://github.com/xgr-network/xgr-interchain/pull/319), merge `b098e9eb54213fef16cdbd4e1ca711669185a567`; [xgr-interchain PR321](https://github.com/xgr-network/xgr-interchain/pull/321), merge `8af4ae639f5b75a69fbd823b0693cdcdd6ef1397`.

**Independent checks.** source-tx-hints3/3; wallet projection5/5 and related pending/recovery tests passed. Browser smoke tests could not run without Chromium; no real wallet reconnect acceptance test.

**Production/release limit.** Public app.js matches frozen source; all module/runtime combinations not attested.

### 2026-10-25 / N-11 - Retired or unknown-route rows indefinitely starve delivery refresh

**Historical: Medium. Current: Medium. Disposition: OPEN.**

**Original condition and boundary.** Rows lacking an active route occupy the oldest bounded delivery worklist and are skipped without changing their scheduling position. Sufficient historical retired/unknown-route rows remain at the front of the derived SQL worklist. This is a backlog condition, not arbitrary direct database access for public users.

**Current assessment.** PR310 explicitly remediates only wallet pagination. The independent refreshPendingDeliveries query still selects all routes before resolving them and immediately continues for unknown routes before its attempt timestamp update. A real PostgreSQL-engine run using current migrations reproduced repeated selection without any active-route RPC read. Wallet ordering and background delivery scheduling are separate paths.

**Source anchors.** `services/indexer/transfer-index-worker.mjs:197-225`; `services/indexer/transfer-index-store.mjs:118-148`.

**Correction history.** [xgr-interchain PR310](https://github.com/xgr-network/xgr-interchain/pull/310), merge `f353d540519da2a373cd31e86b9a61e1d01cdafb` (Partial: wallet API worklist only. PR body expressly says partial scope.).

**Independent checks.** Existing wallet query-order regression passed. New actual-SQL refresh starvation regression also passed by reproducing the still-open worker behavior (PGlite 0.5.12, exact source schema/function). No production database access or concurrency stress.

**Production/release limit.** No actual current retired backlog was inspected; live route index reports caught up. Current residual maps to F-26.

### 2026-10-25 / N-12 - Positive microfees make transfers without sponsorship promises eligible to starve owed grants

**Historical: Medium. Current: Resolved original no-promise candidate poisoning condition. Disposition: VERIFIED.**

**Original condition and boundary.** Older operations with any positive service fee could occupy the limited sponsor candidate worklist even though no immutable gas promise existed. Rejected no-promise rows stayed ahead of later payable grants and could repeatedly consume the candidate window. Enough older valid positive-fee operations without gas commitments precede a genuine owed sponsored transfer. Creating those source operations can have a cost; arbitrary public writes to the database are not assumed.

**Current assessment.** The current candidate query inner-joins the exact payer/source/adapter/quote nonce/fee intent and its immutable commitment rows before ORDER BY and LIMIT 120. No-promise positive-fee transfers cannot consume that candidate window. Grant execution independently verifies the matching finalized source receipt and immutable promise.

**Source anchors.** `services/managed-relay/gas-sponsor.mjs:451-470`; `services/managed-relay/gas-sponsor.mjs:61-78`; `services/managed-relay/gas-sponsor.mjs:100-116`.

**Correction history.** [xgr-interchain PR311](https://github.com/xgr-network/xgr-interchain/pull/311), merge `f65cdf89b55953778e2c5c6a50f341d22d3b7052` (The immutable-commitment-driven upfront selection also closes this original worklist-poisoning condition, though the PR title focuses on the commercial upfront flow. Attribution is based on the verified candidate-query diff.).

**Independent checks.** Applied the current schemas to the actual PostgreSQL engine, inserted 125 older positive-fee operations without promises and one later paid two-hop parent with three promises, and executed the exact frozen candidate SQL. All 125 no-promise operations are excluded; the only selected rows are final-delivery/arbitrum, first-delivery/xgrchain and hub-onward/xgrchain for the owed transfer.

**Production/release limit.** The exact SQL behavior is locally verified, but no production workload, backlog or installed worker was inspected. This test is not a throughput or concurrent-session test. The original positive-microfee/no-promise poison rows no longer reach the bounded window. Other kinds of unresolved promised rows, reserved nonce locks or submitted-row RPC failures can still reduce sponsor availability; these are separate conditions and must not be conflated with proof that N-12 remains open.