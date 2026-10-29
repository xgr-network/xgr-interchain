# XITA Direct-BLS Comprehensive Security Delta Re-Audit v3.2.0

**Audit ID:** `XITA-DBLS-2026-10-29-v3.2.0`  
**Date:** 29 October 2026  
**Auditor:** OpenAI GPT-6 Astra - AI-assisted independent security assessment

## Current assessment

**CONDITIONAL GO for restricted self-funded core transfers. NO-GO for regular unattended optional sponsorship. CONDITIONAL GO for supervised core recovery and read-only sponsor journal/evidence inspection.** Conditions and technical boundaries are in the [full report](report.md) and [separate launch decision](launch-decision.md). The unsafe automatic sponsor replay remains excluded; missing host attestation is not a standalone NO-GO reason.

The complete delta includes **62 commits (3 merges), 48 paths**, including all 27 product/test/migration paths. Node has zero delta. Frozen sources: Interchain `5cfc095d0f02271427832ee6bbb268322f38ae2d` from `26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3`; node `51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671`. All previous audit directories remain unchanged.

There are **35 current register entries: 0 Critical, 0 High, 14 Medium, 12 Low, 2 Informational, and 7 resolved causes**. Three new findings are F-33/F-34/F-35; F-06 is reopened. F-07/F-16/F-30 are newly closed; F-01/F-02/F-26/F-27 retain verified closure. Legacy M-03 also advances to verified source closure. All 43 historical occurrences are reconciled without double counting.

## Documents and evidence

- [Full English report (Markdown)](report.md) and [complete generated PDF](report.pdf).
- [Scope and frozen identities](scope-and-baselines.json), [complete change inventory](change-inventory.csv) and [finding statistics](finding-statistics.json).
- [Current finding register](findings.csv), [detailed finding records](finding-details.json), [43-occurrence historical matrix](historical-findings-matrix.csv) and [readable historical matrix](prior-findings-matrix.md). `historical-findings.csv` is the same compatibility alias. Use v3_2_* columns for current historical decisions; original columns remain preserved.
- [Phase A publication-safe record](phase-a-findings.md), [original pre-history freeze](phase-a-freeze.json) and [original/derivative identity](phase-a-publication.json).
- [Verification](verification.md), [test matrix](test-matrix.md), [remediation](remediation.md) and [launch decisions](launch-decision.md).
- [Public evidence ZIP](evidence-public.zip), [evidence index](evidence/README.md), [artifact manifest](archive-manifest.json), [PDF validation](pdf-validation.json) and [read-only verifier](verify_artifacts.py).
- [Protected evidence identity](confidential-evidence-reference.json); raw custom negative fixtures and the exact sealed master are access controlled, not included in the public ZIP.

## Evidence interpretation

The original Phase A master was sealed before historical reconciliation with SHA-256 `8a6651e9ed0167e7605dab9d129a0fa8019833a37bb5bd348373dadc5bf49a52`. The published file is an identified disclosure derivative; its different hash is intentional. Fresh executions, inherited logs, source proofs and read-only deployment observations remain separate. The unchanged rpc-read suite has one disclosed contradictory assertion under F-14. Passing negative reproductions establish defects, not fixes. No new productive transfer, payout, signature, deployment or database/service mutation was performed.

The PDF and ZIP are actual artifacts with hashes in the manifest. Publication completion is independently attested after CI, merge and main-branch readback. The publication commit is not the frozen product source.
