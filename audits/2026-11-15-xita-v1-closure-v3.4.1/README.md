# PR419 closure addendum v3.4.1

Read [report.pdf](report.pdf) or [report.md](report.md). This is a targeted addendum to the unchanged v3.4.0 report, not a software release. F-36 and F-40 source/schema causes close; F-08 and F-19 remain partially mitigated. Node v3.5.1 is unchanged.

Evidence is retained in `evidence/`, decisions in `launch-decision.md`, targeted status changes in `finding-details.json`, inherited inventory arithmetic in `finding-statistics.json`, and the public hash manifest in `archive-manifest.json`. Detailed unresolved synthetic fixtures are separately supplied to the operator; their checksum is recorded in `protected-evidence-reference.json`.

Rebuild the authored report with ReportLab 4.4.9 and Python 3.13: `python build_reports.py --evidence <verified-artifact-directory>`. Findings are assessor-authored; the script validates evidence and formats it, not automatically deciding closure from CI.
