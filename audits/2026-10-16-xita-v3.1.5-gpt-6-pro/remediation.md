# Remediation register — XITA v3.1.5 (public summary)

**Disclosure state:** IN PROGRESS. Detailed technical findings remain in the confidential original report until the corrections are evaluated and responsibly published. This document is deliberately not the source of sensitive reproduction steps.

## Findings at the frozen audit revision

| ID | Area | Severity category at audit | Status (2026-10-17) | Resolution and evidence |
| --- | --- | --- | --- | --- |
| A-01 | Route discovery / recovery interoperability | Availability: high when affected configuration is used | `FIXED_IN_CODE` (requires verification) | [Interchain PR #130](https://github.com/xgr-network/xgr-interchain/pull/130), commit `c4b4b63ef7c6aef4f1b09c76a112797607d01759`. Validate against node `XGR3.0` with dynamically discovered routes and real recovery. |
| A-02 | Validator lifecycle client integration | Operational: medium | `DEPLOYED_REPORTED` (live admission E2E pending) | Fixed in node [PR #34](https://github.com/xgr-network/xgr-node/pull/34), merge commit [`a26e93136fd936e654d70b784d4f57114a9068fd`](https://github.com/xgr-network/xgr-node/commit/a26e93136fd936e654d70b784d4f57114a9068fd); also backported to private `xgrchain/PoS_3` [PR #1534](https://github.com/xgr-network/xgrchain/pull/1534). `set-active` registers Registry V3 BLS possession before unchanged quorum-controlled ADD; read-only `xgr_getInterchainValidators(destination)` added. Official [v3.1.6 release](https://github.com/xgr-network/xgr-node/releases/tag/v3.1.6) and [release workflow #38914011710](https://github.com/xgr-network/xgr-node/actions/runs/38914011710) succeeded, including integration, EEST and ForkGate. Mainnet-node rollout reported by operator on 2026-10-17; exact installed binary hashes and new-validator PoP + quorum ADD/REMOVE on live Registry V3 **not independently verified**. |
| A-03 | ERC-20 route metadata / transfer UI | Functionality: medium | `OPEN` (draft PR, not merged) | [Interchain PR #133](https://github.com/xgr-network/xgr-interchain/pull/133), proposed commit `0961dd629cb8627b41037ae81346a7b7c4a0bc0f`. Three GitHub CI workflows passed; browser/production acceptance still pending. |
| A-04 | Recovery response / wallet-intent validation | Defense in depth: low | `OPEN` (draft PR, not merged) | [Interchain PR #134](https://github.com/xgr-network/xgr-interchain/pull/134), proposed commit `fb8ba10d16a182007b971d409c8cb95c1ebf1281`. Three GitHub CI workflows passed; deployment and independent review pending. |

**Important:** A-01 was fixed in the codebase *after* the audited commit. That does **not** close its end-to-end availability risk or establish deployment of the new version. Draft PRs are proposed code, not merged remediation; do not promote OPEN findings to VERIFIED/RELEASED without the required evidence.

## Accepted architectural choices (not fix requests)

| ID | Accepted design | Rationale and ongoing controls |
| --- | --- | --- |
| AR-01 | Permissionless registration may precede registration of its reverse route. | XITA's actionable wallet flow requires the curated, deployed pair; direct contract calls are permissionless. Do not add central route admission. |
| AR-02 | Quorum-authorized membership changes may reduce the interchain validator set below three. | Three validators is an *operational target*, not an immutable contract minimum. Monitor destination-scoped set health. No mandatory registry redeployment. |
| AR-03 | Immutable transport without a centrally owned emergency pause. | Limits unilateral intervention. Incident response relies on detection, delivery controls and documented migration/recovery procedures, not a newly introduced admin key. |

Review accepted risks if trust assumptions, route scope, validator independence or incident handling change. Neither these accepted choices nor a clean CI run constitute security certification.

## Traceability requirements

Every remediation shall record: issue/advisory identifier (if access-controlled), affected repository, PR URL, merge commit, test command/results, tested revisions, release/deployment verification (if applicable), reviewer/date and residual risks. Link multiple PRs where a finding spans both repositories.

The v3.1.6 mainnet-node rollout is operator-reported; this register does not independently authenticate deployed binary hashes, on-chain validator admission or auditor sign-off. No report publication is implied.
