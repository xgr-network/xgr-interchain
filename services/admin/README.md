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
