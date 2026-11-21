# XITA V1 — Post-deployment operator assertion and read-only evidence (2026-11-15)

**Classification:** preliminary operational evidence, NOT an independently completed security audit, code-vulnerability disposition, or production binary attestation. This note supplements `AUDIT_REQUEST.md` without modifying the frozen source targets.

## Operator-reported deployment

On 2026-11-15, the XGR operator explicitly reported that both `xgr-interchain` and `xgr-node` had been deployed. Treat this as **operator assertion**. No server shell, systemd/container inventory, validator journal or source build provenance was independently inspected in this review.

## Public evidence independently checked

1. GitHub published official `xgr-network/xgr-node` release [v3.5.1](https://github.com/xgr-network/xgr-node/releases/tag/v3.5.1) on 2026-11-15 at 08:28:19 UTC. Its release target is `723ff829d7380a29a116fd2f29c3b808ec073c0d`. Assets listed: `xgrchain-v3.5.1-linux-amd64`, `commit.txt`, `version.txt`, `toolchain.txt` and `sha256sums.txt`. Asset **presence** was checked; host binary hash matching and full asset content verification were not performed.
2. The node's `XGR3.0` branch head was independently read as `723ff829d7380a29a116fd2f29c3b808ec073c0d`. The F-20 source fix itself was merged earlier at `d5e8977a0fa1059b2ccf25ecefc360c7454e39df`. Later changes are limited to documented release/workflow cleanup and must be separately compared if the audit claims no executable changes.
3. `xgr-interchain` `main` head was `fe3d63603a09197217c57e61961f6434e39ba07f`, following the code merge `dedc13181d63bd241429a871aaa05a4fbbffd6a0` and documentation-only handoff PR #416. The original merged code tree equality to combined 4/4-green integration PR #415 was previously verified.
4. The connected XGR Mainnet read-only RPC returned **chain ID 1643** and observed block heights **12,999,848** and **12,999,864**, confirming a progressing reachable chain at observation time. This is not proof of which node executable, validator binary or ancillary services were deployed.

A web-only attempt to access `https://xita.xgr.network` and two public health/metrics URLs through an external reader did not produce a usable response. This is an **observer access limitation**, NOT independently verified service downtime. Do not infer an outage or a passing service health result from it.

## Required host-level and configuration evidence (not observed)

- For each upgraded XGR validator: actual running process/container binary version and full binary SHA256, comparison to published v3.5.1 `sha256sums.txt`; unchanged canonical genesis, existing staking BLS PoP fork activation, peer and quorum continuity, Direct-BLS worker and local journal persistence.
- For XITA hosts: exact checked-out Git commit/image digest, service startup timestamps and `/health` readback, sponsor queue/reconciliation state, read-only status/metrics, no unresolved prepared nonce collision, Creator intake processing and signed transaction recovery; where relevant, historical quote liabilities.
- PostgreSQL migration `017_sponsor_obligation_reviews.sql`: verified applied schema and least-privileged role grants and actual operator escalation owner. This is an **optional service control**, not a condition for interpreting immutable contract bytecodes.
- EVM destination/source contracts: independent runtime bytecode, immutable router/asset/ISM configuration and trust assumptions; do not use rate of UI or notification bugfixes as a proxy for bridge protocol exploitability.

## Delta-audit interpretation

Carry forward original `2026-11-06-xita-direct-bls-delta-v3.3.0` findings and scope. Independently reassess F-36, F-08, F-19, F-20, all surviving Medium issues and relevant low-level regressions. Separate: **immutable core contract/custody/replay**, **validator/Direct-BLS/runtime**, **optional sponsorship/Creator/relayer/monitoring**, and **UI/admin/e-mail**. Produce separate scoped operating decisions and demonstrate tested sources rather than marking findings closed because this deployment was reported.

This file records observations and provenance, **not** an authorization to sign, redeploy contracts, pay grants, send funds, restart production services or waive obligations. Solana integration remains out of scope.
