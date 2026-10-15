# XITA standalone web UI

Status: visual frontend implemented. **No production bridge is active.**

## Pages

- `/`: dashboard, configured inventories and journey planner
- `/universe`: interactive chain systems; choose a system, then open its token
- `/markets`: searchable, sortable Tokens directory with independently verified locked TVL, journey movement and market capitalization
- `/token/<slug>`: token detail and prospects; link to the only transfer page
- `/transfer?token=<ASSET>`: single transfer UI with on-chain worklist and destination-only recovery
- `/join`: four-step Alliance onboarding with live token universe preview, local JSON export, and optional manifest preview backend. GitHub draft PR creation is gated by confirmed applicant email, independent CoinGecko contract checks and a server-side writer; without configured private storage and email delivery it fails closed.

There is **no** standalone former bridge or `/bridge` route. The old XGR/Base
v3.1.4 Gateway adapter is deleted. The XITA v3.1.5 route architecture is
permissionless but activation remains fail-closed pending independent BLS safety
proof and verified reciprocal route deployment.

## Transfer UI security contract

The v3.1.5 Transfer Tokens screen now checks canonical deployed source
Gateway quotes, native and ERC-20 balances, and gas before an explicit
MetaMask source signature. At wallet connect it scans canonical Gateway
operation and Mailbox events and reads destination `delivered(messageId)`.
If a source lock/burn was confirmed without a completed mint/unlock, the
one primary button switches to destination-only recovery. No browser
transfer journal is used. A bounded recent scan cannot establish that
no older open transfers exist; entering the original source tx hash
under My Transfers remains supported. The unsigned Merkle/BLS recovery
endpoint must be deployed with the separate indexer service and reverse
proxy before the destination action can be used. Successful end-to-end
delivery is not presumed by deployed contract receipts alone.

## Startup and publication

Dashboard and Universe read the same-origin `catalog.json` (approximately 10 KB) directly. RPC, wallet and optional indexer endpoints are outside the critical rendering path. Browser modules use `.js` to avoid Nginx `.mjs` MIME inconsistencies. A classic-script watchdog replaces the placeholder with a visible error if JavaScript fails to execute; the catalog request is limited to 2.5 seconds.

## Checks

```sh
node tools/build-xeta-web-catalog.mjs --check
node --test apps/web/experience.test.mjs apps/web/keccak.test.mjs
node --check apps/web/app.js
node --check apps/web/experience.js
node --check apps/web/wallet-core.js
```

The static site requires SPA fallback. Always review routes and wallet behavior
in a real browser before deploying. No wallet private keys or secret seeds
are requested.

## The XITA Universe — immersive 3D

`/universe` mounts a local, dependency-free WebGL star map using the existing `catalog.json`. XGRChain remains the spatial and routing hub; other chain systems are arranged in depth. A chain's body is the system star. Selecting a chain fades out its abstract stellar dust and galaxy rings while up to six catalog-listed native, collateral or wrapped representations emerge as selectable token planets. Planet visibility depends on complete verified deployments and fresh indexed net locked USD/USDC-equivalent collateral meeting the configured threshold. The focus panel lists publicly eligible deployed representations and explicitly does not claim route activation. Valid sourced rankings may reorder planets; a missing ranking never removes them. Directional configured routes are drawn only between the hub and a spoke; unactivated links are dashed. This scene is explanatory, **not on-chain delivery evidence**.

Controls: left-drag to orbit; right-drag or Shift-drag to pan; wheel or `+`/`-` to zoom; arrow keys or on-screen arrows to rotate; WASD to pan; `H`/Home or `XGR ⌂` to reset; click stars to focus and token planets to open their token page. A native lightweight 2D fallback is shown if WebGL is unavailable. Animation pauses off-screen, on background tabs, and when navigating away.

`/` retains the dashboard and embeds the same renderer in compact form. Browser smoke tests assert successful initialization on dashboard and `/universe`.

## Alliance onboarding security

`services/onboarding/manifests.mjs` generates three declarative token manifests and a catalog update, but no pending deployment index; PRs are **listing proposals only**, not route activation. `services/onboarding/server.mjs` can provide localhost-only `/api/xita/join/preview`. The publisher implementation prepares a GitHub draft PR but public `/submit` is intentionally closed pending signed project identity + short-lived scoped session. Never place a GitHub token in browser scripts, do not expose `/submit` directly to unauthenticated users. The public web continues to work if preview API is not configured; drafts can be exported locally.

## Join price-source configuration

The home chain must be selected explicitly (no default Base). Step 2 requires the original ERC-20 address and CoinGecko ID; no asset bridge is enabled by selecting a chain. Onboarding validation requires valid canonical chain and contract. Price feeds are informational and not collateral or route proof.

## CoinGecko market data in Universe

XGR uses CoinGecko ID `xgr` as its public market provider. The existing
read-only metrics adapter refreshes the external market snapshot on its normal
cache cycle. System detail panels and token profiles may show the sourced USD
market cap and price with an as-of timestamp. Market cap is asset-wide and
may repeat on several chains representing that same asset; **never aggregate
it across chains or label it bridge TVL**. Unavailable market data remains
absent; price-only market data never activates a transfer or supplies a
verified escrow balance. The XGRChain network hub remains visible, but XGR token discovery requires
its own deployment and indexed value rather than an unconditional exception.

## Derived discovery policy
No listing.json, permanent public switch or fixed USD threshold. Configured
assets become public only with complete verifiable deployments and DB-verified
net locked collateral valued above the configured minimum. The minimum is
explicitly null until decided. See
[publication policy](../../docs/XITA_PUBLICATION_POLICY.md).

## Production Join deployment

See [secure Join operations](../../docs/XITA_JOIN_OPERATIONS.md). The live public submission endpoint is fail-closed until private storage, mail verification and GitHub writer credentials are installed; updating the static site alone is not sufficient. Review and extend the XGR privacy policy before enabling mail processing.
