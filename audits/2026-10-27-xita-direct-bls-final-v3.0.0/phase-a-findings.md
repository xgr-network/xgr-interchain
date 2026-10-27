# Phase A - Independent clean-slate findings

Frozen before historical reassessment at 2026-10-27T07:23:07.946971+00:00. The source snapshots and four original workstream notes are preserved below. Later verification is recorded separately.

# Phase A - Independent integration, release and production review

This record was completed before either historical audit or a remediation narrative was opened. It supplements the independent contract, node and sponsorship records without replacing their findings. Only the two authorized source snapshots were examined: xgr-network/xgr-interchain main at ffc24139738bcb25ab516e5d3242f258a75fcfb8 and xgr-network/xgr-node XGR3.0 at 4d341a08baa604c7871e10af8c7c2e2406f4d032.

## L-A01 - Delivery transaction data is not independently bound to the selected message in the browser

**Severity: Low. Priority: P2. Disposition: OPEN, defense in depth.**

The delivery action checks the proof response's messageId, destination Mailbox, chain, process selector and zero transaction value. It does not decode the message inside the returned process calldata and recompute that message's ID before presenting it to the wallet. The indexer's response check follows the same metadata boundary. See apps/web/transfer-actions.js:614-674 and services/indexer/transfer-recovery.mjs:65-87.

The honest native-relayer proof construction validates the actual complete message and its authorization, and the real destination Mailbox cryptographically authenticates any transaction submitted to it. This is consequently not a signature bypass or principal redirection finding. A compromised proof response could cause a wallet to spend gas delivering another independently valid message while the selected transfer remains unfinished. The claim is based on source review, not an executed malicious browser or mainnet transaction. Decode and bind both authorization and message to the selected record before signing. Retain contract verification as the authority.

## L-A02 - Full regression results differ from the selected CI coverage

**Severity: Low. Priority: P2. Disposition: OPEN.**

All 39 browser-unit test files were invoked individually under Node 24.22.1 with named-test reporting: 280 tests, 273 passes and seven failures. Two failures arise because Chromium is absent in the audit environment; these are unexecuted browser checks, not product failures. Five assertions have stale expected token addresses, route count or recovery-button wording. The source/catalog use the current address and eight routes. The indexer group produced 136 passes and one stale assertion rejecting a pinned eth_call which another current test intentionally permits. The full Solidity suite has the separate expected-revert fixture defect C-A05. None of these assertions independently establishes a production authorization failure.

The selected lists in .github/workflows/validate.yml do not cover every discovered test. Repair obsolete expectations against current public behavior and make discovery/coverage explicit. Keep the genuine failed unmodified runs in evidence. Do not summarize the entire repository as green. Browser execution, real wallet interoperability, account-abstraction paths and a live end-to-end transfer matrix remain unverified.

## L-A03 - Production readiness is incomplete and installed software identity is unproven

**Severity: Medium operational gap. Priority: P1; specific source/accounting release gates remain P0 under NODE-A-01. Disposition: OPEN.**

Read-only observations at 2026-10-27T07:17:51.860Z through 07:18:10.139Z show the paid quote endpoint reporting ready but sponsorship.available=false on XGRChain, Base and Arbitrum, reason sponsor-reserves-or-worker-not-ready. This is an actual advertised-service readiness restriction. It does not prove which source defect, reserve level, database role or worker condition caused it. A self-funded restricted service can be evaluated separately from any promise of sponsored, low-gas-wallet operation.

The public XGR endpoint reports xgrchain/v3.3.8/linux-amd64/go1.23.11 and an alive, caught-up observer across eight routes. Neither observation proves every signing validator runs the published binary, nor that a current-set authorization can actually be obtained during failures. The proofBuilder installed health field confirms executable availability, not successful quorum formation. Actual host binary hashes, environment/service versions, database roles, independent validator operation, secret separation, storage recovery and real wallet journeys were not accessible.

The independently downloaded v3.3.8 release points to the frozen node SHA. Its 73,021,839-byte Linux binary hashes to 95fd72cc72b942d206b130ff4ef63df83d2d161a99d092cd68b9b240c6be9617, matching both published asset metadata and sha256sums.txt. Embedded Go build metadata reports that revision and vcs.modified=false. This verifies release correspondence and download integrity, not a bit-reproducible source build or installed-host attestation.

## Independent live deployment evidence

All nine configured RPC endpoints responded successfully to read-only identity/head checks through the environment's required proxy. An earlier run without that proxy failed because of the audit environment; it is not evidence of a network outage. Base and Arbitrum safe heads were observed. A lagging Base endpoint had an older valid safe head, not a contradictory hash at the same height.

At fixed per-chain blocks, 57 unique deployed contract runtimes matched all recorded receipt Keccak-256 hashes. The block headers were reread and remained unchanged. Fresh source compilation compared all 57 bodies with no unexplained instruction differences after excluding declared immutables and precisely identified Solidity metadata digests. This is not byte-exact compiler metadata reproducibility. Additional route/getter checks may supplement the final verification record after this freeze; they cannot retroactively alter these independent findings.

All three live validator registries reported set ID 1, three members and threshold two. All three Execution Gateways reported distinct owner and service-wallet roles and a 90-second quote lifetime. Default Mailbox ISMs matched deployment receipts. The production catalog.json and app.js matched the frozen source exactly. This does not attest every other frontend module or backend installation.

## Integration and recovery assessment

The ordinary flow has two core user-authorized transactions for one hop and four for two hops. ERC20 allowance transactions, if needed, are additional. Browser code uses an EIP-1193 provider, including generic wallet requests; source review is not a certification of every browser wallet, mobile connector, hardware wallet or account-abstraction execution model.

The source and onward transaction paths verify account, chain, nonce, source receipt, destination route and fee/gas readiness before signing. Two-hop parent-message binding and the on-chain onwardParentUsed guard prevent a duplicate onward operation. Local storage contains bounded public transaction locator hints and is not the authorization source. Recovery reobtains current evidence and current-set authorization; user principal is held in authenticated router escrow, not a service treasury.

The native-router fallback in C-A01 creates a backed beneficiary claim, while transfer-status-flow.js:119-145 describes confirmed Mailbox delivery as complete with no further wallet action. That wording is incorrect for a recipient requiring the deferred native claim. A general smart wallet able to execute the claim can recover to an alternate destination; an arbitrary receiver contract cannot be presumed to have that ability. This is a supported-recipient and status/claim-workflow restriction.

