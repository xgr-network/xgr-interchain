# XITA security audit register

This directory records the independently conducted XITA security audits, their exact code snapshots, testing methods, evidence and remediation decisions. The assessments were conducted using **OpenAI GPT-6 Astra** as specified by the audit operator. Findings are evaluated against reproducible technical evidence, not by comparing human and AI reviewers. CI outcomes and deployed-runtime verification are tracked independently.

## Current assessment

[**XITA-DBLS-2026-10-27-v3.1.0 - correction r1**](./2026-10-27-xita-direct-bls-delta-v3.1.0/): **CONDITIONAL GO for restricted self-funded core transfers**, subject to the explicit conditions in the [corrected report](./2026-10-27-xita-direct-bls-delta-v3.1.0/report.pdf). Unattended sponsorship is not approved. The blanket activation-related NO-GO rationale is withdrawn after incorporating the canonical Mainnet genesis and retained runtime evidence. Missing per-validator host attestation remains an assurance limitation, not an independently established vulnerability.

Frozen sources: Interchain `26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3`; node `51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671`. This publication is the focused correction supplement, not a claim that the previously prepared 90-page delta draft and its complete evidence package have been archived. It includes the actual correction PDF/Markdown, compact finding register, historical snapshot/overlay, public-safe evidence ZIP and integrity manifest.

## Preserved prior audit baselines

The decisions below apply to their original frozen revisions and are retained as historical assessments, not a replacement for the current scoped correction above.

| Audit ID / date | Scope and frozen revisions | Findings at baseline | Disclosure | Status at that baseline |
| --- | --- | --- | --- | --- |
| [XITA-DBLS-2026-10-27-v3.0.0](./2026-10-27-xita-direct-bls-final-v3.0.0/) | `xgr-interchain/main` `ffc24139738bcb25ab516e5d3242f258a75fcfb8`; `xgr-node/XGR3.0` `4d341a08baa604c7871e10af8c7c2e2406f4d032` | 0 Critical, 1 High, 17 Medium, 9 Low, 2 Informational; all 43 historical occurrences reassessed | Full English PDF/Markdown, public evidence ZIP and exact artifact manifest; confidential reproductions separately archived | **NO-GO**; source and production gates remained open at the historical baseline |
| [XITA-DBLS-2026-10-25-v2.0.0](./2026-10-25-xita-direct-bls-reassessment-v2.0.0/) | `xgr-interchain/main` `eb2d8e7f885a81d33cfb494b0b55b3fa722780e2`; `xgr-node/XGR3.0` `d90da4d75b899576c4c4eaab864cbc10ab19a370` | 0 Critical, 4 High, 11 Medium, 8 Low, 3 Informational | Original 35-page report and 137-entry evidence package identified; actual bytes still to be attached | Source fixes ongoing at that baseline |
| [XITA-DBLS-2026-10-24-v1.0.0](./2026-10-24-xita-direct-bls-v1.0.0/) | `xgr-interchain/main` `ccef5cd429bf8ad8cb63bd5778c1fae7aaf185cc`; `xgr-node/XGR3.0` `6f5e36b8147eae6275c2fefaadec7aa8488dc674` | 0 Critical, 1 High, 6 Medium, 7 Low, 3 Informational | Redacted public summary; original report and reproductions access-controlled | Open; no release sign-off at that baseline |

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
