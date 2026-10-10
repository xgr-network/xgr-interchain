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
`deployments/mainnet/receipts/<chain>/<transaction-hash>-<address>.json`.
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