Backend optional failures can block convenient progress without giving those services custody of principal. Recovery still needs functioning chains, available current validator quorum and sufficient transaction gas. Neither immutable contracts nor independent wallet access can recover from permanent loss of validator quorum by themselves.

## Residual observations retained for final inventory

The sponsorship record additionally preserves single-RPC expiry-release evidence, unauthenticated reservation capacity, conservative daily-limit double counting, an unpaid onward grant becoming ineligible after external early delivery, obligations remaining after sponsorship shutdown, and the separately configured legacy relay execution mode. They must be mapped explicitly during final consolidation rather than silently discarded.

The contract record preserves membership signatures' cross-deployment replay domain, minimum committee size as an operating invariant, authorized owner/service role convergence and arbitrary underlying-token behavior. These are distinct from a demonstrated unprivileged principal-theft path.

## Scope and safety limitations

No live transaction, malicious consensus proposal, deployment, configuration alteration or asset transfer occurred. The automated security filter interrupted deeper exploit-oriented node reproduction. Completed local observations and source traces are described with their limits. Runnable node checks and detailed accounting outputs are segregated for confidential archival; public evidence contains existing standard/race tests and sanitized conclusions. The full end-to-end consensus exploit and installed-validator exposure were not verified. This limitation does not close the statically evidenced P0 accounting boundary.

No historical audit was used to select these findings. The next phase may add corroboration, reassess old issues, and consolidate duplicate findings, but this record will remain unchanged.


---

# Phase A - independent smart-contract examination

Status: COMPLETE for the independent contract workstream, before historical reassessment. No historical audit files or remediation reports were read. Source comments were treated as implementation claims, not proof. The parent audit combines these notes with other independent workstreams before freezing Phase A.

## Scope and reproducibility

- Repository: `xgr-network/xgr-interchain`, frozen `main` commit `ffc24139738bcb25ab516e5d3242f258a75fcfb8`.
- Reviewed all 21 production Solidity files (approximately 2,978 lines), production interfaces, the pinned Hyperlane Mailbox/Router/TokenRouter inheritance paths, and the 15 Solidity test files (16 test suites).
- The parent independently checked every frozen source blob against the connected GitHub tree. Testbed sources were copied from this snapshot; the snapshot itself was not modified.
- Local tools: Forge 1.5.1-stable (`b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`), Solidity 0.8.24 (`e11b9ed9`), optimizer 200, via IR. Forge normalizes the compiler EVM target to Cancun for this compiler; EIP-2537 execution tests pass in the configured test EVM. Additional boundary tests explicitly request the Prague runtime.
- Cached packages match the exact declared versions: Hyperlane core 11.1.0, OpenZeppelin contracts and contracts-upgradeable 4.9.3. Forge test utilities are 1.9.2. Version fingerprints are recorded in `dependencies.json`; a fresh npm registry tarball integrity check was not performed.

## Independent risk observations

### C-A01 - Native message delivery does not imply immediately spendable recipient balance

**Proposed current severity:** Medium for an interface that reports completed native delivery as wallet availability without recognizing deferred claims. **Priority:** P1 for supported contract-wallet recovery; not a principal-custody issue.

`contracts/XETAGuardedNativeWarpRouter.sol:68-85` protects collateral, attempts a native payment with 30,000 gas, and if the recipient rejects the payment, records a backed `pendingNativeXGR[recipient]` claim while returning success. The real Hyperlane Mailbox stores `delivered(messageId)` and calls the recipient router in the same successful transaction (pinned Mailbox implementation lines 215-245). Therefore a perfectly valid delivery can complete while the beneficiary wallet balance remains unchanged.

The beneficiary can call `withdrawPendingNativeXGR(address payable)` to redirect or receive the reserved funds; only the beneficiary contract itself is authorized, not an externally owned account that happens to control it (`XETAGuardedNativeWarpRouter.sol:25-38`). A general-purpose smart wallet can issue that call. An arbitrary recipient contract lacking such an execution facility cannot be assumed able to claim.

The application/indexer source search found no handler for `pendingNativeXGR`, `withdrawPendingNativeXGR` or `NativeDeliveryDeferred`; only the TVL worker reads the aggregate reservation. The parent is assessing the exact displayed status paths. The contract fallback itself preserves funds and improves liveness; the issue is the interface/claim workflow and supported-wallet boundary.

**Independent check:** `testMailboxDeliveredCanMeanReservedClaimNotWalletBalance` uses the real Mailbox and real native router with an explicitly test-only accepting ISM. It verifies delivered=true, wallet balance zero, an exactly backed pending claim, replay rejection, beneficiary-authorized alternate payout and no residual debt. The test does not claim to verify BLS authentication; that boundary is independently exercised by the existing cryptographic tests.

### C-A02 - Recovery-admin and online-service roles can converge after deployment

**Proposed severity:** Low. **Priority:** P2. **Disposition:** OPEN as a hardening gap; no unprivileged escalation.

`contracts/XITAExecutionGateway.sol:130-155` requires an independent recovery administrator at creation and rejects rotation of the service wallet to the current owner. However the inherited `Ownable2Step.transferOwnership` / `acceptOwnership` route has no corresponding exclusion. An authorized recovery administrator can nominate the current service wallet; that wallet can accept, leaving `owner() == serviceWallet()`.

This requires an administrator action. It does not give the service signer control over user principal, and the current live reads supplied by the parent show distinct roles on all three chains. It weakens the documented recovery property if an operator uses an otherwise valid ownership-transfer workflow. An on-chain guard on nomination or acceptance, plus a deployment/health invariant for owner/pendingOwner/serviceWallet, would retain the intended separation. Record as an operationally avoidable risk, not as a launch-blocking exploit.

**Independent check:** `testInheritedOwnershipTransferCanCollapseRecoveryKeySeparation` performs the authorized two-step transition and observes equal roles.

### C-A03 - Membership authorizations have a residual cross-deployment replay domain

**Proposed residual severity:** Medium if two matching registries are simultaneously active for the same chain/domain; operationally bounded when exactly one registry is active. **Priority:** P1 invariant before operating parallel deployments.

`XGRInterchainValidatorRegistryV3.sol:428-460` signs chain ID, destination domain, set ID, expiry, action, validator address and both key encodings, but not the registry contract address. Two deployments with the same chain/domain, membership and set ID therefore produce identical signing bytes. A valid membership authorization can be submitted to both while unexpired. This does not forge a BLS signature and does not permit transfer-message replay: Direct-BLS transfer signing bytes explicitly include both destination ISM and destination registry addresses (`XITADirectProtocol.sol:42-49`).

