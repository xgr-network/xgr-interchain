# XITA Direct-BLS — Final Independent Security Audit & Public Launch Gate

**Status:** PREPARED, NOT STARTED. Run only after final operator transfer tests and an explicit source freeze.

## Mandate
Act as an independent lead security auditor. Perform **one full clean-slate security and launch-readiness audit**, not a delta review, rubber stamp or remediation confirmation. Use GPT-6 Astra / Pro with the highest available reasoning effort. Be adversarial and reproducible. Run Phase A **before** reading past conclusions. Do not modify production systems or submit transactions. Source repositories must be inspected directly through the connected GitHub integration.

## Scope and freeze
- `xgr-network/xgr-interchain`, `main`: contracts, source gateway, router, factory, validator/ISM/mailbox and fee vault interfaces, fee execution gateway, sponsorship signer and worker, tax evidence, transfer UI and all supported EVM wallets, indexer, independent reads, admin deploy/recovery, operations, receipts, CI and reproducible builds.
- `xgr-network/xgr-node`, **`XGR3.0` only**: Direct BLS / interchain validation and signer runtime, source receipt and block canonicality, proposer/validator quorum, RPC operator independence, scanner, backpressure, restart recovery, non-interchain validator behavior, IBFT consensus isolation, release binaries.
- Explicitly exclude the separate `PoS_3` source branch and legacy bridge architectures. XGRChain (1643) network evidence and relevant operational interfaces remain in scope.
- Primary initial spokes are Base (8453) and Arbitrum (42161); additional chains only if demonstrably live.
- The protocol requires source -> XGRChain -> destination for spoke-to-spoke transfers. No centralized custody of user principal; wallet signing and permissionless route registration must be preserved.
- Obtain **current** commit hashes, branch heads, node release and installed binary digest (if verifiable), verified on-chain deployments and addresses, runtime configuration and bytecode. Freeze exact SHA values **at audit start**, after operator tests; never reuse historical source SHAs as current. Record uncertainty explicitly.

## Phase A — clean-slate first
Do not read past reports, their fixes or their classifications until Phase A findings are independently written and frozen in `phase-a-findings.md`. Independently enumerate attack surfaces, trust boundaries, edge cases and economic/operational abuse.

1. Direct-BLS domain separation, signing, 2/3 quorum, key/membership changes, current set IDs, EIP-2537 verifier, route IDs, chain binding, replay, data canonicalization, competing validator signatures.
2. External-chain source authenticity: independent RPC **operators and actual upstream infrastructure**, 2-of-N witness consistency, malicious/stale/poisoned/forked RPC evidence, `safe` and `finalized` differences, lack of L1 settlement guarantees, fail-closed, XGRChain committed IBFT source state, rate limits, RPC fallback and catch-up.
3. Source/destination assets: lock/mint/burn/unlock collateral invariants; native principal isolation; hub-only two-hop correlation, correct parent/child messages, multi-Dispatch transactions, source/destination finality, interruption/reload, recoverability, nonce safety and non-duplicated user wallet transactions.
4. Runtime: observer shared cursors, durable retry journal and poisoned-message isolation, persistence, restarts, validator rotation, cancellation, RPC timeouts, resource limits and isolation from ordinary PoS and IBFT.
5. Sponsoring & commercial execution: EIP-712 quote bindings and 90-second on-chain validity; atomic per-chain funding and rolling budget; N-06 expiry after five-minute grace with finalized source `nonceUsed`; N-07 aggregation and liquidity double-spend/races; N-08 canonical safe-head grant receipts; submitted/needs-review recovery and never replay grants; two-hop upfront grant commitments, operational wallet permissions, quote DB roles, taxes and service-price integrity.
6. XITA transfer UI: actual 2-stage/4-stage wallet authorization, not MetaMask-only assumptions, accurate safe-vs-final status, paused/unavailable states, user recovery after close/reload, no duplicated source TX, actual wallet index evidence, on-chain gas sponsorship ON/OFF and low-balance wallets, RPC throttling, safe mint / unlock state.
7. Operational launch: live contract bytecode and owners vs receipt manifests, environment/DB migration order, least-privilege services and firewall exposure, signer isolation, reproducible build/checksum, validator binaries running in the network, health false-greens and misreporting, routine clean restart.

Produce actual exploit prerequisites and realistic impact; differentiate confidentiality, integrity, availability and optional service risks. Tests and PR descriptions do not independently prove production safety.

## Phase B — prior audits (only after Phase A freeze)
Independently verify **both** formal historical Direct-BLS baselines:
- `audits/2026-10-24-xita-direct-bls-v1.0.0/` (17 findings: H-01, M-01..M-06, L-01..L-07, I-01..I-03; 0 Critical / 1 High / 6 Medium / 7 Low / 3 Informational).
- `audits/2026-10-25-xita-direct-bls-reassessment-v2.0.0/` (26 findings: 0 Critical / 4 High / 11 Medium / 8 Low / 3 Informational). The **original** complete 35-page PDF and 137-entry ZIP were previously named but never deposited. Do not invent technical descriptions for restricted findings if their primary report is not available.

