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
returns at most six qualifying public, chain-represented assets. Under `null` policy, documented token representations remain discoverable
and sortable even if their USD metrics are unknown. Unknown values sort last
and are never invented. `marketCapUsd` is provider-sourced
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
unknown, never zero. The minimum in `config/publication.json` is currently `null`, which
publishes receipt-backed deployed tokens without a TVL threshold. Numeric
values require an independently audited finalized escrow verifier and valid
USD valuation (strictly greater-than threshold).
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

Pricing occurs outside this indexer: the same GmbH service-wallet signer combines
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

## Accelerated known-TX indexing (additive migration 005)

The finalized route scanner and its independent archive-qualified RPC remain
authoritative for **complete** historical coverage. Base historical `eth_getLogs`
may still be unavailable or slow despite fallback. A newly broadcast *source*
TX hash needs only `eth_getTransactionByHash`, a canonical receipt, confirmation
depth, and the Gateway/Mailbox event identity. The candidate RPC is chain-ID
checked but does **not** require the slow Base archival log probe.

The public website sends a best-effort, size-bounded POST with `account`,
`sourceChain` and `txHash` after the wallet has returned a source TX hash.
A manual lookup of a previously confirmed TX also announces the hash. The
isolated service on port 4089 persists the **untrusted** claim to PostgreSQL.
Its DB account MUST have INSERT permission ONLY on
`xita_transfer_announcements`. Origin check and per-minute limits reduce
spam, but do not authenticate wallet ownership. **No staging hint authorizes
a mint, unlock, source replay, delivery, claim, TVL or fee.**

The independently running finalized indexer worker reads a small bounded
queue, verifies the source wallet (`tx.from`), approved Gateway/adapter target,
successful receipt, confirmation depth, canonical block hash, single
Gateway operation, matching Mailbox Dispatch, and relevant signed adapter
evidence before atomically writing the same canonical transfer projection as
a historical scan. Hints never advance historical route cursors. Stale/forked
fast-path blocks are rechecked until the route backfill catches up. A wallet
read includes an `observed` source TX as `pending-source` with
`confirmed:false` and **no message ID**; mere `reported` claims are hidden.

**Operator activation is explicit** (no migration or service activation in
`./manage.sh update`):

1. Apply `services/indexer/sql/005_transfer_announcements.sql` to the
   EXISTING indexer PostgreSQL database after 002/003 have been applied.
2. Create a NEW, no-login-privilege-escalation PostgreSQL role with only
   `INSERT` on `xita_transfer_announcements`, and add SELECT on this table
   to the existing HTTP reader role and SELECT/UPDATE/DELETE on this table to
   the existing finalized worker role. Do not grant the public intake role
   privileges on `xita_transfer_operations`, cursors, custody records, or
   any unrelated schema.
3. Copy `transfer-intake.env.example` to `/etc/xita/transfer-intake.env`
   with mode 0600, configure only that new limited DB connection, and run
   `./manage.sh install-transfer-intake` from a clean current `main`.
   It installs an isolated systemd service and an **exact** Nginx proxy
   `POST /api/xeta/v1/transfers/announce` to loopback 4089, retaining the
   existing `/api/xeta/` fail-closed location.
4. Verify `systemctl is-active xita-transfer-intake.service`,
   `systemctl is-active xita-transfer-indexer.service`,
   `curl -fsS http://127.0.0.1:4089/health`, and inspect both services'
   logs. Test a real source TX via the wallet, or import the old source TX
   using My Transfers; check the wallet API after the worker's next scan.
5. `./manage.sh update` subsequently restarts an *installed* intake service,
   but it neither provisions DB roles nor silently enables this endpoint.

Previously locked XGR must **never** be locked or burned again merely because
a scan is behind. Existing wallet lookups and the original finalized-chain
backfill work independently of the optional staging service.


## Verified token-agnostic TVL and 24h gross escrow movements