The 10-minute maximum membership validity, current set ID and quorum checks constrain the condition (`ValidatorRegistry:376-415`), but do not cryptographically eliminate cross-registry replay. The operating invariant is one active destination registry per chain; if parallel deployments or migration overlap are introduced, bind membership signatures to a deployment address and version the protocol deliberately. Whether this invariant is accepted and verified operationally is assessed by the parent.

**Independent check:** `testMembershipPayloadIsIdenticalAcrossMatchingRegistryDeployments` establishes identical payloads and shows both contracts apply the same simulated quorum-approved transition. This test uses an explicit mock verifier, so it proves the replay-domain/state-machine property; it is not represented as a newly computed real BLS forgery.

### C-A04 - Minimum committee size is an operating policy, not a contract invariant

**Proposed severity:** Low as a configuration/operations risk, rising with actual insecure deployment. **Priority:** P1 to monitor minimum active membership, P2 to consider contract enforcement.

Bootstrap accepts any nonempty set (`ValidatorRegistry:122-135`). Removals are prevented only when at most one member remains (`:630-631`). The quorum formula correctly implements `ceil(2n/3)` (`:306-308`, `:333-335`), so a one-member registry has a one-signature quorum. No unprivileged caller can shrink the set: removals require the current authorized BLS quorum. The parent live reads observed three members and threshold two on all three chains; this is not a present single-validator launch defect.

A controlled launch should preserve at least three independently operated members, monitor concentration, and retain current-set re-attestation availability. Permanent loss of a quorum cannot be solved by a privileged administrator in these ownerless registries. Permissionless execution still depends on obtaining valid current-set authorization.

**Independent check:** `testSingleValidatorBootstrapAndOneSignerQuorumAreAllowed`; direct negative quorum cases in `testQuorumRejectsUnderweightNonCanonicalAndOutOfRangeBitmaps`. Cryptographic verification is mocked to isolate quorum policy.

### C-A05 - One repository topology test misplaces its expected revert

**Proposed severity:** Informational. **Priority:** P2 test repair. **Status:** reproducible local fixture failure, not an identified factory-guard bypass.

The unmodified suite produced 102 passing tests and one failure: `testFactoryRejectsMismatchedHubIdentityAtDeployment`. At `test/XITAXGRHubTopologyV315.t.sol:88-93`, `vm.expectRevert` precedes three successful router-deployer constructor calls evaluated as arguments of the factory constructor. The expectation is consumed by a helper creation before the intended factory call. The production factory guard (`XETATokenFactoryV315.sol:61-68`) rejects the mismatched hub identity directly. The local isolated reproduction creates the three helpers before arming the expectation; the intended factory rejection then passes. Its result is recorded separately. This must not be summarized as an all-green unmodified repository suite.

## Verified security boundaries and important positive results

| Boundary | Evidence and independent assessment |
| --- | --- |
| Current-set authorization | `XITADirectBLSISM:52-64` rejects retired destination set IDs before cryptographic verification. Re-attestation uses the current set; a second source lock is not required. |
| Exact message binding | ISM checks source domain, destination, source router, destination router and message Keccak (`:66-74`). The complete fixed-width authorization also binds route, source registry/gateway/mailbox, fee, source block, destination ISM and destination registry (`XITADirectProtocol:25-50`). |
| Asset ownership at destination | The actual recipient router recomputes its expected reverse route using its own registered asset ID and exact router pair (`XETARouterCore:104-131`). A BLS payload for another asset cannot unlock a different router. |
| BLS key/PoP discipline | Bootstrap and ADD require proof of possession, compressed-to-EIP-2537 key consistency in EIP mode, active-key uniqueness and current-set quorum (`ValidatorRegistry:72-94,164-204,601-625`). The real verifier rejects identity public keys, identity signatures and identity aggregate keys (`BLSVerifier:30-89`). Actual single-key, aggregate and changed-message vectors passed. |
| Quorum bitmap | The registry rejects zero/oversized/noncanonical bitmap encodings and bits outside the set; threshold is calculated from the selected immutable snapshot (`ValidatorRegistry:315-343,682-713`). |
| Replay and failed delivery | Hyperlane Mailbox checks `delivered`, records it before external calls and reverts the entire transaction on failed authentication/handling. The router requires the configured Mailbox and enrolled sender. Current-set and per-deployment message binding add independent boundaries. |
| Gateway-only outgoing movement | All public router transfer paths reach the internal `_transferRemote` override, which requires the canonical registry gateway and enrolled destination (`XETARouterCore:134-153`). The synthetic multiple-inheritance override delegates explicitly to this check. |
| No centralized principal custody | Native/collateral/synthetic routers have ownership initialized to zero. Escrow unlock/mint is driven by authenticated Mailbox delivery; a service fee signer or recovery administrator has no principal sweep or forced-transfer capability. |
| Supply and escrow | Native principal is quoted once; exact token debit/balance increase is required for the collateral path; synthetic supply starts at zero and can increase only through the inherited authenticated handler. Two-hop accounting cases with native XGR, original ERC20s and six decimals passed. |
| Pending native funds | Native payout checks balance minus previous pending claims before attempting new payment; insufficient collateral reverts instead of creating an unbacked claim. Eight existing fallback/reservation tests passed. |
| Atomic fees | Canonical fee payment, lock/burn, dispatch and FeeVault allocation execute atomically (`ILNGateway:179-237`). Duplicate operation allocation is rejected. Transfer-time fee allocation is O(1) rather than O(validators). |
| Fee withdrawal | Historical membership snapshots, per-epoch accumulation and paginated claims prevent rotating memberships from confiscating old fees. CEI and reentrancy protection prevent repeated withdrawal (`FeeVault:94-195`). |
| EIP-712 | Payer, gateway, route, amount, recipient and onward identity are signed; EIP-712 binds chain and execution contract. Nonces are payer-scoped, consumed atomically, and rolled back on failure; issuedAt is not future-dated and lifetime cannot exceed 90 seconds (`ExecutionGateway:178-247`). |
| Service failure independence | Users can use the public ILN gateway without the optional service adapter. Service-wallet key rotation invalidates old quotes without changing router custody or validator verification. |
| Hub topology | Protocol route IDs and factory registration require exactly one XGRChain endpoint, checking chain and domain identity together (`XGRILNProtocol:35-55`, `Factory:192-228`). |
| CREATE2 preemption | All three public deployer modules namespace their salt with `msg.sender`; direct calls by another account cannot occupy a factory's deployment address. |

