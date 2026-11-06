# Phase A seal - source-first security review

The source-first assessment has been sealed before opening the detailed prior finding records for fresh historical reconciliation.

- Audit: `XITA-DBLS-2026-11-06-v3.3.0`
- Companion: `XGR-POP-2026-11-06-v1.0.0`
- Interchain target: `33a4e37cf48c509b83c67d8007c246ff2838c606`
- Node target: `a84c82737dc3ca195192a96498eab0e170f8bb5a`
- Protected Phase A master SHA-256: `24618adefa6ac2955c45de21a3121e49fd84cadb333b6d8c6613ff0b2779c320`
- Solana: excluded.

This was **not a genuinely blind assessment**: prior finding summaries were already present in the operator conversation. The sequencing prevents subsequent detailed historical reconciliation from silently rewriting the initial observations; it does not claim external accreditation or independence from AI-assisted prior development.

## Publication-safe initial observations

Four new Creator candidates require final classification: one Medium availability defect, two Low recovery/evidence defects, and one Informational presentation inconsistency. Independent isolated reproductions support these observations. No unauthorized token ownership transfer or principal theft was demonstrated.

The node possession review found no additional demonstrated Critical or High defect in the examined delta. Fresh possession validation, a full build, isolated fork/restart/fresh synchronization, and three repeated JSON-RPC/runtime/manifest test runs passed. Both public XGR RPC endpoints agree on the current staking runtime and sampled historical block/state identities around activation.

The source-first review also found remaining limits in recovery handoff and admin finality presentation that must be reconciled against existing findings rather than double-counted. Sponsor timeout-effect separation and the restricted-role repair have fresh positive regression evidence.

The complete changed-path inventory contains 333 Interchain paths (117 audit-publication paths, 216 non-audit paths) and 65 node paths. The isolated XITA run executed 173 test files: 165 succeeded and eight failed. The separate Solidity run passed 111 tests. These results must not be replaced by a blanket green-CI assertion.

Read-only observations checked 101 retained deployment receipts against two configured endpoints each: 114 successful endpoint verifications, 88 unavailable observations due to HTTP 403/429, and no demonstrated mismatch. Missing endpoint observations are not source vulnerabilities and do not by themselves justify an adverse installation decision. Distinct endpoint URLs do not prove independent physical upstreams.

## Disclosure and status

Detailed unresolved reproduction material and the original sealed master remain protected. The eventual public derivative must identify its relationship to this master. No product fix, production transaction, deployment, configuration change or service restart was performed by this audit. This seal is not an operating approval; final decisions follow historical reconciliation and evidence review.
