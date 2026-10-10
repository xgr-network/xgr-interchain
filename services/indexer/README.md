# XITA read-only metrics adapter

Start: `node services/indexer/server.mjs` from the repository root, listening at `127.0.0.1:4088` by default. This service is NOT automatically started by `./manage.sh update`; enable it independently when ready.

- `GET /health`: adapter health, not proof that indexer data is populated.
- `GET /api/xeta/v1/metrics/toplist`: catalog-derived asset inventory, verified metrics when backed by the trusted evidence file, null otherwise.
- No HTTP ingestion, signing, wallet transactions, browser-provided metrics, or RPC write access.

**Evidence pipeline is not deployed.** Set `XITA_METRICS_EVIDENCE=/absolute/path/to/validated-evidence.json` ONLY after a separate finalized-chain verifier has produced that file. The adapter's schema checks are not themselves evidence of finality or validator attestation; never set this environment variable to arbitrary user-supplied JSON. Without a verified producer, all locked, moved and market-cap metrics must remain unavailable. Do not re-use old Hyperlane / v3.1.4 escrow amounts or count synthetic supply as new v3.1.5 collateral.

Future verifier requirements: validate the immutable receipt/codehash of each independent route escrow and native/ERC20 balance at confirmed blocks, reconstruct actual lock/unlock principal (excluding unsolicited transfers and validator fee vaults), correlate the two distinct hop message IDs into a single user journey, price amounts at documented timestamps, and prove market circulating supply independently. Reorganizations, gaps, duplicated IDs or incomplete per-asset coverage must yield null (not zero). No actual trustless numeric totals exist in the repository yet.

Nginx example routes ONLY the metrics endpoint to loopback 4088. All other `/api/xeta/` endpoints remain fail-closed. No XGR Explorer or mainnet state is modified.
