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

## Governance and bootstrap

Deploy shared infrastructure and the physical-chain asset router first.
Deploy the source route Gateway pointing to the already-deployed shared router.
Obtain current validator quorum and apply ROUTE_ADD on the source ILNRegistry.
Any caller may then bootstrapXETARoute(destinationDomain, routeId).

Bootstrap validates the registry's route, current enabled state, source
chain/domain, router identity, Mailbox and Hook, native fee and all four immutable
bindings reported by the deployed ILNGateway. The remote destination address
is enrolled only once and cannot be mutated by an owner (none is retained).

Source-domain route disable blocks new outbound transfers. Successful
incoming transfers still use Hyperlane Mailbox-only handle() with enrolled
remote router checks. Normal validator fees remain mandatory and positive.

## Security boundaries

Pinned upstream Hyperlane core 11.1.0. TokenRouter.transferRemote delegates
to the guarded internal _transferRemote path. Both adapters MUST delegate
to XETARouterCore._transferRemote. Inbound handle is unchanged upstream code.

No xgr-node change. No company-owned control key. Never activate a route
before fork and genuine chain E2E proof. XETA token representations must use newly verified contracts and independent supply accounting.

Future sponsored XGR hub-hop remains a separate application addition and
is NOT part of this change.
