# Complete historical finding reassessment

All 43 original occurrences are preserved. The CSV retains every one of the previous matrix’s 16 cells per row; only the prefixed `v3_2_*` columns express this audit’s conclusions. Original `current_severity`, `disposition`, test and production fields remain historical. Repeated occurrences are not added to the 35 unique current entries. Public: paths are relative to this audit directory. Protected: paths are members/fragments in the separately identified confidential ZIP; restore them under audit-work/ to use the original fixture commands. Original historical columns retain their original reference notation.

| Historical occurrence | Original | Current | Disposition | Current ID |
| --- | --- | --- | --- | --- |
| 2026-10-24/H-01 | High | Medium | OPEN | F-05 |
| 2026-10-24/M-01 | Medium | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-24/M-02 | Medium | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-24/M-03 | Medium | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-24/M-04 | Medium | Medium | OPEN | F-29 |
| 2026-10-24/M-05 | Medium | Medium | OPEN | F-03 |
| 2026-10-24/M-06 | Medium | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-24/L-01 | Low | Low | OPEN | F-13 |
| 2026-10-24/L-02 | Low | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-24/L-03 | Low | Low | OPEN | F-10 |
| 2026-10-24/L-04 | Low | Low | OPEN | F-22 |
| 2026-10-24/L-05 | Low | Low | OPEN | F-23 |
| 2026-10-24/L-06 | Low | Low | OPEN | F-24 |
| 2026-10-24/L-07 | Low | Low | OPEN | F-25 |
| 2026-10-24/I-01 | Informational | Low | OPEN | F-14 |
| 2026-10-24/I-02 | Informational | RESOLVED | VERIFIED / RESOLVED | F-27 |
| 2026-10-24/I-03 | Informational | Informational | OPEN | F-28 |
| 2026-10-25/H-01 | High | Medium | OPEN | F-05 |
| 2026-10-25/M-04 | Medium | Medium | OPEN | F-29 |
| 2026-10-25/M-05 | Medium | Medium | OPEN | F-03 |
| 2026-10-25/M-06 | Medium | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-25/L-01 | Low | Low | OPEN | F-13 |
| 2026-10-25/L-02 | Low | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-25/L-03 | Low | Low | OPEN | F-10 |
| 2026-10-25/L-04 | Low | Low | OPEN | F-22 |
| 2026-10-25/L-05 | Low | Low | OPEN | F-23 |
| 2026-10-25/L-06 | Low | Low | OPEN | F-24 |
| 2026-10-25/L-07 | Low | Low | OPEN | F-25 |
| 2026-10-25/I-01 | Informational | Low | OPEN | F-14 |
| 2026-10-25/I-02 | Informational | RESOLVED | VERIFIED / RESOLVED | F-27 |
| 2026-10-25/I-03 | Informational | Informational | OPEN | F-28 |
| 2026-10-25/N-01 | High | Medium | OPEN | F-04 |
| 2026-10-25/N-02 | High | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-25/N-03 | Medium | Medium | OPEN | F-20 |
| 2026-10-25/N-04 | Medium | Medium | OPEN | F-21 |
| 2026-10-25/N-05 | High | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-25/N-06 | Medium | Medium | PARTIALLY_MITIGATED | F-17 |
| 2026-10-25/N-07 | Medium | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-25/N-08 | Medium | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-25/N-09 | Medium | Medium | OPEN | F-09 |
| 2026-10-25/N-10 | Low | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |
| 2026-10-25/N-11 | Medium | RESOLVED | VERIFIED / RESOLVED | F-26 |
| 2026-10-25/N-12 | Medium | RESOLVED | VERIFIED / RESOLVED | Legacy-only cause |

# Historical occurrence matrix — integration notes

The CSV and JSON preserve all **43 historical occurrences** from the corrected v3.1.0 matrix, in their original order. All **16 original columns and every original cell value** are unchanged, including historical severity, original conditions, provenance, previous test descriptions and previous judgments.

**Read the `v3_2_*` columns for this audit's current decisions.** The original `current_severity`, `disposition`, `current_assessment`, `tests` and `production` columns describe the preceding audit and remain historical evidence. They are deliberately not overwritten. The explicit `v3_2_legacy_occurrence` field contains the date-qualified legacy ID; `v3_2_current_finding_id` contains the current F-ID when one exists. A blank current F-ID identifies a legacy-only occurrence and does not manufacture a new current finding.

All current F-01 through F-32 track records were loaded and their IDs verified. Thirty historical occurrences map to 18 of those current IDs; 13 have standalone legacy decisions. Fourteen rows are repeated occurrences from the later historical audit. No occurrence is omitted or duplicated, and both CSV and JSON were read back and compared. The current new F-35 finding has no invented historical occurrence.

