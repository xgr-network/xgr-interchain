# XGR Node → XITA production cutover

**Operational status: NOT CUT OVER.** PR [xgr-node #101](https://github.com/xgr-network/xgr-node/pull/101) and [xgr-interchain #447](https://github.com/xgr-network/xgr-interchain/pull/447) must pass all required CI and an operator-controlled, live-database parity gate before activation.

The chain-owning **read index is local, opt-in, rebuildable**, not consensus data. Ordinary validators continue independent full source receipt proofs via **two distinct RPC operators** for every BLS signature. No validator trusts index output as a signing witness.

## Final topology

- **XGR Node opt-in indexer:** one bounded shared finalized Gateway event feed per source; exact pinned source receipts; finalized destination Mailbox state; exact-message ProcessId gas; finalized ERC20 escrow snapshots. It is enabled only with `XGR_ILN_READ_INDEX=1` on an operator-designated node. Native XGR data comes from local IBFT state.
- **XGR JSON-RPC:** versioned, local read methods `xgr_getILNIndexedCoverage`, `xgr_getILNIndexedOperations`, `xgr_getILNIndexedSourceReceipt`, `xgr_getILNIndexedDelivery`, `xgr_getILNIndexedEscrow`, `xgr_getILNIndexedGas`, plus native XGR `eth_*` read methods.
- **XITA:** `node-index-projector.mjs` validates source receipts and populates the existing immutable SQL transfer and delivery tables, while updating replayable read cursors and gas profiles. `tvl-worker.mjs` reconciles the same SQL history and Node escrow observations, using CoinGecko ONLY for USD pricing. No independent foreign-chain event scanner, gas sidecar or TVL foreign RPC transport remains in this repository.
- **Retained independent security path:** `transfer-proof-observer.mjs`, unsigned recovery CLI and BLS quorum admission still perform their required checks and must not be replaced with a mere index status.

## Required operator release sequence

1. Review Node PR #101 with CI, the separate XGR3.0 release process and validator source-witness regression. Do **not** deploy a draft PR as a production release. For the index-enabled Node's data directory, keep the existing validator/worker prerequisites; the opt-in index currently reuses that Worker, not a new keyless daemon.
2. Generate the read-only ERC20 watchlist from the receipt-reviewed catalog:
   ```bash
   node tools/export-node-escrow-watches.mjs > /tmp/iln-escrow-watches.json
   ```
   Install that JSON under the configured node data directory at `interchain/iln/escrow-watches.json`; verify ownership and permissions. The current deployed watchlist includes external ERC20 collateral (ARB), not synthetic balances. XGR native collateral is read through that same node's committed XGR RPC.
3. Start the opt-in Node with `XGR_ILN_READ_INDEX=1` on the designated instance. Leave the **currently deployed XITA indexer and gas service running at this stage**, against the old code. The Node backfills `_index_<source>` independently of signing cursors from the compiled SourceRegistry activation heights. Wait until **every source** reports `complete` coverage, and exact route health is fresh; stale/missing source history is a blocker.
4. Run nonmutating parity per active source from the old, running SQL index:
   ```bash
   export XITA_XGR_INDEX_RPC_URL=https://<trusted-node-rpc>
   node tools/verify-node-index-parity.mjs bsc
   node tools/verify-node-index-parity.mjs base
   node tools/verify-node-index-parity.mjs arbitrum
   node tools/verify-node-index-parity.mjs optimism
   node tools/verify-node-index-parity.mjs xgrchain
   ```
   Only run routes actually present in the current catalog; each must return `complete=true` and **zero** missing/mismatched identities. The command is read-only.
5. Run the all-in-one **production cutover gate**, including finalized delivered/open states and current custody/price evidence:
   ```bash
   node tools/check-node-indexer-cutover.mjs
   ```
   It must report `ready=true` and exit 0; a missing native balance, stale escrow, unchecked open transfer, unknown route, changed canonical receipt or divergent source SQL blocks the cutover. The gate checks *the actual local XGR Node and existing production SQL*, not GitHub CI mocks.
6. **Stop the old XITA scanner and old gas sidecar before starting the new XITA worker**, otherwise duplicate RPC requests will persist:
   ```bash
   sudo systemctl stop xita-transfer-indexer.service xita-gas-observer.service
   sudo systemctl disable xita-gas-observer.service
   ```
   No tokens are moved by these commands. Preserve SQL/database backups and the previously deployed application release for a controlled service-only rollback.
7. Merge XITA PR #447 only after CI green and operator approval. Apply the additive `019_node_index_projection.sql` and `020_node_index_gas_jobs.sql` migrations via the operator PostgreSQL role (or `./manage.sh repair-transfer-db`). Do not destroy existing `xita_transfer_operations`, sponsorship/tax records or `xita_gas_profiles`. Set the **same trusted** `XITA_XGR_INDEX_RPC_URL` in `/etc/xita/transfer-indexer.env` and `/etc/xita/indexer.env`.
8. Install/refresh `services/indexer/xita-transfer-indexer.service.example` as the actual `xita-transfer-indexer.service`: its `ExecStart` MUST point to `node-index-projector.mjs`. Start the new worker, then restart `xita-tvl.service` using the existing evidence/history paths. Leave `xita-transfer-proof-observer.service` and all validator witness configuration unchanged.
9. Confirm new `xita_node_index_cursors` progress, refreshed XITA wallet/history endpoints, the open BSC→XGR operation, and TVL custody evidence. Gas samples are optional and failure must only affect statistics. Then remove the retired `/etc/systemd/system/xita-gas-observer.service` unit and reload systemd; do not leave a runnable orphan sidecar on disk.

## Safe failure and rollback

- Unknown/stale/contradictory index or custody evidence **fails closed**, never `delivered=false` by default and never zero TVL. Do not overwrite or backdate verified historical timestamps.
- Keep the current production SQL transfer history intact. The new projector has a separate `xita_node_index_cursors` feed sequence that replays idempotently after restarts and catalog changes.
- Rollback switches the **service binaries/units** to the last known-good deployed release only. No re-burn, re-mint, source-TX retry, contract redeployment, reinitialization of BLS keys, or destructive SQL reset.
- Old recurring foreign RPC scanners were **deleted in code**; the explicitly invoked roundtrip audit and unsigned BLS recovery retain isolated security-specific network reads. Never grant public HTTP users access to raw external RPC addresses or secrets.

## No-cutover conditions

Do not activate if the XGR Node PR's CI is red, full source historical backfill is incomplete, a foreign-source receipt is missing, the outstanding BSC message has an inconsistent destination state, a Node-supplied ERC20 balance is stale or violates escrow conservation, the old gas sidecar is still running, or the full live gate has not passed.
