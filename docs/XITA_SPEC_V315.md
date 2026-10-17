# XITA / XGR Interchain v3.1.5 — protocol specification

**IN DEVELOPMENT — do not deploy to mainnet.**

This is a fresh XITA architecture with ONE route registration scheme. There
is no route-add, route-enable, route-disable or per-route fee governance. The
factory is public; route permission is not granted by the XGR organization.

## Mandatory XGRChain hub

Every **single directed route** MUST have XGRChain at EXACTLY ONE endpoint:
- XGRChain is EVM chain ID **1643** and Hyperlane domain **1643**.
- Both chain ID and domain MUST match. A fake domain 1643 on another chain
  cannot act as XGRChain; likewise chain ID 1643 with another domain fails.
- Allowed: XGRChain -> Base, Base -> XGRChain, XGRChain -> Polygon,
  Polygon -> XGRChain (and similar EVM spokes).
- Forbidden: Base -> Polygon, Polygon -> Base, spoke -> spoke and hub -> hub.
- To transfer Base -> Polygon the protocol performs TWO separate directed
  routes: Base -> XGRChain, then XGRChain -> Polygon.
- Both `XGRILNProtocol.routeInstanceIdV315` and
  `XETATokenFactoryV315.registerRoute` must enforce these constraints.

No chain or UI can override this rule.

## Deterministic identities

`assetId = keccak256(abi.encode(keccak256("XITA_ASSET_V315"), uint64(originChainId), address(originToken), uint8(kind)))`.

- Native XGR: origin chain=1643, token=0x0, kind=0.
- External ERC20: actual canonical original chain/token address, kind=1.
- All accepted representations of one original asset share that Asset ID.
- Token names, symbols and user-submitted origin metadata do not prove
  authenticity. Multiple independent representations may legitimately exist.

`routeId = keccak256(abi.encode(keccak256("XITA_ROUTE_INSTANCE_V315"), assetId, sourceChainId, sourceDomain, destinationChainId, destinationDomain, sourceRouter, destinationRouter))`.

- This is the **only** route identity for native XGR, wXGR and ERC20.
- A new router pair produces a different route ID, even for the same asset
  and directed chain pair. Nobody can monopolize an asset's first route.
- Reverse direction reverses BOTH chain identities and Router addresses
  and has a different Route ID.
- Neither fee, Gateway address, UI listing status nor token symbol is part
  of the route ID.
- An identical directed route ID cannot be inserted twice into its source
  registry. A route cannot be replaced or retargeted.

## What each route registers

Each source-chain registry has one immutable record per
`(destinationDomain, routeId)`, created by the public Factory:

- **Asset binding**: assetId, destinationChainId, sourceToken and
  destinationToken. Native tokens have the zero-token address.
- **Router binding**: local sourceRouter and remote destinationRouter.
- **Hop identity**: sourceChainId, sourceDomain, destinationDomain, routeId.
- **Gateway binding**: its exact local Gateway address, Mailbox and
  MerkleTreeHook. The Gateway binds this route and source Router immutably.
- **State**: atomic registration immediately enables a route on its source chain. BLS protects individual messages, not route admission.
- **Fee**: read dynamically from the source Registry's SINGLE
  `validatorFeeWei`; it is NOT individually configured for each route.

Every new Gateway also creates its own fee accounting vault. Validators
receive credits and claim their earnings (no automatic micro-payouts).

A factory-issued Collateral Router holds its OWN token collateral.
A Synthetic Router starts at zero supply, mints only on authenticated
inbound delivery, and burns on authenticated outbound dispatch.
A native-XGR Router holds the native XGR escrow for its own route.
Independent routes never share authority to withdraw each other's funds.

## Permissionless registration

1. Anyone may deploy their independent local router at the public Factory.
2. Once both router addresses are known, the creator calls
   `registerRoute(sourceRouter, destinationChainId, destinationDomain, destinationRouter, destinationToken)`
   on the source chain. Gateway, FeeVault, route storage and router binding are atomic.
3. There is NO BLS vote, separate activation, CLI governance step or human approval.
4. Before offering public bidirectional bridging the frontend/indexer checks the
   finalized counterpart registration, remote bytecode and token identity.
   Indexer discoverability is advisory and cannot veto a route.
5. The destination ISM requires a BLS quorum for each exact message/checkpoint,
   with the original message ID and Merkle proof. Relayers remain replaceable.

