# XITA security audit register

This directory records the independently conducted XITA security audits, their exact code snapshots, testing methods, evidence and remediation decisions. The assessments were conducted using **OpenAI GPT-6 Astra** as specified by the audit operator. Findings are evaluated against reproducible technical evidence, not by comparing human and AI reviewers. CI outcomes and deployed-runtime verification are tracked independently.

## Current audit

| Audit ID / date | Scope and frozen revisions | Findings at baseline | Disclosure | Status |
| --- | --- | --- | --- | --- |
| [XITA-DBLS-2026-10-25-v2.0.0](./2026-10-25-xita-direct-bls-reassessment-v2.0.0/) | `xgr-interchain/main` `eb2d8e7f885a81d33cfb494b0b55b3fa722780e2`; `xgr-node/XGR3.0` `d90da4d75b899576c4c4eaab864cbc10ab19a370` | 0 Critical, 4 High, 11 Medium, 8 Low, 3 Informational | Original 35-page report and 137-entry evidence package identified; actual bytes still to be attached | Source fixes ongoing |
| [XITA-DBLS-2026-10-24-v1.0.0](./2026-10-24-xita-direct-bls-v1.0.0/) | `xgr-interchain/main` `ccef5cd429bf8ad8cb63bd5778c1fae7aaf185cc`; `xgr-node/XGR3.0` `6f5e36b8147eae6275c2fefaadec7aa8488dc674` | 0 Critical, 1 High, 6 Medium, 7 Low, 3 Informational | Redacted public summary; original report and reproductions access-controlled | Open; no release sign-off |

## Historical records (not active audit baselines)

- [PR #131](https://github.com/xgr-network/xgr-interchain/pull/131), October 2026: earlier `audits/` lifecycle, remediation and verification register, **closed without merge**.
- [PR #278](https://github.com/xgr-network/xgr-interchain/pull/278), October 24: preliminary Direct-BLS review under an older revision, **not the final independent audit**. Its earlier findings must not be treated as current without fresh verification.

The older architecture's findings are neither silently inherited by nor merged into the October 24 full Direct-BLS audit.

## Status semantics

- `OPEN`: documented at the frozen baseline; no integrated, independently verified remediation recorded.
- `FIXED_IN_CODE`: exact corrective merge commit known, verification/deployment pending.
- `VERIFIED`: regression, integration and adversarial evidence verified on pinned commits.
- `RELEASED`: verified fix and correct target rollout confirmed.
- `ACCEPTED_RISK`: explicitly recorded residual architecture decision and review trigger.
- `NOT_APPLICABLE`: disproven or superseded with written evidence; never silently erased.

Findings are immutable as originally assessed. Track later remediation in `remediation.md`, verification in `verification.md`, and retain exact revision/provenance. Passing unit tests does not authorize on-chain deployments.

## Responsible disclosure

This repository is **public**. Do not commit unrepaired exploit steps, private reproduction fixtures, raw security logs, signing material or the unrestricted audit evidence archive to any public branch, PR, issue or Actions artifact. The original PDF/ZIP artifacts are identified in their versioned audit directories. Do not claim public availability until the exact PDF/ZIP bytes have been uploaded and their hashes verified. Review confidential evidence packages for secrets and exploitable details prior to publication. See [SECURITY.md](../SECURITY.md).

On-chain deployment receipts are authoritative only in `deployments/` and the verified chains; the audit ledger is not a substitute.