## Runtime-to-source comparison

The parent collected canonical-block-pinned `eth_getCode` results and independently matched 57 live contract records to receipt hashes. This workstream then compared those bytes with freshly compiled frozen source:

- All 57 runtime lengths match.
- Every observed byte outside compiler-declared immutable spans and precisely recognized Solidity 0.8.24 IPFS metadata digest spans matches the locally compiled bytecode.
- 45 comparisons differ only in the final metadata digest. Twelve factory/router-deployer comparisons additionally contain digest differences inside embedded child-contract creation data.
- There are no remaining instruction-byte differences after these narrowly specified exclusions.
- This is **not** a byte-for-byte metadata reproduction and **does not** verify the excluded immutable values. Immutable/configuration bindings must be checked through getters, constructor/deployment evidence and their callers separately. The parent owns those live configuration checks.
- The comparison records every excluded span, contract address, pinned block, artifact SHA-256, compiler settings and comparison result in `runtime-comparison.json`. It does not silently apply the production deployment verifier's stricter acceptance policy to different build metadata.

## Underlying-token and liveness assumptions

The protocol's standard ERC20 accounting cannot make an arbitrary original token trustworthy. Negative rebases, token-admin seizure/blacklisting, pausing, upgrades and behavior changes can reduce escrow availability or block redemptions. Initial exact-debit checks reject an immediate fee-on-transfer mismatch; they cannot prevent later token policy changes. Asset-specific exposure is isolated to its independently registered router; it does not authorize spending another asset's collateral. Public listing and user disclosures should reflect supported token semantics.

No source-code review can independently prove separate physical operators for the current BLS members, retained validator keys, actual installed node binaries or future quorum availability. The optional service administrator has no unilateral refund/sweep path for router principal. Recovery remains dependent on source evidence, current authorization and a functioning destination chain.

## Test and evidence inventory

- `forge-run-2.log`: unmodified frozen repository tests; 102 pass / 1 fixture failure / 0 skipped; actual EIP-2537 vectors pass.
- `forge-full.log`: first setup attempt lacking forge-std; resolved by adding the installed test dependency to the isolated testbed. No source bug is attributed to this environment failure.
- `forge-independent.log`: first independent harness run; five policy/boundary tests pass; fuzz recipient addresses accidentally selected EIP precompiles and correctly hit TransferFailed.
- `forge-independent-final.log`: 7 passing tests / 0 failures, including six independent boundary tests and the isolated topology expectation. The FeeVault property ran 257 cases (one persisted counterexample plus the configured 256 generated cases), each covering 40 epochs and paginated withdrawals.
- `fixture-adjustment.txt`: complete explanation of local harness changes; production snapshot untouched.
- `dependencies.json`: pinned package/version fingerprints.
- `runtime-comparison.json`: independent source/runtime comparison for all 57 observed deployed instances.

This review has not identified a permissionless mint, collateral theft, BLS membership bypass, replay double-payment or direct spoke-to-spoke execution path in the examined contract implementation. This is a bounded audit result, not a proof of absence. Source-observation authenticity, sponsorship accounting and production readiness are examined in the other workstreams.


---

# Phase A - Independent node security review

**Frozen repository:** `xgr-network/xgr-node`, branch `XGR3.0`, commit `4d341a08baa604c7871e10af8c7c2e2406f4d032`.

**Method:** independent source and test review before reading either historical audit or their remediation notes. Source comments referring to older issues were visible as part of implementation, but historical reports were not used to derive these findings. All tests ran against a local copy; the frozen source tree and production systems were not changed.

**Scope:** Direct-BLS encoding, source witnesses/finality, native committed-state adapter, membership and aggregation, signer entry points, gossip admission, shared observer and retries, persistence, transport cancellation, and the underlying node accounting/IBFT integration boundaries. Provider corporate/upstream independence, installed production binaries and on-chain deployments are assigned to the lead auditor.

## Executive result

The transport authorization path has substantial protections: canonical full-operation evidence, distinct configured operator identities, exact witness comparisons, locally committed XGR evidence, current destination membership, signature domain separation, and destination delivery checks. The reviewed signing call graph does not reveal an alternate external-source signing path that bypasses witness verification.

The independent node review nevertheless identifies a **High, P0 underlying execution/accounting issue** in the frozen source, supported by local execution observations and a source trace through block processing. This is separate from the external RPC trust assumption. Public launch approval must not infer native principal integrity merely from passing Interchain regression tests. A complete malicious network proposal was not created or broadcast, and installed-validator vulnerability was not established by this workstream.

Additional residual issues concern cross-transaction gas accounting, adversarial gossip workload, and fairness/isolation of the retry backlog. They affect distinct boundaries and should not be conflated with the RPC witness mitigation.

## Independent findings

### NODE-A-01 - Native system-transaction accounting and proposal validation boundary

- **Current severity:** High. **Priority:** P0. **Disposition:** OPEN.
- **Boundary:** native asset supply/accounting and the block-proposer-to-honest-validator execution boundary.
- **Current evidence:** the execution path for nonstandard system transactions does not establish ordinary fee funding before the later fee/refund accounting branch. The nominal zero-fee interpretation and the effective-price helper are inconsistent. Block-body processing distinguishes a single canonical system-transaction form, but other system-transaction forms remain exposed to ordinary execution. The reviewed block/header validation also lacks an explicit equality check against the deterministic expected base fee.
- **Source anchors:** `state/executor.go:183-212`, `425-447`, `735-777`, `820-835`, `1545-1578`; `types/transaction.go:239-265`; `consensus/ibft/fork/hooks.go:149-169`; `consensus/ibft/ibft.go:468-522`; `blockchain/blockchain.go:644-690`; `types/rlp_unmarshal.go:564-574`.
- **What was actually verified:** before the automated security interruption, isolated local accounting checks observed creation of unfunded credits in the relevant execution path, including a round-tripped transaction processed by the actual `Executor.ProcessBlock` function with supported forks enabled. Source tracing shows the mempool rejection is a separate boundary and is not a substitute for block validation. These checks were not a network-consensus exploit, were not run against production, and did not establish which binary is currently installed on validators.
- **Impact/prerequisites:** a proposer-controlled block path is a privileged prerequisite. If the reviewed behavior is reachable in the deployed network, native supply and fee accounting can be invalidated, which also undermines the economic backing of interchain native-token transfers. No unprivileged wallet theft or remote compromise of validator keys is claimed.
- **Required remediation:** explicitly constrain admissible system transactions at consensus/block validation; make system transactions non-fee-bearing throughout execution; enforce deterministic header base-fee validation; add regression assertions for native-supply conservation and rejection of invalid system transaction forms. Verify the corrected published binary and each installed validator build separately.
- **Publication handling:** runnable reproduction material and detailed local outputs have been segregated from public evidence. The public report should contain this sanitized security boundary, impact, source references, and remediation only.