For every finding, record original risk, actual attack path, relevant exact code/commits, tests reproduced, bypass/regression attempts, source fix vs released vs deployed distinction, and one of OPEN / FIXED_IN_CODE / VERIFIED / RELEASED / ACCEPTED_RISK / NOT_APPLICABLE. Reconcile each historical finding without silently changing the old report. Review changes merged since Oct 25, notably node retry/multi-Dispatch and XITA multi-hop sponsor fixes PR #309–#311, #330–#331, plus subsequent UI and RPC fixes; do not assume a merge is proof of safety.

H-01 must be independently scored, **not automatically downgraded**. Verify external RPC ownership, noncorrelation of upstream operators, hostile source-RPC fault simulations, disagreement fail-close and validator quorum evidence; if applicable document residual trust assumptions and why Medium or High is supported. No arbitrary downgrade to achieve GO.

## Phase C — launch readiness and independent decision
Use read-only on-chain queries and non-destructive local testing. Do **not** execute actual asset transfers, change wallet/validator keys, mutate chain state, publish an audit, or deploy/merge security fixes except as specifically authorized for **audit artifact archival** below. Incorporate independently verified operator transfer test evidence when available; do not fabricate live outcomes.

Explicitly check source->XGR, XGR->spokes and spoke->spoke journeys (4 wallet transactions), sponsoring on/off, zero native balance, restart while pending, missing/stale provider and bad proof, L2 safe confirmation, final minted/unlocked balance, resumed user wallet steps. Label each as TESTED, FAILED, INCONCLUSIVE or NOT RUN. Evaluate P0 launch blocker / P1 required before scaling / P2 improvement. Produce GO, CONDITIONAL GO, or NO-GO with measurable gating criteria. Evaluate if external full nodes or Base Light Client are truly mandatory; avoid scope expansion without causal evidence.

## Mandatory deliverables — cannot mark audit COMPLETED without archival
All prose/reporting **in English**:
- `report.md` complete public redacted report, with all findings and an executive summary.
- `report.pdf` **actual rendered and visually verified PDF bytes**, not an empty placeholder, link, claimed filename or text pretending to be PDF.
- `phase-a-findings.md` independent Phase A results frozen before accessing old reports.
- `findings.csv` complete audit finding register and reproducibility locations.
- `prior-findings-matrix.md` 17 + 26 old finding dispositions, honest unavailable-evidence markers.
- `verification.md` executed / passed / failed / not-run tests and provenance.
- `remediation.md` severity, P0–P2 gate list, decisions and residual architecture assumptions.
- `evidence/README.md` safe public evidence inventory with exact file/commit/receipt references.
- `archive-manifest.json` SHA-256 digest and size of every publication artifact, plus audited source SHAs, node release/running version evidence and an explicit `status: complete`.
- An actual **public-safe evidence ZIP**, `evidence-public.zip`, containing reproducible sanitized inputs and test output (not merely a list of names); mark missing evidence precisely. For sensitive working evidence, store a separate **restricted, persistent repository or private GitHub release/storage controlled by the operator**, with digest, access control and exact reference in the public manifest. Do not commit the unrestricted confidential ZIP, exploit proofs, secrets or customer data to this public repository.

Versioned destination: `audits/YYYY-MM-DD-xita-direct-bls-final-v3.0.0/` (actual execution date), and update `audits/README.md` to link to it.

**Archive-first protocol:** Generate source report, render/check PDF, create sanitized evidence, generate SHA-256 manifest; commit actual safe files and binary bytes in a GitHub PR, merge to `main` after checks, re-fetch committed files from `main`, verify digests and PDF header/page count/size/ZIP contents, check `audits/README.md` linkage. Keep confidential originals separately with verified durable URL and hashes. If this workflow cannot upload binary files via the connector, use authenticated local Git and user-supplied archive files; **do not pretend archive succeeded**. Do not emit a final audit-complete message unless verifiably archived; explicitly return NOT_ARCHIVED and stop the closeout if any artifact is missing.

The operator explicitly authorizes committing the final public-safe audit deliverables to the **public** `xgr-interchain` repo after redaction, solely as documentation. No application, contract, node or operational config changes are authorized by this audit request. Do not publish confidential reproduction materials. Keep a reviewable audit PR before merging documentation to main.

## Final question
Is the currently deployed XITA Direct-BLS Interchain system safe and reliable for a controlled public launch? Identify **exactly** what blocks launch, what residual assumptions are accepted and which runtime/deployment evidence is still missing. Never substitute missing evidence with confidence or a polished PDF.