Implementation: services/indexer/tvl-verifier.mjs, tvl-worker.mjs and escrow-flow-24h.mjs.
Every deployed asset is resolved from the immutable deployment catalog. The native
XGR router reports its physical XGR balance, less only beneficiary liabilities
(totalPendingNativeXGR); a canonical ERC-20 collateral router reports actual
underlying.balanceOf(router). Synthetic balances are never custody. A shared
router spanning multiple spokes is counted once. The independent finalized
route index checks source locks and confirmed destination releases to reject
unrelated transfers, uncertain coverage and inconsistent balances. A missing
CoinGecko price or incomplete proof is **unavailable**, not zero.

Moved via XGR / Escrow moved (24h) is the **gross sum of physical escrow inflows
and confirmed outflows during the last 24 hours**, not cumulative volume and
not net TVL change. Inflows use canonical source-block timestamps; releases use
verified destination Mailbox ProcessId event blocks. A pending reverse burn
is not an outflow. Multi-hop synthetic mint/burn does not count again. All
movements are valued with the latest fresh CoinGecko price, not execution-time
historical prices. The proof rejects absent, duplicated, unfinalized or
ambiguous events and caps a snapshot to 10,000 operations per asset. TVL and
24h gross metrics fail independently.

Installation requires:
1. Verify the bidirectional finalized transfer index has COMPLETE coverage
   for every active origin route. The existing Base archive-RPC log source may
   need a qualified endpoint; an index with scan gaps is never a TVL proof.
2. Provision SELECT-only xita_indexer_reader grants on
   xita_transfer_operations and xita_transfer_index_cursors. Set
   /etc/xita/tvl.env (mode 0600) from services/indexer/tvl.env.example.
3. Add XITA_METRICS_EVIDENCE=/var/lib/xita/verified-tvl.json to BOTH
   /etc/xita/indexer.env and /etc/xita/tvl.env; never populate this file
   manually. The installer checks the exact path and does not overwrite secrets.
4. Once all code has passed CI, run ./manage.sh update and then
   ./manage.sh install-tvl. This creates an opt-in restricted systemd service.
   Inspect journalctl -u xita-tvl.service -n 80 --no-pager and
   curl -fsS http://127.0.0.1:4088/api/xeta/v1/metrics/toplist.
5. Check source/destination event finality, first lock, reverse delivery,
   physical router balances, pending claim liabilities and 24-hour movements
   against actual mainnet RPC receipts. Do not accept a positive number when
   these checks fail. No blockchain write transactions are needed.

The commercial Interchain Fee Execution Gateways are unrelated to TVL and
to these measurements. Subsequent manage.sh update restarts an active
xita-tvl.service, but never silently provisions credentials or enables it.


## TVL installer correction (18 October 2026)

Run `./manage.sh install-tvl` after `./manage.sh update`. It reuses the existing
`/etc/xita/indexer.env` database reader credentials; do NOT create
`/etc/xita/tvl.env` and do NOT copy example credentials. Both services share
the fixed, owner-readable evidence path `/var/lib/xita/verified-tvl.json`.
The metrics API returns unavailable evidence until the worker writes a valid
file; the installer restarts the running metrics API after enabling the worker.
Verified USD TVL still requires finalized route index coverage and valid
CoinGecko pricing. No chain transactions are performed.


## October 22, 2026: DB-backed 24h escrow gross volume (SQL 006)

Before restarting xita-transfer-indexer and xita-tvl, apply
`services/indexer/sql/006_transfer_flow_timestamps.sql` to the EXISTING XITA PostgreSQL
DB with a schema-migration role. `./manage.sh update` intentionally does NOT
run database migrations. Verify both columns exist on
`xita_transfer_operations` before starting the updated worker. Both current
worker roles continue to require their existing restricted privileges.

The indexer records source-block timestamps from an already canonical-checked
source block (no additional historical query). A delivery contributes a
24-hour escrow outflow only when a previously observed *undelivered* operation
transitions to confirmed delivery after a recent check. Its timestamp is the
**first confirmed observation**, not a recovered historical destination block
time. Already delivered or backfilled operations without an event timestamp do
NOT get stamped with the time of import. Historical volume before activation
cannot be reconstructed honestly from these two columns. Once deployed, run a
new lock/unlock and inspect `/api/xeta/v1/metrics/toplist` to validate the
freshly indexed values; existing balances and transfers are unaffected.

## Official explorer wallet discovery (optional, no new SQL migrations)

