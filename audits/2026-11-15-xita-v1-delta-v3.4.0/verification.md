# Verification and evidence limits

## E-01

Frozen Git archives and complete diff inventories from run 43696416777; exact commit/tree and archive hashes retained. Interchain: 235 changed paths, 13 non-audit paths. Node: 13 changed paths, only two Go files. Relevant prior source references: 73 unique files, 66 identical Git blobs and seven changed.

## E-02

Complete file discovery on frozen Interchain in run 43696812308: 174 test files; 166 pass and eight fail; TAP aggregate 1,046 tests, 1,035 pass, 11 fail, zero skipped/cancelled. The eight failing files are the same historical fixture/discovery issues. An initial harness aborted at the first failure; the corrected run explicitly captured all results. Its continue-on-error is evidence collection, not a full-suite pass.

## E-03

Fresh frozen-node test run 43696416777: 495 passing test events, one skipped fuzz seed, zero failing test events, six nonempty packages. Five separate repetitions of the existing F-20 journal test pass. This is not the full consensus/EEST suite or a replay of every historical exploit.

## E-04

Supplemental run 43696812308: five repetitions each of the existing F-20 test and an audit-added blocked-file-write/restart test, ten passes total. Original evidence remains after failed successor write; recovered successor survives old-vote retirement. This exercises logical write failure and restart, not physical power loss or every filesystem failure mode.

## E-05

Fresh Foundry run 43696812357, job 132759080254, synthetic audit merge 835864e7e228bdb10b1854757da120efdcd337b6 with unchanged product sources: 111 tests across 17 suites pass, zero fail/skip. Foundry 1.9.0, Solidity 0.8.24, 82-source import closure; constructor/sealed-build and runtime/initcode eligibility checks pass.

## E-06

Read-only production snapshot 2026-11-15T08:56:28.945Z to 08:56:37.063Z. 101 recorded contracts x two configured endpoints = 202 observations: 119 verified, 83 unavailable, zero mismatches. 78 unique receipts have at least one verification, 41 both. rpc1 advertises v3.5.1; rpc2 v3.5.0. Official release binary SHA256 matches the published manifest. Managed/Join/transfer health respond HTTP 200, but sponsorship aggregate availability is false with Base unready. No production write was sent.

## E-07

Local Node v22.16.0 controlled Creator executions use real admission, email confirmation, queue and manifest validation with mocked mail/RPC/signature/publisher boundaries. Positive control advances a healthy sibling. Two admitted metadata-boundary variants reach deployed state then block three consecutive sweeps and leave a healthy sibling queued. Oversized UTF-8 name now rejects. A separate expired-contact-retention case deletes an unresolved signed record. Zero real sends.

## E-08

Local export-only instrumentation of the exact frozen gas-sponsor module exercises the actual scheduler, local signer and send function with pre-authenticated fixture preflights and mocked DB/network. A stalled first destination broadcast blocks a healthy second effect beyond four read deadlines although both preflights finish. The second effect can start after its fixture parent completes externally while queued; the fresh-send path has no final delivery reread. A timed-out-read negative control still produces zero late sends. This is not an end-to-end source-authentication bypass or mainnet attack.

## E-09

Actual isolated PostgreSQL 16 reviewer role: normal CLI succeeds; UPDATE and private recipient-column SELECT fail with 42501. Direct table INSERT nevertheless accepts a different sponsor, arbitrary reviewer identity and historical recorded_at for an existing grant key. The underlying obligation remains present; no grant/payment mutation is authorized.

## E-10

Local controlled Creator proof test invokes the actual two-RPC verifier with internally consistent but mutually different creation-block hashes at the same height. Normalized comparison accepts both because canonical block identity is omitted. This re-verifies existing F-38; no token-ownership or supply-check bypass is asserted. Zero real RPC calls.

## Reproducibility and limitations

Complete public logs, source inventories and exact hashes accompany the report. The initial JavaScript harness stopped at its first failed file due shell errexit; its partial result is not counted as a full run. The corrected all-files collector records every exit code and continues for evidence collection. Standard green CI and the evidence collector status do not override those failures.

Runnable unresolved metadata/proof fixtures are delivered separately in an operator archive, not placed in the public repository. Public hashes and execution summaries bind the retained originals. Third-party independent rerun access is not claimed without that archive. The scripts use only synthetic identities and mocked external effects.

No physical power-cut, all-node host attestation, full production load attack, exhaustive compiler equivalence, regulatory/legal opinion or complete historical economic solvency proof is claimed. RPC access failures are not code mismatches. Tests using mocked effects do not constitute mainnet transfers. The Go journal fixtures do not themselves prove cryptographic signature validity; separate current suites exercise BLS and message authentication.
