# XITA Direct-BLS v1.0.0 — original evidence identity and custody

This directory intentionally contains **no unrestricted exploit reproductions or private logs**. The canonical evidence bundle is kept access-controlled outside the public GitHub repository and linked to the frozen audit by its immutable cryptographic hash.

## Canonical original artifacts

| Artifact | SHA-256 | Notes |
| --- | --- | --- |
| `XITA_Direct_BLS_Security_Audit_2026-10-24.pdf` | `6a1423bd937eb261adf2b0da15085f7cb09dcb8ba82d16e2ea3e48e64d8ebab4` | Full, original, 29-page security report; access-controlled |
| `XITA_Audit_Evidence_2026-10-24.zip` | `66dbc0551b4602686903b650eeda36ab090a2eac22d29de39f8d1b0290d4ded2` | 67 original files with observed outputs, tests, source hashes and logs; access-controlled |

Recorded source snapshots:
- `xgr-interchain/main`: `ccef5cd429bf8ad8cb63bd5778c1fae7aaf185cc`.
- `xgr-node/XGR3.0`: `6f5e36b8147eae6275c2fefaadec7aa8488dc674`.
- `xgrchain/PoS_3`: **excluded** from audit source code scope.

## Access and later disclosure

Treat the original archive as restricted pending security triage and fixes. The artifacts were delivered via the report custodian's private Library; these public hash commitments do **not** provide access. Supply the original only through an approved access-controlled channel, verifying SHA-256 at receipt.

After coordinated disclosure, a maintainer may add the original report and redacted evidence or publicly distributable reproductions in a **separate reviewed PR**, with exact hashes checked, while retaining this immutable version metadata and the complete remediation trail.

Never claim the publicly viewable `report.md` contains the full private report, or that a historical CI result proves a deployed fix.
