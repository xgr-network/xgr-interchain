# Re-Audit v2.0.0 — Validation and release provenance

| Change | Source/CI status | Additional production evidence needed |
| --- | --- | --- |
| N-02 / Node PR #71 | Go tests and release-candidate build passed; merged `XGR3.0` | Installed Node binary identity and operational multi-message recovery |
| New L-02 / PR #308 | All GitHub CI workflows passed, merged `main` | Live chain-specific sponsored-native-gas grant |
| N-05 / PRs #309 and #311 | GitHub Validate, Direct-BLS Security and Native Contract checks passed; merged `main` | End-to-end TX1 fee → all committed gas grants confirmed → TX2 → TX3 → TX4 with empty initial destination gas and interruption/recovery |
| N-11 / PR #310 | GitHub checks passed; merged `main` | Real SQL high-volume active/retired route pagination |
| H-01 | Multi-RPC architecture implemented | Independent witness operator/upstream audit and correlated-provider fail-closed tests |
| N-01 | Open | Adversarial per-operation isolation and crash/restart replay tests |

No contract redeployment, no live paid transaction and no installed production binary verification are implied by this record. The private evidence archive is not published here.
