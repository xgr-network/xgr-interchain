# XITA web UI — v3.1.5 token-first architecture

Status: visual frontend implemented. **No production bridge is active.**

## Pages

- `/`: dashboard, configured inventories and journey planner
- `/universe`: interactive chain systems; choose a system, then open its token
- `/markets`: searchable token directory
- `/token/<slug>`: requires verified complete deployments, with dedicated bridge panel
- Route inventory appears on individual token pages; the standalone public Routes page is retired.
- `/join`: offline token application draft, JSON export only

There is **no** standalone former bridge or `/bridge` route. The old XGR/Base
v3.1.4 Gateway adapter is deleted. The XITA v3.1.5 route architecture is
permissionless but activation remains fail-closed pending independent BLS safety
proof and verified reciprocal route deployment.

## Transfer UI security contract

The v3.1.5 transfer panel is an interactive **route-planning preview only**,
not an executable mock bridge. The connected wallet reveals the account and
active chain; read-only HTTPS JSON-RPC calls retrieve this account's native
gas balances on all configured chains, verifying each RPC chain ID first.
The active chain may be read directly through the EIP-1193 wallet.
Unreachable RPCs or CORS failures are displayed as **unavailable**, never
misrepresented as zero. The public wallet address is disclosed to public
chain RPC providers for these balance queries.
No wallet network switching, approvals, signing, gas quotes or transfers
are made by the preflight. A nonzero native balance is **not** evidence of
sufficient gas for a specific transaction; that requires live source and
destination simulations, fees, allowances and amount checks. The send
button is explicitly disabled. Do **not** revive v3.1.4 `quoteILN`, `bridge`,
`ILNGateway` or legacy governance calls as a shortcut.

When the v3.1.5 gateway adapter, deployment manifests, fee journals, and
live route-safety proofs are finished, the token panel can execute the new
ABI flow only after verifying on-chain source and destination contracts,
the reciprocal route pairing and route activation. A Base -> Polygon route
is **two independently executed hops** through XGRChain 1643, never a
direct external-to-external transfer. A second hop sponsor is not implemented.

**Wallet-funded two-transaction-per-hop UX:** for each directed hop
the user confirms (1) a source Gateway.bridge() transaction paying source
gas plus the validator fee, followed after validated BLS/Merkle proof by
(2) a destination Mailbox.process() transaction paying target-native gas.
External-to-external routes have two hops (four transactions), plus optional
ERC-20 approvals. The user must already hold target-native currency before
initiating each hop; the transferred token amount cannot be assumed to fund
its own delivery. The pure planner now shows balances for source, hub and
destination with a per-hop step explanation.