### NODE-A-02 - Transaction-original storage/refund accounting does not reset consistently

- **Current severity:** Medium. **Priority:** P1. **Disposition:** OPEN.
- **Boundary:** transaction-local storage gas and refund accounting within a block.
- **Current evidence:** `GetCommittedState` reads the underlying snapshot, while transaction cleanup resets refunds without replacing the transaction-original storage baseline. The subtraction helper uses unsigned arithmetic without an underflow guard. These properties permit an inconsistent refund state across transactions.
- **Source anchors:** `state/txn.go:221-287`, `449-457`, `480-488`, `550-584`; `state/executor.go:479-483`; `state/runtime/runtime.go:123-132`.
- **Verification:** an isolated state-accounting check observed the unsigned refund wrap before the automated security interruption. A complete multi-transaction EVM/network reproduction was not performed. The refund application itself is capped at half of gas used; this finding therefore does **not** establish unlimited refunds, arbitrary minting, or unlimited execution from the refund issue alone.
- **Impact/prerequisites:** multiple storage updates in separate transactions in one block can lead to incorrect gas charging/refund treatment. Consensus participants running identical code may agree on incorrect accounting; agreement alone is not correctness.
- **Required remediation:** maintain a per-transaction original-state snapshot or equivalent original-slot journal, enforce refund arithmetic invariants, and add cross-transaction storage gas tests. Any protocol-level change needs coordinated rollout under the chain's fork policy.

### NODE-A-03 - Expensive gossip verification precedes admission controls

- **Current severity:** Medium. **Priority:** P1. **Disposition:** OPEN.
- **Boundary:** untrusted P2P messages versus finite Interchain RPC, CPU and goroutine capacity.
- **Source anchors:** `interchain/runtime/worker.go:830-880`; `interchain/runtime/iln_checkpoint.go:168-201`; `interchain/runtime/iln_quorum_request.go:248-281`; `network/gossip.go:108-122`.
- **Evidence:** checkpoint votes resolve a route and invoke full source-evidence acquisition before voter membership and BLS signature validation. Peer quorum hints also invoke the normal proof path directly. The dedicated per-peer throttle applies to completed-quorum frames and route notices, but not to these other expensive frame types. The shared gossip implementation starts a goroutine per delivered message.
- **Verification:** a bounded local seam check confirmed that frames without a usable signer signature reached source-evidence acquisition. No live P2P saturation test, flood, or production traffic was generated. Existing transport deadlines and response-size limits are real mitigations, but do not bound aggregate admitted work.
- **Impact:** resource/RPC exhaustion and delayed valid transfers; no invalid signature or unauthorized mint was observed. The optional worker is outside synchronous IBFT verification hooks, but shares process and host resources, so total resource isolation is not established.
- **Required remediation:** cheap shape/signature/member checks where safely cacheable, per-peer and global admission limits before remote reads, bounded concurrency, fair queues and in-flight deduplication. Preserve complete source verification before any actual local signature.

### NODE-A-04 - Retry fairness and failure isolation remain incomplete

- **Current severity:** Medium. **Priority:** P1. **Disposition:** OPEN.
- **Boundary:** one failing route/backlog versus progress of other routes sharing a source observer.
- **Source anchors:** `interchain/runtime/iln_observer_retry.go:16-22`, `74-105`, `141-199`; `interchain/runtime/iln_observer_worker.go:128-162`, `185-223`.
- **Evidence:** retry files are immutable, file- and directory-synced before a failed observation is allowed past the shared cursor, and every retry re-enters the normal proof path. This is meaningful protection. However, the source retry budget is consumed in the same route order; there is no persisted rotating route start. Earlier continuously eligible backlogs can prevent later routes from receiving retries. Queue-capacity and corrupt-record failures return errors at the source-group level.
- **Verification:** a bounded local scheduler check showed repeated fully eligible polls spending the entire budget on earlier failing routes while a later recoverable route received no attempt. The clock was advanced by changing local test file timestamps; the test did not reproduce elapsed production time or a live outage. Existing durable-retry and corruption-rejection tests passed. No actual disk-power-loss experiment was performed.
- **Impact:** delayed or indefinitely postponed recovery, and source-wide scanning stoppage at capacity; failed work is retained rather than silently dropped. Existing public/manual quorum recovery is a mitigation, not a proof of autonomous fair progress.
- **Required remediation:** rotate service across routes with a durable or deterministic fair schedule; isolate quarantined corruption/capacity pressure without dropping original work; expose backlog age/capacity and manual recovery procedures. Verify service of a healthy late route under sustained earlier failures before expanding route count.

### NODE-A-05 - External-source authenticity retains a two-operator trust assumption

- **Current severity:** Medium residual architectural risk, conditional on verified operational diversity; High impact remains possible if the assumption fails. **Priority:** P1 evidence/operational gate. **Disposition:** OPEN pending lead-auditor risk acceptance/provenance assessment.
- **Source anchors:** `interchain/config.go:60-78`, `interchain/evm/rpc_evidence_quorum.go:29-94`, `100-123`, `interchain/evm/iln_direct_operation.go:103-149`, `interchain/evm/finality.go:17-70`, `interchain/runtime/iln_direct_signing.go:27-76`, `97-140`.
- **Implemented mitigation:** each witness is pinned to one endpoint for the complete operation. Same-operator URLs do not count as independent witnesses. Exact canonical source-block hash, transaction hash, message, route snapshot, log index, source height, destination and validator fee are compared. One malicious response or one available operator is insufficient. Base/Arbitrum must supply a valid `safe` head and matching numeric canonical block; there is no fallback to `latest` for those chains. Native XGR uses the local synchronized committed-state adapter.
- **Residual:** a matching pair is accepted as soon as it is found; this is not a majority vote over all configured providers, and an earlier contradictory observation is not a global veto. The code cannot prove that two operator labels correspond to independent upstream data. Two correlated providers can present consistent false source evidence. The BLS validator quorum does not remove correlated evidence risk when honest validators consume the same compromised pair.
- **Verification:** existing witness/finality tests passed. Local injected-reader checks covered one inconsistent provider with two honest witnesses, duplicate operator labels, one surviving operator, two conflicting observations, and two correlated matching observations. The injected-reader tests establish witness-combination behavior; they do not constitute a forged real RPC receipt or creation of a production-valid BLS authorization. A later-added scenario with an honest disagreement preceding a matching pair was **not executed** after the interruption; its behavior is established by static control flow only.
- **Required controls:** independently establish provider/upstream diversity; monitor evidence disagreements and availability; maintain fail-closed signing; accept the distinction between L2 safe confirmation and final Ethereum settlement explicitly. A different architecture is not automatically required by this source review.

