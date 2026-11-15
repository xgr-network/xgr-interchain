# XGR-Node v3.5.1 recovery review

**Companion to XITA delta audit revision 3.4.0 | 15 November 2026**

AI-assisted source-frozen delta reassessment, not an external audit-firm certificate. The reviewer had the prior conversation, finding register and some implementation history; this is neither blind nor independent of all prior development. New executions and contradictory outcomes are recorded separately from inherited evidence. No production transactions, service restarts, contract deployments or product-code changes were performed.

## 1. Frozen scope and decision

Reviewed node commit: `723ff829d7380a29a116fd2f29c3b808ec073c0d`. Prior audited target: `a84c82737dc3ca195192a96498eab0e170f8bb5a`. The F-20 product fix entered XGR3.0 in `d5e8977a0fa1059b2ccf25ecefc360c7454e39df`; later commits package the light release and remove legacy workflows. Only iln_checkpoint.go and its new F-20 test change executable/test Go content. Consensus, staking, the activated BLS proof-of-possession fork, chain configuration and XITA wire encoding are unchanged.

**F-20: VERIFIED / RESOLVED for the original reviewed cause.** This is not a whole-node audit or evidence that every production node has installed v3.5.1.

## 2. Original cause and corrected ownership transition

The prior caller treated a generic nil signing error as evidence that replacement recovery work existed. Ineligible signing or a non-durable already-existing state could therefore permit retirement of the old vote before a durable current-set successor was available. The new caller checks a local-signer successor in memory and in the persisted journal and compares the full authenticated message with only its validator-set epoch replaced. Fee, source/destination domains, router, gateway, registry and ISM must all remain identical.

The successor file is written and synchronized, renamed into place, and its parent directory is synchronized before success. An absent, wrong-set, wrong-route, wrong-signer, altered-fee or corrupt persisted successor cannot satisfy retirement. The old evidence is retained when replacement does not meet that gate. This preserves availability evidence; it does not grant new signing privileges or change quorum rules.

## 3. Fresh execution evidence

| Execution | Outcome |
| --- | --- |
| Current interchain/direct-BLS/JSON-RPC packages | 495 test passes; one fuzz seed skipped; zero failures. |
| Existing F-20 repeated test | Five passes. |
| Supplemental existing + write-failure/restart tests | Five repetitions of each; ten passes. |
| Official release binary digest | Matches published SHA256 manifest. |

The audit-added failure case deliberately makes the successor temporary path unwritable as a file, observes the persistence error and verifies that the original vote remains. It then removes the test-only obstruction, persists a correct successor, constructs a new Worker, recovers the journal and proves that retiring the old entry does not remove the successor. These are isolated local filesystem tests, not production fault injection. They do not simulate physical power loss, every fsync error or all possible concurrent filesystem schedules. The synthetic journal signatures are not claimed to test subgroup validity; current BLS/message suites provide separate cryptographic-path evidence.

## 4. Rollout and binary provenance

The official v3.5.1 download is bound to full commit `723ff829d7380a29a116fd2f29c3b808ec073c0d`, reports Go 1.23.12 in toolchain.txt and hashes to `20b99c8946ef3f33150b566957c791fb1a15e72999ef51ac81f8af7da9211ee1` (73,288,622 bytes). The manifest and streamed binary agree.

At the recorded public snapshot, rpc1 advertised v3.5.1 and rpc2 v3.5.0; both advertised Go 1.23.11. A routed endpoint may represent a distinct backend and its banner is not an executable checksum. Consequently, complete uniform validator rollout and exact host-artifact identity are not independently attested. This is an operational verification item, not a finding that the new protocol forks or breaks consensus. Keep the existing genesis and activated PoP configuration. Do not delete vote journals or alter staking state to resolve a version discrepancy.

## 5. Other node findings retained

**F-03 - Medium / OPEN.** Peer checkpoint/governance work still reaches expensive remote evidence paths before complete cheap authenticated admission, while gossip can create independent work goroutines. The F-20 storage change does not add global/per-peer work or proposal-expiry admission bounds. Existing Medium remains open.

**F-04 - Low / PARTIALLY_MITIGATED.** Per-route observer isolation is improved from older baselines, but shared capacity and I/O failure constraints remain. These paths are unchanged by F-20. Repeated current tests do not establish oldest-work progress under sustained capacity saturation.

**F-05 - Medium / OPEN.** External source evidence is compared as complete snapshots across distinct configured witness identities; native XGR uses its local state path. Endpoint/operator labels do not prove independent physical upstreams. The live receipt checks confirm observations, not upstream independence. No new risk acceptance is recorded.

**F-21 - Medium / OPEN.** A successful but incomplete log response can still advance a durable discovery cursor. Full independent authentication of discovered messages prevents signing invented source activity, but it does not prove that every valid message was discovered. Known-hash recovery mitigates availability, not completeness.

**F-29 - Medium / OPEN.** Legacy governance/membership submission and receipt paths still contain RPC waits not uniformly governed by the worker cancellation/deadline. Worker shutdown waits for work completion; the F-20 local journal change does not supply cancellation throughout that call graph.

**F-32 - RESOLVED / VERIFIED / RESOLVED.** Bounded expiry cleanup for unverified unknown-route request hints remains present. Authenticated votes and attestations are outside that cleanup rule. Original permanent request-file accumulation remains resolved on the existing evidence and unchanged source.

## 6. Operator acceptance and limits

Verify each intended node process/container version and binary hash against the official artifact using the existing rollout runbook, and confirm peer synchronization, quorum continuity and Direct-BLS journal operation. That evidence can qualify rollout without reopening the source-resolved F-20 cause. No new activation block, restaking, key rotation or contract redeployment follows from this audit.

The main report carries all 40 current causes and the historical reconciliation. Optional sponsor and Creator availability defects are not recast here as consensus or immutable-contract defects. The source conclusions are frozen even if later product maintenance or public endpoint versions change.
