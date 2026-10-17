# XITA read-only metrics adapter

Start: `node services/indexer/server.mjs` from the repository root, listening at `127.0.0.1:4088` by default. This service is NOT automatically started by `./manage.sh update`; enable it independently when ready.

- `GET /health`: adapter health, not proof that indexer data is populated.
- `GET /api/xeta/v1/visibility`: read-only derived per-asset listing eligibility.
- `/metrics/toplist` embeds the same visibility; per-system rankings consume it.
- `GET /api/xeta/v1/metrics/toplist`: catalog-derived asset inventory, verified metrics when backed by the trusted evidence file, null otherwise.
- No HTTP ingestion, signing, wallet transactions, browser-provided metrics, or RPC write access.

**Evidence pipeline is not deployed.** Set `XITA_METRICS_EVIDENCE=/absolute/path/to/validated-evidence.json` ONLY after a separate finalized-chain verifier has produced that file. The adapter's schema checks are not themselves evidence of finality or validator attestation; never set this environment variable to arbitrary user-supplied JSON. Without a verified producer, all locked, moved and market-cap metrics must remain unavailable. Do not re-use old Hyperlane / v3.1.4 escrow amounts or count synthetic supply as new v3.1.5 collateral.

Future verifier requirements: validate the immutable receipt/codehash of each independent route escrow and native/ERC20 balance at confirmed blocks, reconstruct actual lock/unlock principal (excluding unsolicited transfers and validator fee vaults), correlate the two distinct hop message IDs into a single user journey, price amounts at documented timestamps, and prove market circulating supply independently. Reorganizations, gaps, duplicated IDs or incomplete per-asset coverage must yield null (not zero). No actual trustless numeric totals exist in the repository yet.

Nginx examples expose specific, read-only metrics, systems, wallet-transfer index, and unsigned recovery endpoints to loopback 4088. All other `/api/xeta/` endpoints remain fail-closed. No XGR Explorer or mainnet state is modified.

## CoinGecko prices

An asset's public profile may specify `market.priceSource = "coingecko"` and a CoinGecko coin ID. The read-only adapter requests CoinGecko USD price, market capitalization and circulating supply server-side. Refresh interval is 120 seconds after success and 60 seconds after a provider error; invalid, missing or non-positive prices do not create values. An optional `XITA_COINGECKO_API_KEY` is held only by the server. Market cap is explicitly third-party market data, not independently verified on-chain collateral.

**Verified Gateway deployments are present in the catalog**, but a complete finalized-chain liquidity/price evidence producer is not yet live. Consequently actual locked TVL, unique movements and route activation cannot be computed or asserted. The adapter intentionally returns null for these until a separately verified event/balance ingestion pipeline is available. Do not use old v3.1.4 bridge data, wrapped supply or incidental token deposits to fabricate TVL.

## Chain ranking API and deployment

`GET /api/xeta/v1/systems/<chain>?sort=lockedUsd|marketCapUsd|movedUsd&q=<text>`
returns at most six qualifying public, chain-represented assets. Unknown metrics produce
an empty array and explicit unavailable status. `marketCapUsd` is provider-sourced
public market capitalization, not chain-specific locked value. `lockedUsd` and
`movedUsd` are asset-wide values and cannot be described as chain-level TVL.

Deploy the included `xita-indexer.service.example` as `/etc/systemd/system/xita-indexer.service`
and enable it with `systemctl daemon-reload && systemctl enable --now xita-indexer`.
Reverse proxy **only** `/api/xeta/v1/metrics/` and `/api/xeta/v1/systems/` to
127.0.0.1:4088. Use `curl -fsS http://127.0.0.1:4088/health` to confirm process
health, then inspect returned `status` to distinguish health from data coverage.
The service is intentionally not started implicitly by `manage.sh update`.

**Deployment caveat:** GitHub-documented asset Gateways exist. The finalized
event/escrow evidence collector is not implemented, so TVL/movement must stay
unavailable. Do not feed manually prepared JSON as an attestation. The adapter can
safely deliver CoinGecko prices where configured. Main's XGR market metadata
currently uses Explorer, not CoinGecko, so its market cap also remains unknown.

## PostgreSQL publication read model
The schema in `services/indexer/sql/001_verified_asset_liquidity.sql`
requires separate provisioning. Use a SELECT-only role configured through
`XITA_INDEXER_DATABASE_URL`; no credentials or write APIs in this service.
A separately audited finalized-chain observer must write only genuinely
verified collateral snapshots and independently reliable USD valuations.
This reader is NOT that verifier. If absent or untrusted, eligibility is
unknown, never zero. The minimum in `config/publication.json` remains null
until a later decision; **no public token listings are enabled yet**.
See [publication policy](../../docs/XITA_PUBLICATION_POLICY.md).


## Finalized wallet transfer index and resume notifications

The existing indexer provides an additional rebuildable PostgreSQL projection:

- `services/indexer/sql/002_transfer_operations.sql` stores immutable canonical
  source Gateway events joined to their confirmed Mailbox.Dispatch message ID,
  original source wallet, route, source tx hash, source finalized block/hash,
  optional decoded source amount/fee, and current destination Mailbox.delivery.
- `services/indexer/transfer-index-worker.mjs` backfills every fully deployed
  route from its own immutable Gateway deployment receipt block. A confirmed
  source lock/burn is never inferred from a token balance or wallet click.
  Source and destination chain IDs are verified at RPC level. Each incremental
  cursor is block-hash-checked; if the checkpoint reorganizes, its derived
  route records are deleted and reindexed. Destination delivery is checked
  at a finalized destination block, never only via pending transaction status.
