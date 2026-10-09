# XITA / XGR Interchain v3.1.5 — permissionless, multi-instance routes

**DEVELOPMENT PROTOTYPE. DO NOT DEPLOY.**
Legacy v3.1.1–v3.1.4 contracts and rescue/recovery paths are untouched.
The Foundry tests are not a substitute for genuine two-chain custody,
metadata, validator/BLS and relayer-outage verification.

## Non-negotiable invariants

1. XGRChain domain 1643 is an endpoint of every **directed** route. Spoke-to-spoke transfers use two distinct source-chain hops.
2. Asset identity remains canonical: `assetId = keccak256(abi.encode(keccak256("XITA_ASSET_V315"), uint64(originChainId), address(originalToken), uint8(kind)))`. Native origin is token 0/kind 0, ERC20 origin has a nonzero token/kind 1.
3. The *previous exclusive singleton constraint is relaxed for OPEN routes*. Every deployed open route has a distinct **independently secured router, fee vault and escrow**. No first caller can reserve an asset/chain pair globally. Separate public token listings do not imply a canonical/verified representation.
4. Canonical XGR/wXGR bootstrap remains the narrow, constructor-pinned legacy-compatible profile: `routeIdV315 = keccak256(abi.encode(keccak256("XITA_ROUTE_V315"), assetId, sourceChainId, sourceDomain, destinationChainId, destinationDomain))`. It is not the general multi-chain onboarding mechanism.
5. Open route ID includes its router pair: `routeInstanceIdV315 = keccak256(abi.encode(keccak256("XITA_ROUTE_INSTANCE_V315"), assetId, sourceChainId, sourceDomain, destinationChainId, destinationDomain, sourceRouter, destinationRouter))`. Different routers can serve the same asset and domains; reverse routes have a separate ID.
6. Each LOCAL route's Registry/Gateway/Mailbox/Hook/token/router binding is immutable after its append-only insertion. The local source fee is one positive source-native fee shared by all routes; validator quorum may update only that fee.
7. No route-add/enable/disable governance proposal and no privileged route registrar. The factory itself is publicly callable and fixed-code. Route activation is a **technical security gate**: BLS proof of reciprocal chain facts, *not discretionary route approval*. Validator sets remain responsible for transfer safety.
8. The current UI/indexer must never display an unproven route as active or verified; route names and metadata supplied by remote callers are assertions, not origin-chain evidence.
9. Registered routes never disappear. If a route ceases to be operational, existing collateral/claims MUST retain a recovery path. Do not casually introduce a kill-switch or replace on-chain legacy addresses.

## First registration: no first-caller monopoly

An arbitrary third party cannot reserve an official ERC20 or XGR representation.
There is no single claimable slot for an ERC20 asset and remote chain:
anyone can deploy a second independent route with a different router pair.
Likewise the new open XGR profile does not mutate the existing canonical
native-XGR/wXGR representation.

**Do not conflate permissionless source creation with remote authenticity.**
A Solidity contract cannot read an arbitrary remote chain's code and storage.
An open route is therefore always initially **PREPARED, NOT ACTIVE**.
It cannot dispatch assets, mint or unlock until a cryptographic, fact-based
counterpart-attestation passes. First-caller metadata has no authority.

The optional one-step `createERC20CollateralRoute`,
`createERC20SyntheticRoute`, `createOpenNativeXGRRoute` and
`createOpenWrappedXGRRoute` are for already known remote router addresses.
For a *new pair of networks*, use the preferred **two-phase bootstrap**:

