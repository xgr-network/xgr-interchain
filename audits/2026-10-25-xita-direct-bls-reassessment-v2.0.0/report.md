# XITA Direct-BLS Re-Audit v2.0.0 — Public redacted summary

**Audit model:** OpenAI GPT-6 Astra (audit operator attribution). This Markdown summarizes the 35-page independent report and provides follow-up status; the complete report PDF is a distinct original artifact requiring exact-byte archival.

## Scope

Direct BLS quorum, chain- and route-bound source evidence, Base/Arbitrum `safe` and XGR committed-IBFT finality, validator RPC independence, shared observers, source/destination receipts, two-hop wallet operations, sponsorship, indexer recovery, admin and release provenance.

**Frozen baseline:** `xgr-interchain` `eb2d8e7f885a81d33cfb494b0b55b3fa722780e2`; `xgr-node/XGR3.0` `d90da4d75b899576c4c4eaab864cbc10ab19a370`. XGRChain is the required hub. No centralized user-principal custody, no validator route-admission gate and no new contract deployment assumed.

## Findings and launch decision at snapshot

0 Critical / **4 High** / 11 Medium / 8 Low / 3 Informational; **NO-GO** as of the audited baseline. High-impact areas include `H-01` (correlated external-RPC source witness risk), `N-01` (shared source-scanner queue liveness), `N-02` (valid multi-Dispatch receipts), and `N-05` (multi-hop sponsorship deadlock). A new `L-02` involved chain-specific native gas transfer limits despite nominal Low severity. The new `L-02` must not be confused with original 24 October `L-02` on delegated-wallet compatibility.

## H-01 residual-risk assessment

The existing architecture verifies independent source evidence through two external RPC endpoints for Base/Arbitrum, with adopted native `safe` heads and committed-IBFT finality for XGRChain. Distinct endpoint URLs alone do not establish independent ownership, upstream hosting or resistance to correlated provider compromise.

A *residual Medium* assessment is technically defensible if demonstrably independent providers, strict fail-closed disagreement handling, quorum independence, and hostile-provider regression evidence are recorded. Until demonstrated and expressly accepted, the historical High assessment stays as the immutable audit result. A Base Light Client or dedicated external full nodes are **not automatically required** for controlled launch merely because this residual trust assumption exists.

## Limitations

No fresh independent installed-node binary digest attestation or full live paid empty-gas two-hop execution is evidenced here. CI is proof of the tested source-path checks, not a claim of production rollout. Original restricted findings, proofs and exact reproduction details have not been copied into the public repository; further remediation claims must refer to exact PRs and target revisions.

## Disposition

The baseline remains **NO-GO historically**. See the post-baseline [remediation ledger](./remediation.md) for changes. A fresh, explicit GO/CONDITIONAL GO decision requires actual running versions and closure/acceptance of remaining material risks.