## Source-chain validator fee

Exactly one native-currency fee is set for each source registry, requiring
the active validator quorum:
`XITA_SOURCE_FEE_V315 || bytes8(chainId) || bytes4(domain) || bytes20(registry) || bytes8(setId) || bytes8(nonce) || bytes8(validUntil) || bytes32(validatorFeeWei)`.

There is no per-route fee vote. The source fee nonce is monotonic, the BLS
setId must match the current set and the signed proposal has an expiry.
Historical receipts must be interpreted using the fee at the original
source block, not today's current value.

## Destination execution gas is independent of Factory

The Factory no longer has a destination gas constructor input. Its internal
`HYPERLANE_DESTINATION_GAS_HINT = 500000` is forwarded to the already
deployed router-deployer ABI, where GasRouter stores it as immutable
dispatch metadata, not an EVM execution gas cap.
The fresh XITA MerkleTreeHook ignores this gas field
and the required ProtocolFee hook is initialized with zero fee. No on-chain
gas paymaster enforces the hint as a destination EVM transaction limit.

The relayer independently estimates `Mailbox.process(metadata,message)` on
the actual destination chain, covering ISM/BLS validation and recipient token
delivery. It adds 30% plus 30,000 gas, verifies this fits under the current
destination block gas ceiling with 50,000 reserve, and only then submits.
A different permissionless executor may do its own gas estimation and
submit the same proof. Inability to estimate or fit gas means no broadcast,
not token loss. Network-level destination fees are distinct from the
native source-chain validator fee.

XGRChain launches with a manually confirmed **0.1 XGR** initial
source-registry validator fee per XGR-source hop, equal to
`100000000000000000` Wei. Spoke registries use their own native
currency; later fee changes require BLS validator quorum.

## Optional XITA GmbH Interchain Fee and global UX (draft PR #136)

**Protocol separation:** The core ILNGateway, source Registry, FeeVault,
Mailbox, ISM and validator governance remain permissionless and unchanged.
The optional **one-per-source-chain** `XITAExecutionGateway` is a paid
UI convenience adapter, not a custodian or a service-mandated relayer.
The user signs each of the four EVM transactions for spoke->XGRChain->spoke.
The first user's wallet transaction calls `ExecutionGateway.execute()`,
which invokes the original `ILNGateway.bridge()` internally and atomically.
ERC-20 approvals, where required, grant allowance to the ADAPTER for this
first transaction. The second hop calls the public XGRChain Gateway directly,
not the paid adapter. A fresh proof unlocks each destination Mailbox.process.

**Price:** Two distinct charges to the user: canonical source validator fee
(to its unchanged FeeVault) and ONE variable source-native GmbH Interchain Fee.
The *global* quote price is
`ceil(estimated gas and onward validator/router costs in source wei * 1.10 * 1.27)`.
The estimate includes (1) first Mailbox delivery gas, (2) XGRChain onward
Gateway gas and its separate native validator/router fee, and (3) the final
Mailbox delivery gas; direct one-hop transfers need only their first delivery.
Each native expense is converted to source coin using CoinGecko USD rates
with a four-minute staleness cap. Integer wei operations round costs UP.
Missing routes, fee quotes, chain gas quotes or prices FAIL CLOSED.
The product is GLOBAL, and a current tax policy or customer country is NOT
part of the EIP-712 signature, price selection or source execution contract.
The 27% price reserve covers the EU's present maximum standard VAT rate,
NOT every foreign jurisdiction. Actual applicable VAT/GST and net revenue
are determined after collection in the GmbH's accounting. No tax-policy
or country change requires a fee-contract redeployment.

**Signature/bindings:** The pricing signer is separate from the immutable
`interchainFeeRecipient`. It signs EIP-712 `SponsoredQuote` binding wallet,
route, recipient, amount, optional final destination/onward route,
`bridgeValueWei`, `interchainFeeWei`, nonce and `issuedAt`. Maximum
lifetime 90 seconds. The browser checks the signed intent against the
deployment manifest, both route domains and quoted source native amount.
The on-chain adapter verifies the signature, nonce, Registry/Gateway binding
and live source bridge quote. Any mismatch reverts before a token transfer
or fee receipt is committed.