## Verified positive invariants

1. `signDirectILNMessage` is reached by automatic observation, public quorum requests and peer authorization hints; it performs synchronization checks before evidence collection and immediately before local signing. Source 1643 uses local committed blocks/receipts; external chains use the complete two-operator witness function.
2. The Direct-BLS payload has a fixed domain and exact binary length. It binds source chain/domain, route, source registry/gateway/router/mailbox, current destination set, message ID, fee, destination router, destination ISM and destination registry. Truncated/extra data are rejected.
3. Source receipts must be successful, correspond to the operation transaction/height, contain exactly one matching fee-qualified gateway operation and exactly one bound canonical mailbox dispatch. Unrelated canonical dispatches in the same transaction are supported; duplicate matching events are rejected.
4. Local signers and accepted individual votes must be active in local PoS and match the destination registry's BLS key. Current set ID and destination delivery state are rechecked; on-chain enforcement remains necessary at execution time.
5. Aggregation uses distinct signer indices and `ceil(2n/3)`. Out-of-range signer bits, insufficient quorum and malformed signatures fail. This is an unweighted Interchain threshold, separate from ordinary stake-weighted PoS consensus.
6. Completed-quorum import verifies the aggregate, current destination set, domain and archive consistency. It does not create new local votes and is not a source-witness bypass for signing.
7. Shared observers use bounded windows and source-local cursors. Full proof validation remains separate from discovery hints. Failed verification is journaled before advancement; normal retry re-verifies all evidence.
8. RPC transport has real cancellation deadlines, a response-size bound, per-provider cooldowns, and no automatic transaction rebroadcast from the read-failover layer. Optional Interchain work is outside the IBFT proposal-verification hooks. Existing cancellation and race tests passed; this does not prove global workload isolation.
9. Fee-governance proposal receipt does not automatically approve it; creating a governance signature requires a local approval action. Membership admission binds local PoS identity and possession of the candidate BLS key.
10. Membership payloads omit the exact destination registry address. The compiled single active registry per chain is therefore an operational invariant; simultaneous same-domain/same-key registries require separate review. Direct message payloads do bind their destination registry/ISM.

## Executed verification and evidence

### Existing source regression suite

Command category: Go 1.23.11, `go test -count=1 -json ./interchain/... ./consensus/ibft/interchain/...` against the local frozen-source test copy.

- **127 existing tests passed** across five packages; no failures or skips in the completed run.
- Public-safe log: `evidence/node/tests-standard.jsonl`.
- SHA-256: `c6dd12ee57dbf24fc983df542c93beefdb51fb584525231acaf6ae24d1469049`.
- Size: 115287 bytes.

### Existing concurrency/race suite

Command category: `go test -race -count=1 -json ./interchain/runtime ./interchain/evm`.

- **102 existing tests passed under the race detector** across two packages; these are a subset re-executed from the existing suite, not 102 additional distinct tests.
- Public-safe log: `evidence/node/tests-race.jsonl`.
- SHA-256: `1c5abfe6bca1b1a4cbf3c019e0d8c21e022579b132d4aeee42615d876e5a7ef1`.
- Size: 92088 bytes.

### Additional checks and boundaries

Before the automated security interruption, bounded local checks completed for witness-combination behavior, gossip admission order, retry scheduling and accounting. Detailed accounting outputs and runnable auditor test material are **not public-safe evidence** and have been separated under access-restricted local work files. The lead auditor must archive any retained confidential evidence in appropriate persistent access-controlled storage before claiming durable confidential archival.

The first standard-suite attempt failed because this execution sandbox prohibited loopback mock sockets. The subsequent explicitly authorized local-loopback run passed. The first attempt is a tooling limitation, not a source security failure.

An automated cybersecurity filter then stopped further exploit-oriented reproduction. This workstream complied by stopping that work and preparing this sanitized defensive summary. No live-chain transaction, malicious block proposal, value transfer, deployment or production configuration change occurred. No test result is asserted for scenarios not present in the saved completed logs.

## Coverage limits and launch requirements

- Current installed production binaries, operator key custody, live validator membership, deployed contract hashes, and provider upstream independence were not established by this node workstream.
- Source/compiled-release correspondence is separate from installed-runtime correspondence. The lead auditor obtained published release build metadata; this review does not substitute that for host measurements.
- No complete adversarial multi-validator network acceptance experiment was performed for the accounting issue, and further exploitation work was stopped after the automated security interruption.
- No full-state disk-power-loss experiment, production load test, formal cryptographic proof, or exhaustive all-package node audit was completed.
- The 127 passing Interchain tests and 102 race-test executions do not negate the independently identified native accounting boundary.
- Recommended launch gate from this workstream: resolve NODE-A-01 or provide independently verified evidence that the currently deployed execution/consensus path is different and safe; fix or expressly constrain the other reliability issues before scaling. The overall launch verdict is the lead auditor's integrated decision.


---

# Phase A - Independent fee, sponsorship, and backend review

Audit snapshot: `xgr-network/xgr-interchain` / `main` / `ffc24139738bcb25ab516e5d3242f258a75fcfb8`.

This review was completed from the frozen implementation and its executable tests before reading historical audit reports or remediation narratives. Historical identifiers occurring in code/test comments were not used as evidence that any previous finding was resolved. The scope below is a component review for incorporation into the complete report, not a standalone launch approval.

## Independent findings

### S-A01 - Documented quote-writer migrations can report readiness while paid sponsored quotes fail

