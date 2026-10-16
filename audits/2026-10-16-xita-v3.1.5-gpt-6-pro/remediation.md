# Remediation register — XITA v3.1.5 (public summary)

**Disclosure state:** IN PROGRESS. Detailed technical findings remain in the confidential original report until the corrections are evaluated and responsibly published. This document is deliberately not the source of sensitive reproduction steps.

## Findings at the frozen audit revision

| ID | Area | Severity category at audit | Status (2026-10-16) | Resolution and evidence |
| --- | --- | --- | --- | --- |
| A-01 | Route discovery / recovery interoperability | Availability: high when affected configuration is used | `FIXED_IN_CODE` (requires verification) | [Interchain PR #130](https://github.com/xgr-network/xgr-interchain/pull/130), commit `c4b4b63ef7c6aef4f1b09c76a112797607d01759`. Validate against node `XGR3.0` with dynamically discovered routes and real recovery. |
| A-02 | Validator lifecycle client integration | Operational: medium | `OPEN` | Cross-repository membership regression and operational acceptance pending. |
| A-03 | ERC-20 route metadata / transfer UI | Functionality: medium | `OPEN` | Collateral and synthetic positive/negative browser/API tests pending. |
| A-04 | Recovery response / wallet-intent validation | Defense in depth: low | `OPEN` | Source-message-bound calldata validation and regression test pending. |

**Important:** A-01 was fixed in the codebase *after* the audited commit. That does **not** close its end-to-end availability risk or establish deployment of the new version. PR links for A-02/A-03/A-04 must be added when the work is actually proposed; never invent completion evidence.

## Accepted architectural choices (not fix requests)

| ID | Accepted design | Rationale and ongoing controls |
| --- | --- | --- |
| AR-01 | Permissionless registration may precede registration of its reverse route. | XITA's actionable wallet flow requires the curated, deployed pair; direct contract calls are permissionless. Do not add central route admission. |
| AR-02 | Quorum-authorized membership changes may reduce the interchain validator set below three. | Three validators is an *operational target*, not an immutable contract minimum. Monitor destination-scoped set health. No mandatory registry redeployment. |
| AR-03 | Immutable transport without a centrally owned emergency pause. | Limits unilateral intervention. Incident response relies on detection, delivery controls and documented migration/recovery procedures, not a newly introduced admin key. |

Review accepted risks if trust assumptions, route scope, validator independence or incident handling change. Neither these accepted choices nor a clean CI run constitute security certification.

## Traceability requirements

Every remediation shall record: issue/advisory identifier (if access-controlled), affected repository, PR URL, merge commit, test command/results, tested revisions, release/deployment verification (if applicable), reviewer/date and residual risks. Link multiple PRs where a finding spans both repositories.

No report publication, mainnet deployment or auditor sign-off is implied by editing this register.
