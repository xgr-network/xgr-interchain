# XITA v3.1.5 — main-only deployment admin

The requested operator workflow is **one Deploy button**. GitHub `main`
is the **sole authorization source** for supported chains, assets and routes.
A PR, Issue, status label, tag, local modified manifest or feature branch is
NEVER an additional authorization or a deployment candidate.

## Implemented in this PR

- `GET /admin/api/workqueue` fetches the **current remote GitHub main SHA**
  and compares it with a **clean locally checked-out main**.
- On stale checkout, non-main branch, GitHub outage or invalid manifests,
  the queue **fails closed**. Never silently load local/PR inventory.
- All chains, assets and directed routes are derived dynamically from
  `config/chains/*.json` and `config/assets/*/asset.json, routes.json`
  of that exact repository commit; no XGR/Base-only hardcoded eligibility.
- Route topology requires XGRChain chain **and** domain 1643 at exactly
  one endpoint. Direct spoke-to-spoke routes cannot be queued.
- The Admin UI shows the verified SHA and eligible inventory.
- Deploy remains **disabled** because the full generic signed-wallet
  execution, constructor parameterization, receipt verification and
  cross-chain safe-activation engine are not implemented yet.

## Still to implement for a real one-click Deploy

A commit-pinned generically compiled/verified contract artifact manifest,
dependency and constructor planner, ERC20 original/wrapped role checks,
wallet transaction batches with explicit user confirmation, gas simulation,
receipt/codehash/binding verification, persistent/restartable progress,
source-fee quorum separate from route creation, remote-side BLS safety
attestation, route activation and end-to-end transfer tests.

Main **authorizes which definitions can be considered**. Main does not
override cryptographic safety or let the server spend wallet assets.
Wallet signing remains with the connected user and their wallet.

The old operator issue queue and static v3.1.4 planner remain diagnostics,
not an eligibility authority or an executable deployment path.

Run with `node services/admin/server.mjs`, bound to loopback by default.
Expose only behind TLS and authenticated Nginx `/admin/`, with all API
subpaths protected. The GitHub connection requires outbound access to
the GitHub REST API. `XITA_GITHUB_TOKEN` is optional for public main SHA
checks but required for issue status operations; rate limits may apply.

## Automatic post-deployment GitHub address recording

`deployment-ledger.mjs` now contains the trusted **backend-only** recorder
for the future one-click wallet deployment executor. For each executed
transaction, the recorder independently reads the receipt, canonical block,
expected chain ID, confirmation depth and Ethereum **Keccak-256 runtime code
hash**. Direct creations must match receipt.contractAddress; Factory
subdeployments must match its factory event and caller. The expected runtime
code fingerprint must come from the main-approved build, **not the browser**.

Verified records are immutable files under
`deployments/receipts/<chain>/<transaction-hash>-<address>.json`.
The whole transaction batch is atomically committed as one new fast-forward
commit to GitHub main using a least-privilege GitHub writer token. Existing
receipt paths are never overwritten. Files include addresses, tx/block hashes,
block height, source commit, chain ID, deployer, code hash, Factory provenance
and optional asset/route association. The writer does **not** invent or mark
BLS route activation from a deployment receipt.

**Important:** This module is NOT exposed as a generic POST endpoint. It
must be invoked only by the future trusted deployment executor, after
wallet transactions are created from a commit-pinned reviewed artifact plan.
Because main advances when evidence is appended, the executor must persist
the original approved source SHA in its durable journal and handle resuming
a batch after the address-reporting commit. A failed GitHub write must not
re-execute an already successful chain transaction. No deployment can occur
until the remaining executable workflow and wallet integration are finished.

## Admin UI v3.1.5: wallet, chain onboarding, workqueue

The Admin console has three separate views with URL fragments:
`#assets` (search/filter and 12 assets per page), `#infrastructure`
(chain components and wallet native balances), `#workflow` (ordered,
explicitly blocked infrastructure/route steps). All data is derived from
approved GitHub `main` and separately verified receipt indexes.

Wallets are connected through injected EIP-1193 providers, including
EIP-6963 multi-wallet discovery. The Admin entrypoint is an ES module:
`<script type="module" src="/admin/admin.js"></script>`, importing
`wallet.js`. This fixes the previous `connectDeploymentWallet is not
defined` browser error. A standalone WalletConnect QR session is NOT yet
provided: that requires a separately reviewed WalletConnect SDK/project ID.
The operator can switch to any approved chain; browser-authorized wallet
transactions still require explicit wallet approval.

