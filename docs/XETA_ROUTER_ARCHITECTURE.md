# XETA shared router topology

One common XETARouterCore contract contains the entire outbound authorization,
per-domain route binding, one-time remote enrollment and Hyperlane dispatch.
Two thin asset adapters exist only because native collateral and synthetic
ERC-20 mint/burn use different Solidity transfer operations.

## Deployment cardinality

- XGRChain: **one** native-XGR router for Base, Polygon and Arbitrum.
- Base/Polygon/Arbitrum: **one** wXGR synthetic router per chain.
- Each directed source route: **one** route-specific ILNGateway and FeeVault.
- All routes on a physical chain share the canonical ILNRegistry, validator
  RegistryV2, destination ISM and BLS verifier, where compatible.
- An external spoke must bridge through XGRChain (domain 1643); the common
  router enforces this. Direct Base <-> Polygon is forbidden.

## Permissionless route registration and bootstrap (v3.1.5)

Deploy the shared per-chain security infrastructure and routers first. Any
caller may register a directed hub route using the public Factory. It creates
and binds the source Gateway/FeeVault and immutable router references
atomically; no route-add quorum, separate enable vote or administrator key
exists. The identity includes assetId, domains and both router addresses.
The destination BLS ISM authenticates exact message/checkpoint delivery.

GitHub deployment records follow only from verified on-chain receipts and
live safety checks. Removing a directory listing cannot disable any route.
A route may not be offered as live in the frontend without verified remote
counterpart, supply-binding and real transfer tests.

## Security boundaries

Pinned upstream Hyperlane core 11.1.0. TokenRouter.transferRemote delegates
to the guarded internal _transferRemote path. Both adapters MUST delegate
to XETARouterCore._transferRemote. Inbound handle is unchanged upstream code.

No xgr-node change. No company-owned control key. Never activate a route
before fork and genuine chain E2E proof. XETA token representations must use newly verified contracts and independent supply accounting.

Future sponsored XGR hub-hop remains a separate application addition and
is NOT part of this change.