Arbitrum (42161) and Base (8453) share the fixed Etherscan V2 API.
For each connected wallet, the **server** requests at most the latest 100
`txlist` and 100 `tokentx` records for each deployed source chain, starting
no earlier than the relevant XITA gateway deployment. It filters by the
actual, receipt-backed Gateway/ExecutionGateway target addresses and validates
up to eight candidate transactions per chain using normal XITA source receipt,
Gateway, Mailbox, Interchain Fee and chain-finality evidence over separately
chain-ID-verified read-only RPC. Merely observed Explorer claims are never
counted as verified pending work and cannot authorize a deliver, mint or burn.

Set the API key **server-side only** in the existing private environment file
read by `xita-indexer.service` (check `systemctl cat xita-indexer.service`):

```ini
XITA_ETHERSCAN_API_KEY=<private Etherscan V2 API key>
```

Do **not** put the key in catalog.json, browser JS, GitHub or public Nginx.
Restart the read-only indexer process after configuring the key.
The endpoint `GET /api/xeta/v1/transfers/discovery?account=0x...` returns
`status: not-configured` if no key is supplied. The API is optional:
normal wallet index/history remains unaffected. Per-wallet response cache
is two minutes and there is a 36-request/minute hard outbound cap plus
deduplicated concurrent wallet fetches. Explorer V2 provider plans may not
cover all networks or historical records; partial/unavailable is explicit.
XGRChain is handled by the native indexer, not Etherscan.

The `xita_transfer_announcements` SQL 005 migration and intake service are
**separate optional fast-path infrastructure**; Explorer discovery does not
modify schema or eliminate historical canonical index maintenance.

## Persisted continuous two-hop verification (PR #257)

The source of truth stays canonical finalized Gateway and Mailbox evidence. The
public web UI shows **one parent journey** for each cryptographically linked
two-hop operation; a child hop remains independently recorded in SQL. The
per-wallet pending count excludes uniquely linked child operations, not orphans.

Install SQL migration `sql/008_transfer_proof_observations.sql` before starting
`xita-transfer-proof-observer.service.example` as
`xita-transfer-proof-observer.service`, on the machine already running the
transfer indexer. Grant the transfer worker SELECT/INSERT/UPDATE on the derived
proof observation table and SELECT on the indexed source operations. Grant the
public indexer role SELECT only. No private key is required or permitted.

The observer independently processes *only* finalized indexed messages with
destination `delivered=false`, continuously prepares **unsigned** validator
proofs, classifies RPC/quorum errors, and stores only diagnostics/timestamps.
Rows are per `(source_chain,message_id)`, leased across process crashes
and concurrent observer instances, with bounded backoff. Missing migration
fails closed operationally while the older wallet API remains usable.

The wallet history GET endpoint optionally joins these observations, scoped
to an existing verified wallet's messages. A `ready` observation is only a
status hint: the browser MUST independently re-fetch the original finalized
Gateway receipt, verify unsigned calldata and independently query destination
Mailbox and run `eth_call` before asking MetaMask for an explicit wallet TX.
No observer ever signs, delivers, mints, burns, sends transactions, or treats
proof readiness as successful delivery.

After DB migration, install the separate service:
```sh
sudo cp services/indexer/xita-transfer-proof-observer.service.example /etc/systemd/system/xita-transfer-proof-observer.service
sudo systemctl daemon-reload
sudo systemctl enable --now xita-transfer-proof-observer.service
sudo systemctl status xita-transfer-proof-observer.service
sudo journalctl -u xita-transfer-proof-observer.service -n 80 --no-pager
```
This deployment is **not** automatic on `main` merge. Apply the migration
using approved database administrator credentials before enabling the service.
A successful source confirmation is NOT proof of a delivered destination.


## Current protocol baseline

For node v3.4.0, use the [current Direct-BLS architecture](https://github.com/xgr-network/xgr-interchain/blob/main/docs/architecture.md) and [independent execution runbook](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md). Route registration and authenticated destination delivery are permissionless. The XITA website, commercial gateway, sponsor and managed relayer are optional; validator authorization, chain access, gas and source protocol fees remain necessary. Contract/interface version suffixes are independent of node release versions.
