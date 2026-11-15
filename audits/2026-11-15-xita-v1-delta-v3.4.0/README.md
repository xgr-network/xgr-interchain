# XITA V1 delta audit - 15 November 2026

**Report revision 3.4.0; node release v3.5.1.**

F-20 is verified resolved for its original consume-before-durable-successor cause. F-36, F-08 and F-19 have useful repairs but remain partially mitigated: post-deployment Creator publication can still monopolize the worker; serialized sponsorship effects still couple healthy chains to a stalled broadcast; and logging/escalation is not a controlled financial outcome. A newly demonstrated Low issue, F-40, affects privileged reviewer metadata attribution, not bridge custody. No new Critical or High defect was demonstrated within the reviewed delta. The current 40-cause register contains 10 Medium, 16 Low, 3 Informational and 11 resolved causes. One existing Medium remains an explicitly bounded accepted risk, not a new acceptance.

Read [main report](report.md) / [PDF](report.pdf), [separate operating decisions](launch-decision.md), [node companion](node-v3.5.1-review.md) / [PDF](node-v3.5.1-review.pdf), [all findings](finding-details.json), [historical matrix](historical-findings-matrix.csv), [verification](verification.md), [test matrix](test-matrix.md) and [remediation](remediation.md).

No product code, production transaction or deployment is included. This publication must not be described as an independent external audit-firm certificate.

Rebuild: `python build_reports.py --interchain <frozen-interchain> --node <frozen-node> --evidence <declared-extracted-artifacts> --out <this-audit-directory>` with Python 3.10+ and ReportLab 4.4.9. Inputs and workflow scripts are retained by exact hash. Run `python verify_artifacts.py` to check publication integrity. The hash manifest excludes itself; no self-hash claim is made. Protected adversarial fixtures are in the separate operator archive, not in evidence-public.zip.