**Single aggregate payout:** EACH source-chain adapter holds ONE
`pendingInterchainFeesWei()` accumulator. Its `claimFees()` transfers
the entire accrued native balance to the immutable beneficiary in one
reentrancy-protected operation; there are no per-message claims. The
optional off-chain fee monitor checks source-specific native-wei thresholds
and requires claim proceeds to exceed expected gas cost by at least 3x;
pending sponsor-wallet nonces suppress concurrent duplicate claims.
The identical EVM beneficiary address can collect ETH from Base, POL from
Polygon and XGR from XGRChain. Those chain-local assets remain separate;
opposite-direction user traffic can replenish reserves organically, but
there is no automatic currency conversion.

**Sponsorship:** The GMP fee recipient EVM address can send native gas
support on any configured destination chain. An independent private worker
`services/managed-relay/gas-sponsor.mjs` reads finalized index rows
and *rechecks* the source Gateway, adapter fee and Mailbox statuses against
the source/destination RPC. The worker grants ONLY native gas and the XGR
hop's validator/router fee, never the user's native token principal.
Per-chain native-wei maximum-grant, rolling 24-hour total and minimum
reserves are mandatory; if absent, no grants are offered. The worker
persists a unique `parentMessageId + stage` record and wallet nonce in
`sql/004_sponsor_grants.sql` BEFORE signing. Unknown or reverted
transactions are not blindly rebroadcast. A separate readonly heartbeat
powers the Transfer page's chain-by-chain availability display. An advertised
grant never confers contractual custody or delivery privileges.
`XITA_INTERCHAIN_SPONSOR_ENABLED=false` by default.

**One-to-one multi-hop proof:** TX 3 is a USER-signed call to
`XITAExecutionGateway.continueJourney(parentMessageId, gateway,...)` on
XGRChain, which internally calls the canonical ILNGateway.bridge. The
GmbH collects NO additional Interchain Fee for this hop. The original
parent message ID and emitted child ID appear together in
`OnwardJourneyDispatched`. `onwardParentUsed(wallet,parentId)` is a
permanent on-chain duplicate-prevention mapping; ordinary wallet
nonces independently protect pending transactions. The derived event
indexer validates the original paid source hop, identical user/account,
original amount, signed second-route ID, real child Gateway and Mailbox
events and both independent delivery states, before it reports
`journey-delivered`. A fake/self-chosen parent reference is NEVER
sufficient; it must resolve to a genuine verified source receipt.
Wallet recovery cannot resend TX1 or TX3 after receipt confirmation.

**Admin UI:** ONE optional `XITAExecutionGateway` deployment on EACH
supported EVM chain, no separate token deployments. It requires the
chain-specific verified Source Registry, public immutable pricing
`relayerOwner` and separately entered immutable public
`interchainFeeRecipient`. The existing admin pipeline compiles
pinned constructor artifacts, simulates the MetaMask create transaction,
checks constructor getters and live runtime code hash, and persists
the immutable GitHub transaction receipt and refreshed public catalog.
XGRChain's adapter additionally supports fee-free parent-linked TX3;
on other chains the continuation method reverts. The fee recipient
can be one shared public EVM address across all chains.

**Operator installation AFTER PR merge:** Deploy each desired chain's
optional adapter via /admin, wait for verified GitHub receipt sync,
then run the additive PostgreSQL migrations `sql/003_interchain_journey.sql`
and `sql/004_sponsor_grants.sql` on the indexer DB. Provision restricted
`/etc/xita/quote.env` and `/etc/xita/interchain-fee.env` from the
separate templates; the public quote signer must NEVER hold the GMP
fee/sponsor private key. Then run `./manage.sh install-interchain-fee`
on a CLEAN checked-out GitHub main with the real operator secrets in
those files. This installs the loopback quote signer, two separately
disabled-by-default operator timers (periodically checking accumulated
fees and sponsored gas), and the exact-method Nginx routes.
Existing `./manage.sh update` restarts an installed quote service.
Do NOT enable sponsorship before on-chain four-TX and reverse-direction
E2E proof, sufficient native reserves, successful index migration,
and explicit per-chain limits and secrets verification.

**Merge gate versus activation gate:** This PR may merge after the
entire CI matrix is green with mocked chain integration and Solidity
regression tests, and after an independent source review. Since the
new adapters do not yet exist on mainnet, live E2E must follow deployment
and MUST precede any production sponsored gas grant. A merge alone
must NOT enable grants or send a blockchain transaction. Older locked
XGR is never automatically resent.