1. On chain A and chain B, deploy the correct new, unbound routers using the public `deployOpenCollateralRouter`, `deployOpenSyntheticRouter`, `deployOpenNativeXGRRouter` or `deployOpenWrappedXGRRouter` functions. Peer addresses are not constructor inputs. Synthetic supply starts at zero.
2. Obtain the actual addresses and check factory, codehash, underlying origin token, canonical asset ID, Mailbox/ISM and metadata. Both participants must bind their own freshly created routers, not a global asset singleton.
3. On each chain, call `prepareExistingOpenRouterRoute(localRouter, remoteChainId, remoteDomain, remoteRouter, remoteToken)`. The creator controls pairing of **their own** new local router only. This is not a company/validator permission. One router can bind one route per remote domain; other users can create independent routers freely.
4. Each registry records immutable pair binding, creates a gateway and pull-based fee vault, and emits **RoutePrepared**. `getRoute(...).enabled` is **false**; unverified routes do not emit the legacy `RouteAdded` scanner event.
5. The active validator set independently checks *both* confirmed chain states: reciprocal route IDs, deployed contract bytecode hashes, source ERC20 origin metadata, real custody adapter, source/destination tokens, route bindings, FeeVault and ISM/Mailbox configuration. Only a matching objective safety payload may be signed. This is a transfer-safety obligation, not a vote on whether a project may join.
6. Anyone submits the BLS aggregate and calls `confirmAndBootstrapOpenRoute`. The Registry checks domain-separated proof, current validator set, expiry, local source-router codehash, and expected reverse route ID. Confirmation, `RouteAdded` and Router bootstrap are atomic. Replay/change of pair cannot retarget an escrow.
7. Only after both directed routes are confirmed can the UI enable live bridging. A relayer outage must not change ownership of collateral or permanently prevent recovery.

**First registrations that fail the evidence gate remain inert**. They cannot
block other users from registering a fresh independent instance.

## Attestation wire format (21 ABI words)

`abi.encode(keccak256("XITA_ROUTE_SAFETY_V315"), sourceChainId, sourceDomain, sourceRegistry, routeId, assetId, destinationChainId, destinationDomain, sourceToken, destinationToken, sourceRouter, destinationRouter, gateway, reverseRouteId, remoteRegistry, remoteFactory, remoteGateway, localRouterCodeHash, remoteRouterCodeHash, setId, validUntil)`.

All values are padded to 32-byte ABI words (total **672 bytes**).
`validUntil` is a Unix time and the validator set must be current.
Source-side code verifies the LOCAL fields against immutable storage and
BLS quorum; validator signers must inspect REMOTE facts independently and
refuse mismatches. A returned remote `codehash` alone is not proof of remote
deployment, which is why the attestation is essential.

The Go codec implementation lives separately in xgr-node PR #33.
**There is not yet a running signer/RPC workflow that produces real route
safety aggregates, and no multi-chain live proof verification has passed.**

## Source-fee governance (unchanged)

`XITA_SOURCE_FEE_V315 || bytes8(chainId) || bytes4(domain) || bytes20(registry) || bytes8(setId) || bytes8(nonce) || bytes8(validUntil) || bytes32(validatorFeeWei)`.

One source-native validator fee per chain; fresh monotonic nonce and current
source set. FeeVault distributes earned fees into validator pull balances
and preserves accrued claims across validator exit. Historical fee lookups
must read source registry at the original message block and receipt.

## Production gates — NOT YET CLEARED

- Foundry compiler and unit tests on this draft branch.
- Consistent Solidity/Go hashes and raw BLS safety payloads with real vectors; automated signer/RPC evidence verification and validator policy for objective remote readiness.
- True Base ↔ XGR E2E ERC20 lock/mint/burn/unlock and XGR native XGR ↔ wrapped routes (including two-step spoke transit), fee receipts and historical snapshots.
- Validator changes mid-flight, relayer outage/replay/refunds/recovery, ERC20 abnormal behavior (fee-on-transfer, rebasing, callback tokens) and dust/rounding tests. Unsupported token behaviors must fail closed.
- Explicit authenticated token metadata and UI discovery/listing; unverified clone tokens must never be presented as official XGR/wXGR or original assets.
- Deployment scripts for the new two-phase process and immutable counterpart configuration; exact bytecode verification and contract address manifests.
- Preserve legacy collateral, old route receipts and claim paths; no automatic upgrade or replacement.

**Until these gates close, neither this PR nor the Go codec PR authorizes a mainnet deployment or replaces any legacy contract.**
