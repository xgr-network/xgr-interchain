# XITA read-only metrics adapter

Start: `node services/indexer/server.mjs` from the repository root, listening at `127.0.0.1:4088` by default. This service is NOT automatically started by `./manage.sh update`; enable it independently when ready.

- `GET /health`: adapter health, not proof that indexer data is populated.
- `GET /api/xeta/v1/metrics/toplist`: catalog-derived asset inventory, verified metrics when backed by the trusted evidence file, null otherwise.
- No HTTP ingestion, signing, wallet transactions, browser-provided metrics, or RPC write access.

**Evidence pipeline is not deployed.** Set `XITA_METRICS_EVIDENCE=/absolute/path/to/validated-evidence.json` ONLY after a separate finalized-chain verifier has produced that file. The adapter's schema checks are not themselves evidence of finality or validator attestation; never set this environment variable to arbitrary user-supplied JSON. Without a verified producer, all locked, moved and market-cap metrics must remain unavailable. Do not re-use old Hyperlane / v3.1.4 escrow amounts or count synthetic supply as new v3.1.5 collateral.

Future verifier requirements: validate the immutable receipt/codehash of each independent route escrow and native/ERC20 balance at confirmed blocks, reconstruct actual lock/unlock principal (excluding unsolicited transfers and validator fee vaults), correlate the two distinct hop message IDs into a single user journey, price amounts at documented timestamps, and prove market circulating supply independently. Reorganizations, gaps, duplicated IDs or incomplete per-asset coverage must yield null (not zero). No actual trustless numeric totals exist in the repository yet.

Nginx example routes ONLY the metrics endpoint to loopback 4088. All other `/api/xeta/` endpoints remain fail-closed. No XGR Explorer or mainnet state is modified.

## CoinGecko prices

An asset's public profile may specify `market.priceSource = "coingecko"` and a CoinGecko coin ID. The read-only adapter requests CoinGecko USD price, market capitalization and circulating supply server-side. Refresh interval is 120 seconds after success and 60 seconds after a provider error; invalid, missing or non-positive prices do not create values. An optional `XITA_COINGECKO_API_KEY` is held only by the server. Market cap is explicitly third-party market data, not independently verified on-chain collateral.

**Finalized-chain indexer is not yet live:** There are no verified v3.1.5 asset router deployment receipts in the public catalog. Consequently actual locked TVL, unique movements and route activation cannot be computed or asserted. The adapter intentionally returns null for these until a separately verified event/balance ingestion pipeline is available. Do not use old v3.1.4 bridge data, wrapped supply or incidental token deposits to fabricate TVL.