Future **Starter Gas** is an optional externally sponsored onboarding
service and is not implemented. It must neither become a mandatory relayer
nor grant governance or asset custody. The already verified XGRChain
ValidatorRegistry, ISM, Mailbox/Hook bundle and router deployer contracts
remain unchanged by this UI patch.

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
node --check apps/web/wallet-gas.js
node --test apps/web/wallet-gas.test.mjs
```

The static site requires SPA fallback. Always review routes and wallet behavior
in a real browser before deploying. No wallet private keys or secret seeds
are requested.

## Derived visibility
No listing.json exists. Config, deployment receipts and the read-only
PostgreSQL-backed indexer jointly determine eligibility. Tokens, public
search, Universe and rankings show only explicitly public assets. The
minimum locked USD/USDC-equivalent threshold is currently unset; stale
or missing evidence is unknown, not zero. See
[XITA_PUBLICATION_POLICY.md](./XITA_PUBLICATION_POLICY.md).

## One Transfer Tokens page and chain-sourced recovery

`/transfer?token=<ASSET>` is the single transfer entry point. Token detail
cards provide only this deep link with the token already selected. Legacy
`/plan-route` navigates to `/transfer`. A single primary button either
initiates the selected source transfer or CONTINUES an unfinished destination
delivery; the progress field under the button shows source confirmed (1/2),
destination pending, or delivery confirmed (2/2). It is NOT a four-step
wizard. Future two-hop paths are two independent directed transfers through
the XGRChain hub, each with its own source/target confirmation.

The sole administrative availability state is GitHub-documented `deployed`.
Contract/fee and wallet transaction safety are evaluated live in the chain
preflight; there is no manually managed `verified` activation flag. The
transfer page only offers fully documented paired chains and routes. Any
configured but undeployed token representation remains a prospect on the
token detail page.

Wallet connection reads native-chain gas balances and native/wrapped token
balances from their canonical chain/router. It also reads canonical
`Gateway.ILNOperation` plus `Mailbox.Dispatch` from confirmed source
receipts initiated by the connected account and checks target-chain
`Mailbox.delivered(messageId)`. A source confirmed on-chain with
`delivered=false` becomes an open wallet work item: `Continue delivery`.
Reconnecting the same wallet reconstructs the same item from chain evidence;
no localStorage, IndexedDB, backend transfer journal or browser click history
can mark a transfer complete or authorize a second source bridge.

The public read-only `GET /api/xeta/v1/transfer/recovery` obtains the
canonical original message, current validator-set quorum, the Merkle inclusion
proof and unsigned `Mailbox.process(metadata,message)` calldata by running
the same permissionless recovery client. It holds no wallet private key.
Only an explicit user click may change MetaMask network and sign destination
gas; destination simulation, gas estimate, and `delivered(messageId)`
are checked immediately before submission. A failed/missing quorum, RPC
outage, pending source, failed source, or unknown delivery state fails closed.
An unsuccessful destination receipt may be retried by resubmitting ONLY
the destination `Mailbox.process`, never `Gateway.bridge`, re-lock, burn,
or an extra validator source fee.

The browser's bounded 4,096-block scan is convenient but NOT a complete
historical wallet indexer. Older transfers must still be reconstructible
by entering their original source transaction hash on `My Transfers`.
A future finalized event indexer may accelerate discovery but must not
replace chain data as the source of truth. Currently, the unsigned recovery
endpoint additionally requires the existing indexer service and proxy
location to be deployed; E2E source+target execution and proof-retry on
production routes must be exercised before calling it proven.


### Persistent wallet and movement index (same XITA statistics infrastructure)

The XITA metrics indexer also runs the independent `transfer-index-worker.mjs`
with a least-privilege PostgreSQL writer. It backfills immutable deployed Gateway
events from their documented contract deployment blocks to finalized heads,
verifies matching Mailbox.Dispatch and wallet-initiated source transactions,
and reconciles finalized `Mailbox.delivered(messageId)` on every destination.
Its records contain a source-wallet-keyed message ID, original source TX,
route, source amount when unambiguously decodable, pending/delivered/unknown
state and canonical checkpoint hash. On reorg its cursor and route facts are
reconstructed; incomplete route coverage remains explicitly PARTIAL.

`GET /api/xeta/v1/transfers/wallet?account=0x...` is a read-only wallet
worklist. After wallet connect, the client requests it and shows a header
alert **only for confirmed source operations with delivered=false**. Click
the alert to open the existing `/transfer` flow and resume just the target
mint/unlock. The client falls back to the bounded direct RPC scan while
the indexer is absent or still backfilling. A missing API response is NOT
an empty wallet worklist. This indexer is a query accelerator, not the
source of truth: the actual recovery signature is preceded by canonical
source receipt, message, proof and destination delivered-state checks.

`GET /api/xeta/v1/transfers/stats` exposes per-asset raw amounts and hop
event counts split into pending/unknown/delivered, with coverage metadata.
Do not treat these hop counts as unique end-to-end journeys, market transfer
value, or USD collateral. Independent custody and pricing evidence are still
needed for locked TVL and public listing threshold calculations.