- **Current severity:** Medium. **Priority:** P1, with a deployment-specific gate before offering paid sponsorship. **Disposition:** OPEN.
- **Boundary:** database authorization and truthful readiness, not principal custody or message authenticity.
- **Source evidence:** `services/managed-relay/tax-evidence.mjs:130-145` now joins `xita_transfer_operations` to exclude confirmed grants from outstanding liabilities. `services/indexer/sql/010_wallet_aware_sponsor_commitments.sql:49-55` and `011_quote_writer_runtime_grants.sql:24-32` grant the dedicated writer access to commitments, grants and resolutions, but not SELECT on transfer operations. `services/managed-relay/server.mjs:92-101` checks only five table privileges plus the role-name pattern. It does not check that missing SELECT dependency or SELECT on the newly required resolution table.
- **Reproduction:** initialized an isolated PostgreSQL engine (PGlite 0.5.12), created the documented roles, applied exact source migrations 002, 003, 004, 009, 010, 012 and 011, substituting only the psql variable `writer_role=xita_tax_quote_writer`. The exact health SQL returned six true values. Executing the real `saveQuoteEvidence` function with one positive grant then failed with SQLSTATE `42501`, `permission denied for table xita_transfer_operations`. The transaction rolled back completely; no tax or commitment rows escaped.
- **Impact:** a correctly isolated dedicated signer installation can advertise `paidQuoteReady:true` while every positive sponsored quote returns an error. The consolidated `xita_transfer_worker` deployment can already possess the missing SELECT, so this is not evidence that the installed production instance currently fails.
- **Required correction/evidence:** grant only the required read dependency (or use a narrow read-only view/function), include every capacity-query dependency in readiness, and run an actual quote transaction under the installed restricted login. Do not broaden the signer to owner/superuser privileges to bypass the problem.
- **Evidence:** `evidence/sponsorship/sql-permissions.log`; reproducible local harness `audit-work/testbeds/sponsorship/audit-sql-permissions.mjs`.

### S-A02 - A crash between durable grant reservation and transaction journaling can strand a chain's sponsor nonce

- **Current severity:** Medium. **Priority:** P1. **Disposition:** OPEN.
- **Boundary:** optional gas-payout availability and durable recovery; no demonstrated principal theft.
- **Source evidence:** `services/managed-relay/gas-sponsor.mjs:209-223` commits the one-shot grant/nonce reservation before calling `sendTransaction`, then journals the transaction hash only after the send returns. `services/indexer/sql/004_sponsor_grants.sql:17` uniquely reserves `(chain_name,sponsor_address,wallet_nonce)`. `gas-sponsor.mjs:340-343` reconciles only `submitted` rows with a hash; `reserved` and `needs-review` rows have no automated reconciliation. The next grant reads the unchanged on-chain pending nonce (`205-213`) and encounters the permanent uniqueness conflict (`295-303`). Existing unresolved commitments remain liabilities (`tax-evidence.mjs:130-144`).
- **Reproduction:** called the real `sponsorDatabase.reserveGrant` with an isolated deterministic journal, simulated termination immediately after COMMIT and before broadcast, then invoked the real reconciliation function. It checked zero rows. The reservation remained and a different grant at the same on-chain nonce was denied. This test exercises the implementation and models SQL uniqueness; the uniqueness constraint itself is in the applied database schema.
- **Impact:** an ordinary process termination or uncertain send can require operator intervention for all later sponsorship on that chain. The bounded worker is also configured with `TimeoutStartSec=120` (`xita-gas-sponsor.service.example:18`) while a sweep can process up to 120 candidates and wait 30 seconds per send (`gas-sponsor.mjs:228,470-483`), making interrupted in-flight work a concrete operating risk under delay/backlog.
- **Safety qualification:** refusing an automatic second payout protects against duplicate payment. Recovery must preserve that property. The unused-quote expiry reconciliation does not resolve this case: an activated fee quote has `nonceUsed=true`, so it remains a real payable obligation.
- **Required correction/evidence:** persist the exact signed payout bytes/hash before broadcasting, safely rebroadcast only those exact bytes, and reconcile every journal state. Provide a documented, authenticated operator procedure for already ambiguous rows, plus crash testing at reserve/sign/broadcast/journal boundaries. Bound work per sweep to the service's time budget.
- **Evidence:** `evidence/sponsorship/auditor-fault-tests.tap`, test 2.

### S-A03 - A single submitted grant's RPC failure can stop all-chain sponsorship processing

- **Current severity:** Medium. **Priority:** P1. **Disposition:** OPEN.
- **Boundary:** cross-chain failure isolation and sponsored-transfer availability.
- **Source evidence:** `services/managed-relay/gas-sponsor.mjs:340-361` has no per-row exception handling for `getProvider`, `getTransactionReceipt`, or `getTransaction`. A failing old submitted grant rejects the entire `reconcileSponsorGrants` call. `runSponsorSweep` awaits it at `475-476` before entering the otherwise individually guarded candidate loop (`477-484`).
- **Reproduction:** supplied two pending journal entries on different chains to the real reconciler. The first provider returned a simulated RPC 503. The reconciler rejected and the healthy provider's receipt method was never called.
- **Impact:** an outage of one chain or one poisonous journal item can postpone new gas gifts and confirmations on all configured chains, even when the other RPCs and balances are healthy. Timer retries repeat the same blocking item until its external condition clears.
- **Additional queue limitation:** expiry reconciliation scans the oldest 80 unresolved intents (`399-407`); persistent failures can repeatedly occupy this window and delay healthy later expirations. Grant reconciliation similarly has an oldest-40 window without retry scheduling. These are capacity/liveness concerns, not a demonstrated authorization bypass.
- **Required correction/evidence:** isolate errors per grant/chain, maintain durable retry scheduling with fair selection, continue healthy independent work, and expose failed reconciliation health. Test one-chain 403/429/503 and long-stale records while healthy-chain work progresses.
- **Evidence:** `evidence/sponsorship/auditor-fault-tests.tap`, test 1.

## Architectural and operational residual observations

These observations are deliberately separated from the three reproducible defect findings so the final report can consolidate equivalent boundaries without inflating counts.

