# Historical traceability and r1 overlay

historical-findings.csv is the unchanged 43-occurrence v3.0.0 predecessor snapshot. Its current_assessment/current_severity fields refer to that assessment, not 43 newly executed r1 reviews. Original date-qualified IDs, titles and severities remain intact. Apply findings.csv and this overlay for the correction. baseline-findings.csv preserves the original 29 consolidated descriptions.

| Current finding | Historical correspondence | r1 treatment |
| --- | --- | --- |
| F-01 | New native High in v3.0.0 | VERIFIED source; published release; deployment corroborated subject to G1, not per-host attestation |
| F-02 | New native Medium in v3.0.0 | VERIFIED source/release; same deployment limit |
| F-05 | 2026-10-24 H-01; 2026-10-25 H-01 | Medium correlated-provider residual; no new downgrade caused by correction |
| F-06 | New quote-writer finding in v3.0.0 | VERIFIED by retained isolated restricted-role tests |
| F-26 | 2026-10-25 N-11 | VERIFIED background scheduling, not merely wallet ordering |
| F-27 | 2026-10-24 I-02; 2026-10-25 I-02 | VERIFIED release metadata, not installed disk identity |
| F-30 | Delta SVC-A01 | OPEN Medium monitoring interaction |
| F-31 | Delta SVC-A02 | OPEN Low failed-receipt presentation |
| F-32 | Delta PA-P02 | OPEN Medium unverified-request storage lifecycle, newly recorded but pre-existing code |
| Other IDs | Predecessor mappings retained | No unrelated closure or new risk acceptance by correction |

The complete predecessor is ../2026-10-27-xita-direct-bls-final-v3.0.0/. Unrestricted delta reproductions remain protected. This focused correction does not fabricate the unavailable full original v3.1.0 draft or its complete historical reassessment.
