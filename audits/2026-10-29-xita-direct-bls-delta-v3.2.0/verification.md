# Verification and reproducibility

Audit `XITA-DBLS-2026-10-29-v3.2.0`. Frozen Interchain `5cfc095d0f02271427832ee6bbb268322f38ae2d`; node `51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671`.

## Source and independence

Both previous commits exist, are ancestors (or identical), and match the preceding source-freeze metadata. Complete endpoint and individual-commit changes cover 62 Interchain commits/48 paths and zero node delta. All 48 review statuses are REVIEWED. The sealed Phase A master SHA-256 is `8a6651e9ed0167e7605dab9d129a0fa8019833a37bb5bd348373dadc5bf49a52` and predates detailed historical reassessment. The published Phase A file is a clearly identified safe derivative; `phase-a-publication.json` records its separate digest. The exact original is included in protected evidence.

## Execution provenance

Use `test-matrix.md` and `evidence/fresh-test-executions.json` for every recorded fresh test invocation: command, exact repository/commit, runtime, UTC interval, expected/observed result and output digest. Protocol UI/source/retained-evidence commands are separately recorded in `evidence/protocol/`. Actual existing-test logs are public; custom negative fixtures and raw security traces resolve inside the protected ZIP. Repeated runs and parent TAP events are not added as unique test coverage. No fresh Go/Foundry execution or new production end-to-end transfer is claimed.

One product test assertion fails: the unchanged rpc-read negative expectation conflicts with the intended block-pinned read and its own positive test. It is F-14, not suppressed or classified as a principal failure. Initial audit matcher/fixture and sandbox errors are retained and explicitly distinguished from product behavior. The publication workflow's result is separately checked; CI does not replace finding-level proof.

## Current and historical coverage

`findings.csv` contains F-01 through F-35 exactly once; all F-01 through F-32 are reassessed. Current residual counts are 0 Critical, 0 High, 14 Medium, 12 Low and 2 Informational, plus seven resolved causes. The 43-occurrence historical matrix preserves all prior cells and uses v3_2_* fields for this assessment. Historical occurrences and repeated legacy IDs are not added to unique current totals. Source, fresh test, inherited execution, read-only production and non-executed boundaries are explicit.

## Independent artifact checks

Run `python verify_artifacts.py` in this directory or use --audit-dir followed by its path. The checker validates the actual PDF, Markdown, required matrices, ZIP CRC/member hashes and archive manifest. The PDF is generated from full report.md with `python render_report.py`; its validation record contains actual page/text checks and visual QA. Public and confidential manifests bind the original and curated evidence. The exact main-branch readback is checked after merge against the local artifact manifest and recorded in the publication attestation.

## Live scope and limits

The live deployment record checks 57 runtime hashes and 57 canonical successful receipts. Observed node endpoints identify v3.4.0 and agree on the activated fork history. Health reports sponsoring available but does not establish the omitted effective-role dependency or all private operational state. Supplementary provider HTTP403 responses and absent host attestations remain evidence limitations. They are not observed vulnerabilities and do not independently produce NO-GO. No production state was changed.
