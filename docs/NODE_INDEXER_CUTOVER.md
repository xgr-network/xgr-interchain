# XGR Node → XITA indexer migration: one operational foreign-chain reader

Status: **DRAFT / NOT DEPLOYED**. No write to contracts, consensus, signatures or wallet balances.

## Permanent responsibility boundary

| xgr-node opt-in read index | xgr-interchain | BLS validator |
| --- | --- | --- |
| Finalized Gateway receipts/route identities, destination Mailbox observations, external collateral snapshots, optional gas profiles | Node feed → bounded SQL projection, transfer/recovery UI, price valuation, collateral conservation, commercial reporting | Independent complete dual-operator source witnesses and current destination-set checks |

No foreign-chain queries by XITA background indexers. Native XGRChain reads may use the same XGR RPC. User wallets, transactions, relayers and validator signing retain their own necessary execution/network paths; they are **not** background index scanners.

## Before any cutover

1. Independently review the Node draft PR #101, exercise its full CI and build a separately reviewed node release. The opt-in source/index collector presently uses the existing key-bearing Worker, not a new keyless daemon. Enable on only the designated node; ordinary validator source scans remain 10 minutes.
2. Generate the compact watchlist from the deployed XITA catalog: `node tools/export-node-escrow-watches.mjs`. Install as `interchain/iln/escrow-watches.json` beneath the chosen node data directory. This is an observational allowlist only, never an authority for signing or custody. Do not edit contract IDs by hand.
3. Backfill the independent `_index_<chain>` cursors from each compiled SourceRegistry activation block. Confirm `xgr_getILNIndexedCoverage` is complete and fresh across all active routes; do not infer history coverage from validator signing cursors.
4. Verify exact source identity and route parity with `XITA_XGR_INDEX_RPC_URL=https://<trusted-xgr-rpc> node tools/verify-node-index-parity.mjs <source-chain>`. This is a **necessary, not sufficient** condition.
5. Verify delivery and escrow parity independently. A missing, stale, contradictory or provider-inaccessible snapshot is UNKNOWN, never zero or delivered=false. TVL remains unavailable if codehash/token/finality/route conservation fails.
6. Complete destination ProcessId + receipt/gas sampling in the Node read index before withdrawing the existing gas-observer. Preserve historical PostgreSQL gas profiles for statistical continuity.
7. Only then replace the XITA transfer scanner with a pure XGR-index-to-SQL projector. Run complete source/destination/TVL/gas parity; use an operator-controlled one-way cutover with rollback that does **not** relock/resend source TXs.

## Cleanup after verified parity — no legacy baggage

- Delete foreign `readSourceWindow`/`readRouteWindow` scanner and `canonicalRpc`/`candidateRpc` usages from XITA background services. Move retained pure route identity and receipt-validation helpers into focused modules; do **not** keep misleading no-op legacy APIs.
- Replace `xita-transfer-indexer.service` with a pure Node-feed/SQL projection service. Remove obsolete announcement reconciliation scans when the exact source receipt index is already present.
- Delete separate `gas-observer-runner.mjs` and its systemd unit, and remove external RPC reads from `gas-observer.mjs`. Preserve recorded gas data and fee-profile SQL consumers.
- Delete the direct foreign RPC transport in `tvl-worker.mjs`; retain a SQL-only publisher and the existing `reconcileEscrow`/`verifiedEvidence` checks against Node finalized snapshots.
- Remove installation and restart paths for retired units in `manage.sh`, update operational health dashboards and README. Historical SQL migrations remain in the repository because production DB schema/data must never be destructively erased.
- No `legacy`, `v4` or duplicate RPC polling branches after final switch. No automatic production deployment from draft PRs.

## Known gaps as of this draft

Node-side destination ProcessId transaction receipt and gas migration are incomplete. There is no live parity evidence, no production Node index release and no approved deletion of the old XITA services yet.