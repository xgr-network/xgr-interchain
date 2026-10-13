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

## Connected-wallet My Transfers and recovery preflight

**My Transfers is only visible after explicitly authorizing an EIP-1193
wallet account.** Disconnecting/switching the account removes the navigation,
clears previous wallet activity and invalidates pending asynchronous reads.
Unconnected deep links redirect to the public dashboard.

The user may re-enter an original source transaction hash even after changing
devices. Read-only HTTPS RPC verifies the originating wallet (transaction.from),
documented source Gateway, successful confirmed receipt, unique canonical
Gateway ILNOperation(routeId, messageId, domain) and matching Mailbox.Dispatch
bytes hashed to that same messageId in the very same source transaction.
Destination Mailbox.delivered(messageId) is independently read. Unavailable
destination RPC means UNKNOWN, never failed. Replayed/failed/pending source
transactions must not be mistakenly labelled recoverable.

The bounded recent-block scan helps find transfers of the currently connected
wallet from canonical, deployed XITA Gateway routes; it is NOT a full history
indexer and may have gaps (CORS, rate limits, confirmation depth). The source TX
hash lookup remains the recovery path when older history is unindexed.

**Recovery submission remains deliberately disabled** until the complete v3.1.5
Merkle/BLS proof distribution endpoint is independently verified, the UI can
estimate and sign only the *destination* Mailbox.process transaction, and E2E
tests demonstrate a retry after out-of-gas or user cancellation. There is no
re-broadcast of original TX1, no private key storage, no proxy upgrade,
no on-chain governance mutation and no automatic destination gas sponsorship.