The balance overview reads the connected chain through the wallet and other
approved chains from public RPC via read-only `GET /admin/api/balance`.
The server checks RPC chain identity, but a displayed balance is not proof
of sufficient deployment gas until transaction simulation. No EVM keys are
transmitted to the server.

`GET /admin/api/infrastructure` probes all configured chain identities,
Hyperlane core deployments and code at documented XITA v3.1.5 addresses.
Existing Hyperlane infrastructure does NOT count as newly deployed XITA.
`GET /admin/api/workqueue` now returns `workItems` with missing chain
components and asset/route prerequisites. These are explicitly BLOCKED,
not immediately executable, until reviewed artifacts and the validated
wallet transaction executor are in place.

To install after merge: `./manage.sh update`, then refresh the browser.
The deployment button MUST remain disabled until cryptographic counterpart
validation, receipt journaling and wallet main-pinned creation transactions
are complete. Do not send real native currency based only on UI readiness.

## Optional source-chain GmbH Managed Relay contract

For each chain separately (XGRChain, Base, Polygon, Arbitrum once approved), **Chain Infrastructure** displays the optional
`Interchain Fee · Execution Gateway` after the canonical Source Registry.
Enter TWO public constructor addresses: ONE GmbH `serviceWallet` for
EIP-712 quote signing, native fee payout and gas sponsorship, plus a distinct
`recoveryAdmin` (preferably a hardware/multisig wallet). No private key in Admin UI. Each chain's
Source Registry is drawn independently from its own verified manifest.
Contract creation, Ethereum
gas preview, MetaMask approval, independent runtime/constructor checks,
append-only GitHub receipt, chain deployment JSON, regenerated public
catalog, and server sync use the existing secure chain deploy machinery.
This component is not mandatory ILN infrastructure and is not part of the
bulk "finish chain" deployment. Use the same public GmbH service wallet on every chain; fee balances and chain deployments remain independent. After deployment each chain card exposes a wallet-signed "Service-Wallet ändern" action that requires the live Recovery Admin. Contract fee claim, quote signer and gas sponsor rotate together; previously accrued unclaimed fees flow to the new wallet. The Recovery Admin private key must not be on the XITA server.
The owner has NO ILN protocol, token, Mailbox or validator privilege.


## XGR v3.2.0 — validator-native Merkle indexer health

Configure the Admin **server** environment variable `XITA_VALIDATOR_RPC_URLS`
with a comma-separated list of already trusted JSON-RPC endpoints, one per
validator. Example: `XITA_VALIDATOR_RPC_URLS=http://127.0.0.1:8545`.
When nodes run on other hosts, prefer authenticated internal HTTPS endpoints
or private network ingress; do not expose unrestricted validator administration
ports. This list is explicitly configured by the operator and never taken from
a user-facing browser request.

The read-only Admin endpoint `GET /admin/api/operations/health` queries
`xgr_getILNIndexerStatus` on those nodes with a bounded timeout. Each
validator reports `workerAlive`, `updatedUnix`, per-route
`sourceHead`, `checkpointBlock`, `leaves`, `localLeaves`,
`lagLeaves`, `pendingPeers`, and `state`.
An unavailable RPC or stale worker is shown independently; a connected node
does not count as a ready Merkle replica until the canonical source root
matches. The browser polls every 30 seconds when Health is visible.

The XGR-Node's standard Prometheus exporter exposes the
`edge_interchain_iln_replica_ready`,
`edge_interchain_iln_replica_lag_leaves`,
`edge_interchain_iln_source_rpc_up` and
`edge_interchain_iln_worker_up` metric families via the existing
HashiCorp metrics Prometheus sink (subject to normal exporter configuration).
Alerting should also test Prometheus target `up == 0` for node outages:
an in-process gauge cannot announce the failure of its own process.
Use a sustained source RPC error, nonzero replica lag and stale
`updatedUnix` as distinct alert conditions. Never infer successful
Mailbox delivery solely from a healthy indexer.

The Admin probes are diagnostics only. No PR merge, transfer,
wallet signature, validator fee, or on-chain state mutation occurs.


## Current protocol baseline

For node v3.4.0, use the [current Direct-BLS architecture](https://github.com/xgr-network/xgr-interchain/blob/main/docs/architecture.md) and [independent execution runbook](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md). Route registration and authenticated destination delivery are permissionless. The XITA website, commercial gateway, sponsor and managed relayer are optional; validator authorization, chain access, gas and source protocol fees remain necessary. Contract/interface version suffixes are independent of node release versions.
