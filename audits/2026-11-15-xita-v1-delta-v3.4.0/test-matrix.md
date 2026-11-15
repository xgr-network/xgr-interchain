# Test matrix

| Evidence | Fresh outcome | Interpretation |
| --- | --- | --- |
| JavaScript complete discovery | 166 / 174 files pass | Eight historical failing files; 1,035 / 1,046 TAP tests pass. |
| Node packages | 495 pass; one seed skipped | Six packages; targeted scope, not whole-node EEST. |
| F-20 repeated / faults | 5 + 10 passes | Missing/corrupt successor, write failure and restart exercised. |
| Foundry | 111 / 111, 17 suites | Fresh unchanged-contract build and targeted security tests. |
| Receipt/runtime observations | 119 / 202 verified | 83 unavailable; zero mismatches; 78 unique contracts verified at least once. |
| PostgreSQL reviewer | Normal/negative role tests | Direct INSERT attribution defect reproduced as F-40. |
| Protected Creator/sponsor | Positive and negative controls | Real source paths; external effects mocked; residuals retained. |

See verification.md and individual public evidence logs; no success count includes a failed or omitted file as passing.
