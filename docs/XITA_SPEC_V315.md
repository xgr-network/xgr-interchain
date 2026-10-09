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
  `XETATokenFactoryV315.prepareRoute` must enforce these constraints.

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
- **State**: initially PREPARED (enabled=false); only a verified BLS
  counterpart safety attestation may activate it (enabled=true).
- **Fee**: read dynamically from the source Registry's SINGLE
  `validatorFeeWei`; it is NOT individually configured for each route.

Every new Gateway also creates its own fee accounting vault. Validators
receive credits and claim their earnings (no automatic micro-payouts).

A factory-issued Collateral Router holds its OWN token collateral.
A Synthetic Router starts at zero supply, mints only on authenticated
inbound delivery, and burns on authenticated outbound dispatch.
A native-XGR Router holds the native XGR escrow for its own route.
Independent routes never share authority to withdraw each other's funds.

## Open, two-step route creation

1. Deploy XITA's fixed-code Factory and its registry once per chain.
   Deploy local Router A and local Router B independently via their public
   respective Factories. Only the creator controls the initial binding of
   that individual Router; anyone can create another independent Router.
2. Learn and verify both deployed addresses. On EACH direction's source
   chain call `prepareRoute(localRouter, remoteChainId, remoteDomain,
   remoteRouter, remoteToken)`. The Factory checks the XGRChain-only
   topology and writes the immutable pending route with its new Gateway.
3. Registration itself requires no validator vote. The route is still
   **inert**: Gateway quotes/bridging and Router dispatch must reject it.
4. Independent safety verification checks finalized counterparty
   chain facts: reciprocal route record, authenticated original token
   and metadata, Router codehashes, Gateway/Factory provenance, Mailbox,
   ISM, collateral semantics and intended bidirectional pair.
5. The validator BLS aggregate certifies those objective transfer-safety
   facts, NOT project membership. Anyone may submit the signed proof to
   `activateRoute`. Activation and Router bootstrap must be atomic.
6. Only after BOTH directions are independently active may the frontend
   offer a bidirectional bridge. A relayer is replaceable; failure of a
   relayer must not grant authority over assets.

An unproven first registration can never block another independent route.
No party gains an "official" token identity by registering first.

## Source-chain validator fee

Exactly one native-currency fee is set for each source registry, requiring
the active validator quorum:
`XITA_SOURCE_FEE_V315 || bytes8(chainId) || bytes4(domain) || bytes20(registry) || bytes8(setId) || bytes8(nonce) || bytes8(validUntil) || bytes32(validatorFeeWei)`.

There is no per-route fee vote. The source fee nonce is monotonic, the BLS
setId must match the current set and the signed proposal has an expiry.
Historical receipts must be interpreted using the fee at the original
source block, not today's current value.

## Objective BLS route safety proof

The signed payload is `abi.encode` of exactly 21 ABI words (672 bytes):

`keccak256("XITA_ROUTE_SAFETY_V315"), sourceChainId, sourceDomain, sourceRegistry, routeId, assetId, destinationChainId, destinationDomain, sourceToken, destinationToken, sourceRouter, destinationRouter, gateway, reverseRouteId, remoteRegistry, remoteFactory, remoteGateway, localRouterCodeHash, remoteRouterCodeHash, setId, validUntil`.

Source Solidity checks immutable LOCAL route facts, local codehash,
reverse ID, current set and expiry; the signing participants must first
verify authentic REMOTE facts on a finalized chain state. A caller's remote
address, codehash or symbol is not itself remote proof. Nonce/replay and
metadata/collateral semantics must remain fail-closed.

## Non-deployment gates

- Solidity unit tests, fuzz/property tests and end-to-end two-chain tests.
- Real validator-side fact checking, genuine BLS vectors, signing and
  submission of the exact remote-pair safety payload.
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