## Wallet-funded permissionless delivery UX

The permissionless fallback for each directed hop remains two MetaMask confirmations:
(1) source Gateway.bridge() paying source gas plus native validator fee, and
(2) target Mailbox.process(metadata,message) paying target-native gas after
the BLS proof is available. An ERC-20 approval may be an extra transaction.
Spoke-to-spoke journeys require two hops and therefore four transactions.
Other permissionless executors may deliver a message instead, but there is
no obligation to subsidize another wallet's gas.

The selected transfer UI is `/transfer`, reachable from token detail
with `token` preselected. It displays actual source/destination native and
token balances. It uses precisely one context-aware action button with
source/destination progress below it, not one separate button per MetaMask
confirmation. Gateway quotes and source/destination gas estimates must
be checked immediately before wallet signing. A positive native wallet
balance alone is never an assertion of sufficient gas. ERC-20 approvals
are separate transactions where applicable.

A deployed route needs no additional administrative approval or manually
set `verified` state. The route becomes selectable as soon as the GitHub
receipt manifests establish its components; the transaction itself must
still pass live source Gateway binding, amount/fee, destination gas,
quorum, and Mailbox.process safety checks.

**Only-chain recovery rule:** After wallet connect, an unfinished source
lock/burn is found from confirmed Gateway+Mailbox source events and the
`delivered(messageId)` flag of the destination Mailbox. If source
confirmation exists but delivery has not occurred, clicking `Continue
delivery` reconstructs the ORIGINAL message/quorum/Merkle proof and may
sign ONLY `Mailbox.process` on the destination chain. No second source
lock/burn, Gateway.bridge, or source validator fee is authorized. Browser
storage and transient progress counters can never decide transfer completion.
Unavailable source/destination RPC or missing BLS proof is UNKNOWN, never
proof of failure. The current lightweight wallet scan is bounded; an
older source hash can be provided directly, using the original wallet.

Optional gas grants are independent of the fee adapter and still disabled
until a separate bounded, independently verified sponsor operator is ready.

## Message-specific BLS safety

BLS attests individual cross-chain message delivery, not route inclusion.
The destination ISM must verify the exact source router, destination router,
authorized message ID, Merkle proof and destination validator set.
The off-chain indexer must not advertise an unverified counterparty.

## Non-deployment gates

- Solidity unit tests, fuzz/property tests and end-to-end two-chain tests.
- Real validator-side message checkpoint verification and genuine BLS vectors.
- Full native-XGR and ERC20 lock/mint/burn/unlock in both directions.
- Relayer loss, retries/replay, partial delivery, validator rotations,
  withdrawal recovery and historical source-fee snapshots.
- Token abnormal-behavior rejection and safe display of unverified
  representations in the indexer and UI.
- Immutable Factory/Router bytecode manifest, deployment scripts and
  confirmed on-chain addresses.

**PoS consensus and XGRChain client software are not modified to add
this route identity.** Existing validator checkpoint messages use
Route ID bytes32; the additional safety onboarding flow belongs in
XITA's own interchain infrastructure. No automatic production deploy.

## Registry V3 migration gate

The historical XGRChain Registry V2 receipt stays immutable. The next generation
Registry V3 adds permissionless `provePossession()` for new validator keys and
requires a valid proof before quorum-approved `applyMembership(ADD)`.
Future new ISM/Factory deployments are fail-closed until an independently
verified V3 is documented. This branch does not overwrite the V2 receipt or
automatically migrate the existing 2.25 XGR reserve. No node changes.


### Indexed recovery worklist and statistics

The XITA indexer backfills finalized immutable source Gateway operations,
their original wallets and message IDs, and independently rechecks delivery
through the destination Mailbox. The wallet-indexed read-only endpoint
`/api/xeta/v1/transfers/wallet` supplies the user's open worklist at
Wallet Connect; a header notice appears for outstanding confirmed
lock/burns. `/api/xeta/v1/transfers/stats` supplies separately labeled
per-hop transfer counts and raw asset amounts for eventual statistics.
The indexer's PostgreSQL projection is rebuildable chain-derived evidence,
not custody, governance, approval, or a new chain-state authority.
A fresh on-chain `delivered(messageId)` read and canonical BLS/Merkle
proof validation remain mandatory before any destination MetaMask request.
Incomplete backfill/RPC reads are UNKNOWN rather than an empty worklist.
