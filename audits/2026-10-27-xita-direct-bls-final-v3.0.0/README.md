# XITA Direct-BLS final independent audit — 27 October 2026

**Audit ID:** XITA-DBLS-2026-10-27-v3.0.0  
**Security decision:** **NO-GO**  
**Report:** complete English assessment, 59-page PDF, three consecutive audit phases.

The source opinion applies only to the frozen revisions below. The later documentation publication commit is not a new application security baseline.

| Repository | Branch | Audited commit |
| --- | --- | --- |
| xgr-network/xgr-interchain | main | `ffc24139738bcb25ab516e5d3242f258a75fcfb8` |
| xgr-network/xgr-node | XGR3.0 | `4d341a08baa604c7871e10af8c7c2e2406f4d032` |

## Reports and registers

- [Complete PDF report](./report.pdf) and [complete Markdown report](./report.md).
- [Current finding inventory](./findings.csv): 29 consolidated entries — 1 High, 17 Medium, 9 Low, 2 Informational; priorities 1 P0, 18 P1, 10 P2.
- [Historical reassessment](./prior-findings-matrix.md) and [historical CSV](./historical-findings.csv): all 17 October 24 and 26 October 25 identities retained. Current dispositions: 30 OPEN, 12 VERIFIED, 1 FIXED_IN_CODE. None is claimed as installed-production RELEASED.
- [Frozen independent Phase A](./phase-a-findings.md) and [freeze commitments](./phase-a-freeze.json), retained byte-for-byte; final corrections are explicitly recorded in the report.
- [Executed verification and limitations](./verification.md), [remaining remediation and launch gates](./remediation.md), and [PDF validation](./pdf-validation.json).
- [Detailed evidence inventory](./evidence/README.md), [actual 104-entry public ZIP](./evidence-public.zip) and [per-entry evidence manifest](./evidence/MANIFEST.json).
- [Exact artifact manifest](./archive-manifest.json) and [confidential evidence reference](./confidential-evidence-reference.json). The latter is an access-controlled owner reference, not a public download grant.

## Meaning of the decision

The decisive P0 is the unresolved native execution/accounting and proposal-validation boundary F-01. Completed local checks and source tracing support withholding launch approval; a full malicious consensus proposal and installed-validator exposure were not demonstrated. Historical H-01 is independently assessed Medium / P1 / OPEN with provider-independence and operating conditions, not automatically retained at High or declared accepted.

Passing tests, published binary metadata, matching deployed runtime evidence and public health responses remain distinct from installed-software attestation and live wallet acceptance. Known fixture failures, unavailable browser checks, historical primary-artifact gaps and interrupted exploit-oriented work are explicitly disclosed.

## Integrity and archival verification

`archive-manifest.json` commits the exact artifact bytes, including the PDF and ZIP, plus the updated parent audit index. Its own digest is recorded externally in the publication/readback attestation. After merge, the audit PR records the main commit used for an exact-byte readback of every published file. Documentation publication does not close the launch gates.

The public files exclude new executable vulnerability reproductions, detailed unrepaired accounting inputs, keys and customer records. Confidential current evidence is separately archived with the reference and SHA-256 stated in the report. No application, node, contract, deployment or production configuration is modified by this documentation package.

## PDF rendering

`render_report.py` is the document renderer, not a security reproducer. With Python, ReportLab, pypdf and Matplotlib (DejaVu fonts) installed, run `python3 render_report.py .` from a copy of this directory to render the Markdown. PDF timestamps can change on regeneration; the committed original PDF bytes and manifest are authoritative.