1. **Sponsor accounting trusts one RPC.** `gas-sponsor.mjs:94-106` takes `rpcUrls[0]`. Expired-quote resolution (`399-431`) reads one finalized head (committed/latest for XGRChain), calls `nonceUsed` at its block number, and stores the earlier hash. It neither obtains an independent witness nor rechecks the hash after the call. Offline fault test 3 demonstrates one head read and one number-tagged call suffice for an immutable `expired-unused` insertion. A compromised/inconsistent provider could incorrectly release a paid obligation and permit overcommitment. This is an optional-service treasury/liability risk, distinct from Direct-BLS principal authorization. Honest unavailable or undecodable nonce evidence is held; elapsed time alone does not release funds.
2. **Unauthenticated reservations remain a bounded service-exhaustion avenue.** `server.mjs:339-361,435-437` limits IP requests to 4/minute, wallets to 2/minute and global requests to 120/minute, but wallet ownership or actual TX1 payment is not required when capacity is reserved. Addresses and requests are cheap; the low per-chain daily budget can be temporarily occupied by quotes never submitted on chain. Finalized expiry reconciliation plus the five-minute grace eventually recovers honest unused intents; it cannot promise immediate recovery during source outages or finalized-head delay. Rate limiting mitigates, but does not prove resistance to distributed exhaustion. No gas is sent merely for requesting a quote.
3. **Unconfirmed grant amounts are conservatively double-counted against the daily quote budget.** The outstanding query excludes only confirmed grants (`tax-evidence.mjs:130-145`); the `spentToday` query includes every grant status (`146-150`), and `sponsorCapacityCovered` sums spent plus outstanding plus new. A reserved/submitted/needs-review amount therefore counts in both terms until confirmation. This reduces availability and does not create unbacked promises. Distinguish this from a dangerous undercount.
4. **Completing TX2 before all prepaid grants are paid can strand an unpaid promise.** Both `sponsorStage` (`28-43`) and `checkCandidate` (`109-133`) require the first parent to remain undelivered. Once TX2 is delivered, unissued onward/final grants become ineligible; the activated quote is not expired-unused and continues consuming liability. The intended UI gates continuation on all upfront grants, but a permissionless external completion or a user using other software can cross this boundary. Offline test 4 demonstrates the eligibility transition. It affects the commercial commitment, not recoverability of the bridge principal through independently funded transactions.
5. **Optional service shutdown does not automatically fulfill pending promises.** `runSponsorSweep` immediately returns when sponsorship is disabled (`437`); the public status endpoint exposes disabled pending obligations rather than claiming completion (`server.mjs:404-413`). A shutdown/rotation procedure must explicitly handle existing commitments and ambiguous rows.
6. **Legacy optional managed relay is a separate operating mode.** Its write-ahead raw transaction journal in `delivery.mjs` is stronger than the gas-gift journal. Its `worker.mjs` and `managed-indexer.mjs` still use confirmation-count source observations and latest destination `delivered()` for their own worklist status. The cryptographic destination proof remains independently required, but this mode's journal is not evidence of native final settlement. Installed status was not independently available in this component review; do not conflate it with the normal two/four user-authorized transaction flow.

## Verified implementation properties

- EIP-712 data binds payer, gateway, source chain and verifying adapter, route, first/final domains and recipients, onward route, amount, source bridge value, commercial fee, nonce and issuance time. `buildManagedQuote` refuses a deployed lifetime outside 1..90 seconds and bounds source tip clock drift. The contract-side checks are covered by the separate Solidity review.
- The signer service is loopback-only. The keyless preview cannot sign or allocate a nonce. Source adapter runtime hash, expected registry, fee beneficiary and service-wallet identity are checked before producing the response.
- Quote signatures are constructed internally before storage but are not returned to the client until the tax evidence, quote intent and every positive grant commitment commit successfully in one database transaction. A duplicate nonce and inadequate capacity roll back.
- Multi-chain quote budget locks are acquired in sorted order, remain held until COMMIT, and share the per-chain lock name with payout reservation. Fresh sponsor wallet balance/fee evidence is read within the quote critical section. The outstanding balance includes unresolved expired promises unless an explicit unused resolution exists.
- Wallet-aware allocation consumes each chain's existing wallet balance only once across sequential stages, never treats arriving user principal as sponsor funding, and prepays positive first-delivery/onward/final-delivery grants after TX1.
- Grant execution independently reconstructs finalized source receipt evidence and checks fee nonce, fee amount, route, payer/final recipient, amount, and onward intent against immutable quote rows. Duplicate grant identity and sponsor nonce are constrained in SQL. A user-supplied destination/amount is not accepted as payout authority.
- Successful payout status requires exact journal identity, a covering L2 `safe` head, and canonical receipt block/hash rechecks. XGRChain additionally waits two blocks. Unsupported or failed finality reads do not mark a grant confirmed. L2 `safe` here is not final Ethereum settlement.
- Nginx overwrites client IP headers for the quote endpoint; the service accepts IP evidence only from its loopback proxy. Admin binds loopback, checks Host/Origin/cross-site headers, and the deployment example requires Basic authentication for `/admin/`. Production Nginx/OS/user separation remains unverified.
- Service health distinguishes missing quote permissions from a healthy HTTP heartbeat, but its dependency coverage is incomplete as demonstrated by S-A01.

## Tests actually executed

Environment: Node.js `v24.22.1`. Unchanged copied source in an isolated testbed; dependency directory reused from an existing toolchain. No production RPC write, transaction, deployment, source patch or configuration change was made.

| Test group | Result | Evidence |
|---|---:|---|
| All 16 managed-relay test files, named tests with `--test-isolation=none --test-reporter=tap` | 92 passed / 0 failed | `evidence/sponsorship/managed-relay-tests.tap` |
| Admin operations health, read-only reconciliation, service wallet rotation, quote database role and Nginx fee-route checks | 20 passed / 0 failed | `evidence/sponsorship/admin-security-tests.tap` |
| Auditor-authored fault scenarios using actual exported functions | 4 passed / 0 failed (four documented failure conditions reproduced) | `evidence/sponsorship/auditor-fault-tests.tap` |
| Actual schema/grants/readiness/real quote persistence against isolated PostgreSQL engine | Expected permission failure reproduced; atomic rollback verified | `evidence/sponsorship/sql-permissions.log` |

The initial default Node isolated run reported only 16 file-level passes and is not counted separately. An initial admin testbed run failed two tests because `manage.sh` had not yet been copied; rerunning against the complete unchanged fixture passed all 20. These fixture failures were not application failures.

The PostgreSQL runtime package and checksum are recorded in `evidence/sponsorship/sql-runtime.json`. PGlite is a PostgreSQL/WASM engine; this test verifies actual SQL authorization and rollback, not production PostgreSQL multi-process concurrency or the installed role layout. Concurrent lock correctness was reviewed statically and through repository unit tests, not stress-tested against the production database.

## Component-level launch assessment

No Critical/High principal-loss or mint-authentication defect was demonstrated in this component. The reproducible findings affect optional paid gas sponsorship, recovery and truthful readiness. For controlled launch, verify the exact production quote role and all grants with a real persistence transaction; prove a monitored response for ambiguous payouts/nonce locks and cross-chain outages; expose the service as optional with self-funded recovery. Scaling paid sponsorship before addressing S-A02/S-A03 would not be supported by this evidence. This component conclusion does not replace the complete protocol/on-chain/production assessment.
