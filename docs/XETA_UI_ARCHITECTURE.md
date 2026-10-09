# XETA web product — token-first implementation
Status: **initial frontend implemented** in `apps/web`, pre-deployment. Target: xeta.xgr.network.

## Product structure
- `/` — explained overview, honest inventory counts and XGRChain hub model.
- `/markets` — searchable token directory, with market/bridge metrics explicitly unavailable until verified indexing.
- `/token/xgr` (and optional `/xgr`) — canonical XGR profile **with embedded transfer form**, route choices, live Gateway quote, wallet signing and destination delivery check.
- `/join` — Alliance application **local JSON export only**. It neither transmits nor approves a proposal. Future submission backend must be separately implemented.
- `/routes` — explanatory placeholder for future non-atomic DEX+XETA routing.
- There is **no separate bridge product** or `/bridge` route. `bridge.xgr.network` should ultimately point to `/token/xgr`, once XETA is deployed.

## Bridge implementation
A reusable protocol module, `apps/web/protocol.mjs`, encodes and calls `ILNGateway.quoteILN` and `ILNGateway.bridge`, validates source-chain ILN Registry route against verified deployment inventory, supports exact Gateway-only ERC-20 allowance, decodes the source `ILNOperation` event, and checks destination `Mailbox.delivered`. Direct Warp transfers are prohibited. Browser Ethereum ABI function selectors are computed with Ethereum Keccak (not SHA3).

**Do not enable live routes from desired config alone.** A route is selectable for executable quote only when quorum activation, verified infrastructure, source Gateway/router/vault, route binding and governance receipt have been recorded, followed by on-chain validation. The UI does not deploy, activate, or assert delivery on its own. The on-chain protocol and node are unchanged.

## Build and test
```sh
node tools/build-xeta-web-catalog.mjs
node tools/build-xeta-web-catalog.mjs --check
node --test apps/web/keccak.test.mjs
node --check apps/web/app.mjs
node --check apps/web/protocol.mjs
```

Static hosting requires SPA fallback to index.html, correct relative paths and strict HTTP security headers. XETA uses newly deployed token representations and route contracts.

## Release blockers
1. Independent wallet/contract E2E on all actual target chains, including native and synthetic quote values, approval, source receipt and destination delivery.
2. New token custody and redemption tests on deployed XETA routes.
3. Persistent event indexer for messages and rankings; verified external pricing source for market data.
4. Application backend and signed ownership verification if web submission is desired.
5. Real deployed manifest and governance evidence before any UI is declared live.
