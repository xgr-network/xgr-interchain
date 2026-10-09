# XETA operations — v3.1.4 only

## Readiness
Validate manifests, Forge tests and JS relayer tests; verify actual on-chain environment rather than relying on planned JSON values. Route ADD immediately enables authorization and therefore must be executed last, after security modules, routers, fee quotes, BLS compatibility and source/destination test calls are ready.

## New route activation
1. Register fresh origin/destination infrastructure and audited token representations.
2. Deploy source Gateway and its FeeVault; deploy gateway-only upstream Warp router (or precompute and carefully bind address dependencies).
3. Verify quoteILN and exact native/ERC20 adapter behavior, current set and nonzero source fee.
4. Configure destination ISM and validated destination router and mailbox.
5. Obtain current quorum through xgrchain governance CLI; execute source ROUTE_ADD.
6. Test both directions with tiny real token amounts; confirm fee-vault claims, merkle proof, delivery and recovery.
7. Update on-chain observed inventory and only then publish route as available.

## Runtime
runtime/manage-relayers.sh starts only ILN relayer processes. Keep RELAYER_SUBMIT=false until approved and tested. Runtime env examples use NEW_XETA placeholders; never substitute old bridge token/router addresses. Service deployment and domain routing are managed separately from this XETA source branch.

## Visibility
Inactive routes remain on-chain active; UI can demote them but must retain an accessible direct bridge/redeem path. Emergency governance disable only for substantiated security reasons and with recoverability.