The 43 occurrence decisions are **26 OPEN, one PARTIALLY_MITIGATED and 16 VERIFIED / RESOLVED**. Their current severities are 11 Medium, 14 Low, two Informational and 16 resolved. These are occurrence counts, **not unique current-finding totals**. The management labels are 11 OFFEN, nine SCHLIESSBAR and 23 not applicable; historical or current Medium items all have the required management label.

Evidence classification preserves the owners' distinction between fresh execution, retained execution and source proof. In particular, the M-03 closure relies on current complete synchronization-guard/callgraph source proof; it does not claim a newly executed Go regression. Source closure does not imply that every installed host was attested. Relative evidence references use the directory in `v3_2_evidence_base`; `v3_2_decision_record` identifies the exact owner record. The validation JSON contains input/output hashes, complete coverage checks and interpretation rules. Executable negative fixtures remain protected evidence.

## Complete occurrence summary

| Historical occurrence | Original severity | Current F-ID | v3.2 severity | v3.2 disposition | Management |
|---|---|---|---|---|---|
| 2026-10-24/H-01 | High | F-05 | Medium | OPEN | OFFEN |
| 2026-10-24/M-01 | Medium | Legacy only | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
| 2026-10-24/M-02 | Medium | Legacy only | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
| 2026-10-24/M-03 | Medium | Legacy only | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
| 2026-10-24/M-04 | Medium | F-29 | Medium | OPEN | OFFEN |
| 2026-10-24/M-05 | Medium | F-03 | Medium | OPEN | OFFEN |
| 2026-10-24/M-06 | Medium | Legacy only | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
| 2026-10-24/L-01 | Low | F-13 | Low | OPEN | — |
| 2026-10-24/L-02 | Low | Legacy only | RESOLVED | VERIFIED / RESOLVED | — |
| 2026-10-24/L-03 | Low | F-10 | Low | OPEN | — |
| 2026-10-24/L-04 | Low | F-22 | Low | OPEN | — |
| 2026-10-24/L-05 | Low | F-23 | Low | OPEN | — |
| 2026-10-24/L-06 | Low | F-24 | Low | OPEN | — |
| 2026-10-24/L-07 | Low | F-25 | Low | OPEN | — |
| 2026-10-24/I-01 | Informational | F-14 | Low | OPEN | — |
| 2026-10-24/I-02 | Informational | F-27 | RESOLVED | VERIFIED / RESOLVED | — |
| 2026-10-24/I-03 | Informational | F-28 | Informational | OPEN | — |
| 2026-10-25/H-01 | High | F-05 | Medium | OPEN | OFFEN |
| 2026-10-25/M-04 | Medium | F-29 | Medium | OPEN | OFFEN |
| 2026-10-25/M-05 | Medium | F-03 | Medium | OPEN | OFFEN |
| 2026-10-25/M-06 | Medium | Legacy only | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
| 2026-10-25/L-01 | Low | F-13 | Low | OPEN | — |
| 2026-10-25/L-02 | Low | Legacy only | RESOLVED | VERIFIED / RESOLVED | — |
| 2026-10-25/L-03 | Low | F-10 | Low | OPEN | — |
| 2026-10-25/L-04 | Low | F-22 | Low | OPEN | — |
| 2026-10-25/L-05 | Low | F-23 | Low | OPEN | — |
| 2026-10-25/L-06 | Low | F-24 | Low | OPEN | — |
| 2026-10-25/L-07 | Low | F-25 | Low | OPEN | — |
| 2026-10-25/I-01 | Informational | F-14 | Low | OPEN | — |
| 2026-10-25/I-02 | Informational | F-27 | RESOLVED | VERIFIED / RESOLVED | — |
| 2026-10-25/I-03 | Informational | F-28 | Informational | OPEN | — |
| 2026-10-25/N-01 | High | F-04 | Medium | OPEN | OFFEN |
| 2026-10-25/N-02 | High | Legacy only | RESOLVED | VERIFIED / RESOLVED | — |
| 2026-10-25/N-03 | Medium | F-20 | Medium | OPEN | OFFEN |
| 2026-10-25/N-04 | Medium | F-21 | Medium | OPEN | OFFEN |
| 2026-10-25/N-05 | High | Legacy only | RESOLVED | VERIFIED / RESOLVED | — |
| 2026-10-25/N-06 | Medium | F-17 | Medium | PARTIALLY_MITIGATED | OFFEN |
| 2026-10-25/N-07 | Medium | Legacy only | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
| 2026-10-25/N-08 | Medium | Legacy only | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
| 2026-10-25/N-09 | Medium | F-09 | Medium | OPEN | OFFEN |
| 2026-10-25/N-10 | Low | Legacy only | RESOLVED | VERIFIED / RESOLVED | — |
| 2026-10-25/N-11 | Medium | F-26 | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
| 2026-10-25/N-12 | Medium | Legacy only | RESOLVED | VERIFIED / RESOLVED | SCHLIESSBAR |
