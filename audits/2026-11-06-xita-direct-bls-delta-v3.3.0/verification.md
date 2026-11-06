# Verification and evidence ledger

## Evidence classes

Fresh execution, fresh source proof, inherited evidence, read-only deployment observation and unverified installed-state claims are separate. A positive test is not an exhaustive proof; a reproduced negative is a demonstrated defect, not a fix. Missing evidence is not automatically a source vulnerability.

## E-01 - Broad isolated XITA regression execution

Run 42189607123 on exact source 33a4e37cf48c509b83c67d8007c246ff2838c606. The supplied JSON contains 173 test-file executions: 165 exit zero, eight fail. Every log is retained under evidence/tests. Disposable PostgreSQL 16 and test-only dependencies were used. Node was v24.22.2. No fixture was patched to force green status. See test-failure-triage.json for all eight failures. Some package fixtures use mocks; do not equate their count with production transactions.

## E-02 - Fresh node validation

Run 42189607123, exact target a84c82737dc3ca195192a96498eab0e170f8bb5a. scripts/validate-v3.5.0.sh returned zero: reproducible staking artifacts/layout, 19 selected package groups, full Go build and the isolated fork/restart/fresh-sync test. Go 1.23.11 and pinned Solidity 0.8.30. evidence/node-validation.log and node-validation.exit retain the outcome.

## E-03 - Restricted PostgreSQL roles

Run 42191493460. Actual monitor queries and exact production readiness SQL run as restricted roles. Missing intent-read readiness is detected before repair; all nine checks pass after the documented narrow migration. Required joined reads work, immutable debt UPDATE/DELETE remain denied and unrelated role promotion fails. This is not a live host migration attestation or a new paid transfer.

## E-04 - Repeated recovery and possession regressions

Run 42191493460: go test -p 2 -count=3 -timeout=5m ./jsonrpc ./interchain/runtime ./consensus/ibft/blspop. All three packages pass the repeated run. Retained log: evidence/node-repeat.log. Repetition increases confidence in the exercised cases; it does not prove the remaining F-20 persistence branch safe.

## E-05 - Read-only deployment and activation observations

101 retained deployment receipt records, two configured endpoints per record: 202 observations, 114 verified, 88 unavailable due to HTTP 403/429, zero demonstrated mismatches. XGR: 58 verified; Base: 20 verified/16 unavailable; Arbitrum: 18/18; BSC: 0/36; Optimism: 18/18. BSC's positive finalized-head observation is not substituted for unavailable receipt/runtime checks. Endpoint URLs do not prove physical independence.

Both XGR endpoints report v3.5.0, the same 11,627-byte reviewed staking runtime, the expected migration marker and matching sampled block/state hashes around activation. Exact results/timestamps are in evidence/read-only-deployments.json. No transfer, payout, deployment, signing request or service restart was performed. Public RPC access failures do not by themselves justify a source NO-GO.

## E-06 - Fresh Solidity build and tests

Run 42189607043, job 127798101246, synthetic merge 0106b46e5e9d4cd4e016f18cf669679f20d35b48. Product source is unchanged from the frozen target; only audit instrumentation/documentation differs. 111 tests across 17 suites pass, zero fail/skip. Includes eight Creator tests, Direct-BLS replay/signature controls, native backing/claims, fees and two-hop accounting. Solidity 0.8.24, Foundry 1.9.0, 82-source import closure and trusted constructor/runtime checks pass. This green suite does not override E-01's eight failing test files.

## E-07 - Independent private negative cases

Local Node v22.16.0 executions used the real frozen Creator registration/operator/verification/rendering code with controlled RPC/mail/time dependencies. Four unique causes are recorded as F-36 to F-39; two queue-validation variants count once. No real transaction was broadcast. The original source-first master and fixture/result hashes are in protected-evidence-reference.json. Detailed unresolved inputs are withheld from the public package, so third-party rerun access is not claimed. Operator copies remain separate.

## Source and historical evidence

Complete inventories cover 333 Interchain paths and 65 node paths, including 117 historical audit-publication paths in the Interchain delta. Classification is not a line-by-line coverage percentage. Current/historical source-comparison files retain exact blob identities; 43 historical occurrences keep every previous CSV column unchanged. Prior custom execution traces are inherited unless a fresh test is explicitly identified. The v3.5.0 release document was obtained by exact blob cef98a7e6ae16646a9291cbf0d56b746a41d6c4d; it does not attest every current installed binary.

## Reproduction and artifact integrity

The public builder and assessment data reproduce the report structure, matrices and PDFs from exact source/evidence inputs. Run build_reports.py with --interchain, --node, --evidence and --out paths after supplying the declared input directories. It performs no chain or production writes. ReportLab 4.4.9 and standard PDF fonts are used; no font files are distributed. archive-manifest.json binds the actual generated bytes; the manifest cannot hash itself. evidence-public.zip contains public existing execution evidence, not the protected new attack fixtures. verify_artifacts.py verifies local hashes and counts.