- `GET /api/xeta/v1/transfers/wallet?account=0x...&pending=1` reads that
  wallet's open or unknown deliveries and their coverage, while
  `GET /api/xeta/v1/transfers/stats` exposes event counts and raw source
  amounts grouped by asset and confirmed delivery status. These are HOP events,
  **not** deduplicated multi-hop journeys, verified net locked collateral,
  exchange volume in USD, or custody TVL.
- The website displays `1 transfer awaiting delivery` near Wallet Connect
  when an indexed confirmed source message has target `delivered=false`. It
  links to the sole `/transfer` action button. The index is not an
  authorization to mint, burn, unlock, or spend. Immediately before destination
  MetaMask signing, the client independently re-fetches the source receipt,
  signed BLS/Merkle proof, the original message and target `delivered` state.
  An unavailable RPC is `unknown`, **never** delivered or definitively open.
  No browser WAL, localStorage or transfer journal is used.

**Deployment of the indexer is explicit and separate from `./manage.sh update`:**

1. Provision PostgreSQL with a restricted reader account and a writer account
   authorized **only** to modify the two derived xita_transfer_* tables.
   Apply `services/indexer/sql/002_transfer_operations.sql` using your
   database operator credentials.
2. Install the package's pinned runtime dependencies with
   `npm install --prefix services/indexer --omit=dev` and the unsigned recovery client `npm install --prefix runtime/native-relayer --omit=dev`.
3. Set the indexer reader `XITA_INDEXER_DATABASE_URL` in `/etc/xita/indexer.env` (see `services/indexer/indexer.env.example`) and create
   `/etc/xita/transfer-indexer.env` from
   `services/indexer/transfer-indexer.env.example` with mode 0600, using
   `XITA_TRANSFER_WORKER_DATABASE_URL` for the restricted DB writer.
4. Install `xita-indexer.service.example` as `xita-indexer.service` and
   `xita-transfer-indexer.service.example` as `xita-transfer-indexer.service`.
   Apply `systemctl daemon-reload`, then enable/start both services.
5. Add the exact wallet/stats/recovery GET locations from
   `services/indexer/nginx-locations.conf.example` to the HTTPS server and
   validate/reload Nginx. Check `/health`, wallet coverage and recent worker
   logs independently.

The indexer backfills from the first immutable Gateway deployment block,
so historical events can appear after startup; until all routes catch up to
finalized heads, the wallet API returns `status=partial` and the UI runs
its older bounded direct RPC scan as an additional best-effort check.
Unknown/gapped coverage is **never** shown as a definitive zero. The process
is a convenience and statistics engine, not an execution key, bridge relayer,
or source-of-truth replacement.

## October 2026 source-native Interchain Fee adapter / two-hop migration (draft)

The optional `XITAExecutionGateway` is a **source wallet-signed** first-hop
adapter. Its external `execute(quote,signature)` call invokes the canonical
ILN Gateway *inside the same EVM transaction*. The indexer observes the
underlying Gateway `ILNOperation` and Mailbox `Dispatch` as before and also
verifies the adapter's `InterchainFeeCharged` event. A source tx sent to
the adapter MUST NOT be classified as an unknown Gateway tx.

For EXISTING databases, apply `sql/003_interchain_journey.sql` **before**
updating the transfer worker and HTTP service. It adds only derived metadata
to the current `xita_transfer_operations` table: the immutable source fee
adapter, received native fee, final requested chain, signed recipient, and
the onward route ID. Neither a submitted second hop nor final destination
delivery is *inferred* from a signed intention.

Statuses:
- `awaiting-proof`: source confirmed, destination not delivered;
- `awaiting-onward`: first hop delivered to XGRChain, but the signed onward
  hop has not yet been uniquely linked to a canonical XGRChain Gateway tx;
- `delivered`: destination Mailbox delivered for that indexed hop only.

The existing `GET /api/xeta/v1/transfers/wallet` still returns individual
verified hop events. The wallet view conservatively keeps an `awaiting-onward`
hop open, even if a separate downstream hop is already visible; without an
explicit second-hop-to-first-hop cryptographic correlation marker, do NOT
assert that one downstream hop completed a specific first hop. Before user
signing hop 2, the UI re-verifies hop 1 and requires complete indexed history
with no same-wallet/asset/amount/onward-route collision. Ambiguity FAILS CLOSED.

Pricing occurs outside this indexer: the separate quote signer combines
per-chain gas estimates and each hop's validator/router fee and uses a fixed
source-native GROSS quote. No client geography or VAT `vatPolicy` is needed
for a blockchain quote. Customer tax classification belongs to subsequent
GmbH accounting, not to this trustless event indexer.

The fee-recipient wallet may periodically call `claimFees()` on EACH
chain-specific commercial adapter. It withdraws that contract's whole
`pendingInterchainFeesWei()` balance in one payout, rather than
per-message claims. Native revenues are distinct balances on Base, Polygon,
XGRChain, etc.; source-chain fee collection does not automatically rebalance
the sponsor's gas reserves across chains.

**Release gates remain:** currently the volunteer gas-grant service is NOT
implemented and the public status deliberately reads unavailable; claims
require explicit operator opt-in, correct chain-specific adapter deployments,
and configured fee wallet. The four-step journey's user transactions, route
costs and replay rules require live E2E validation before merge/deploy.
