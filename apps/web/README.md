# XITA standalone web UI

Status: visual frontend implemented. **No production bridge is active.**

## Pages

- `/`: dashboard, configured inventories and journey planner
- `/universe`: interactive chain systems; choose a system, then open its token
- `/markets`: searchable, sortable Tokens directory with independently verified locked TVL, journey movement and market capitalization
- `/token/<slug>`: independent token detail page and its own dedicated bridge panel
- `/routes`: configured directional routes and explicitly unverified activation status
- `/join`: offline token application draft, JSON export only

There is **no** standalone former bridge or `/bridge` route. The old XGR/Base
v3.1.4 Gateway adapter is deleted. The XITA v3.1.5 route architecture is
permissionless but activation remains fail-closed pending independent BLS safety
proof and verified reciprocal route deployment.

## Transfer UI security contract

The v3.1.5 transfer panel is an interactive **route-planning preview only**,
not an executable mock bridge. Wallet connection reads account, chain ID and
native wallet gas balance; no contracts are called or approved. The send button
is explicitly disabled. Do **not** revive v3.1.4 `quoteILN`, `bridge`,
`ILNGateway` or legacy governance calls as a shortcut.

When the v3.1.5 gateway adapter, deployment manifests, fee journals, and
live route-safety proofs are finished, the token panel can execute the new
ABI flow only after verifying on-chain source and destination contracts,
the reciprocal route pairing and route activation. A Base -> Polygon route
is **two independently executed hops** through XGRChain 1643, never a
direct external-to-external transfer. A second hop sponsor is not implemented.

Universe paths visualize topology and configured inventory only; never infer
live activation from an illustration or an asset listing.

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

`/universe` mounts a local, dependency-free WebGL star map using the existing `catalog.json`. XGRChain remains the spatial and routing hub; other chain systems are arranged in depth. A chain's native coin is the system star, listed non-native representations orbit as selectable token planets. Directional configured routes are drawn only between the hub and a spoke; unactivated links are dashed. This scene is explanatory, **not on-chain delivery evidence**.

Controls: left-drag to orbit; right-drag or Shift-drag to pan; wheel or `+`/`-` to zoom; arrow keys or on-screen arrows to rotate; WASD to pan; `H`/Home or `XGR ⌂` to reset; click stars to focus and token planets to open their token page. A native lightweight 2D fallback is shown if WebGL is unavailable. Animation pauses off-screen, on background tabs, and when navigating away.

`/` retains the dashboard and embeds the same renderer in compact form. Browser smoke tests assert successful initialization on dashboard and `/universe`.
