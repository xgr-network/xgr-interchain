# XITA security audit register

This directory is the permanent, version-pinned register for XITA security assessments. Each independent architecture revision receives its **own immutable audit baseline**. An AI-assisted security audit is not a human third-party certification, and passing CI is not a mainnet security approval.

## Current audit

| Audit ID / date | Scope and frozen revisions | Findings at baseline | Disclosure | Status |
| --- | --- | --- | --- | --- |
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

This repository is **public**. Do not commit unrepaired exploit steps, private reproduction fixtures, raw security logs, signing material or the unrestricted audit evidence archive to any public branch, PR, issue or Actions artifact. The original PDF/ZIP are preserved under controlled access and identified by SHA-256 in the versioned audit. Publish original material only after fixes, validation and disclosure review. See [SECURITY.md](../SECURITY.md).

On-chain deployment receipts are authoritative only in `deployments/` and the verified chains; the audit ledger is not a substitute.
