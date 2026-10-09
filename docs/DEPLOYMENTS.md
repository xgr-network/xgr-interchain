# XETA v3.1.4 — verified deployment state
The desired topology is XGRChain (1643) <-> Base (8453), Polygon (137), Arbitrum One (42161). Each route requires a source ILNRegistry, source Gateway and FeeVault, version-pinned Gateway-only Warp Router, destination ValidatorRegistryV2, route-aware ISM, and source quorum governance approval.

## Status
All new v3.1.4 gateway, router, vault and governance fields remain NULL in deployments/mainnet/ until independently verified on-chain. No XETA route is marked active by this repository. Known Hyperlane Mailbox and MerkleTreeHook addresses are infrastructure observations only; XETA routers and security contracts need separate verified deployments. Polygon and Arbitrum network endpoint configurations are provisional until tested.

## Launch gate
1. Deploy real upstream-compatible Gateway-only routers; direct transferRemote() must revert, while Gateway calls and Mailbox inbound calls succeed.
2. Test XGR/wXGR lock/mint and burn/unlock on each spoke.
3. Prove XGR native BLS and each external destination EIP-2537 on real chains.
4. Verify native quote, separate source validator fees, historical claims, destination confirmations, exact source receipt and Merkle inclusion.
5. Run permissionless delivery and replay/rotation recovery tests with identical messageId.
6. Record actual deployed addresses, transaction hashes and source registry governance proofs before changing any route from pending-governance to active.
7. Confirm frozen xgr-node v3.1.4 API compatibility without node changes.

Mainnet inventories: deployments/mainnet/infrastructure/*.json and deployments/mainnet/assets/XGR.json.
