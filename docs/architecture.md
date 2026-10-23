# XGR Interchain / XITA — current architecture

**Code baseline:** xgr-interchain `main`, Solidity V3.1.5 protocol-family contracts; **validator node:** [xgr-node v3.2.3](https://github.com/xgr-network/xgr-node/releases/tag/v3.2.3). This supersedes the former XETA v3.1.4 route-quorum design. Do not use retired route-activation governance procedures.

## System boundaries

XGRChain (1643) is a mandatory hub. Base (8453) and Arbitrum (42161) are independently configured spokes. A transfer between spokes is exactly two authenticated hop operations, each authorized and signed by a user wallet. No relayer or operator obtains user-wallet signing authority.

**On-chain source:** source-specific `XGRILNRegistryV315`, permissionless Factory, route `ILNGateway`, immutable fee vault, guarded asset Warp Router, canonical Mailbox and MerkleTreeHook. ILNGateway atomic execution binds actual route, source router, destination and validator fee; router escrows original collateral or burns synthetic.

**Off-chain security:** XGR PoS validator subset signs only confirmed, independently verified source operations; xgr-node worker reads canonical ILN and Hook state, source FeeVault allocation and current destination validator set, reconstructs ordered Merkle leaves, exchanges bounded P2P chunks and aggregates threshold BLS signatures. This is separate from IBFT block consensus. The source route registration itself is permissionless; fee governance uses 2/3 validator BLS approval **per source chain**, not per route.

**On-chain destination:** destination Mailbox forwards the original serialized message to route-bound ISM. The ISM checks exact message inclusion in source Hook tree, route identity, checkpoint/root, BLS signer bitmap and current destination set, then destination router mints synthetic or unlocks collateral. Message ID replay protection stops duplicate delivery. Any user or independent executor may pay destination gas for `Mailbox.process`.

**Optional commercial layer:** `XITAExecutionGateway` may collect a separately quoted service fee and record journey linkage; quote worker, native gas sponsor, managed relayer and public transfer index are optional services. None are required for protocol-validated transfer. Gas-sponsor grants are native transfers to user wallets; they do not authorize customer token transfers.

## Asset accounting

Original native XGR: native lock on XGRChain, synthetic wXGR on spokes. Original ERC-20 ARB: ERC-20 collateral lock on Arbitrum, synthetic wARB on hub/spoke. Synthesized ERC-20s burn on their sending chain and mint only after destination ISM validates. In two-hop routing, hub synthetic supply may be momentary and is not extra independent collateral.

Each original asset/router/chain has distinct verified addresses, route registrations and deployment receipts. `config/assets` is *configuration*; only validated on-chain deployments under `deployments/chains` and `deployments/assets` establish availability. Token symbol, Coingecko listing and website catalog do not establish on-chain authenticity.

## Registry lifecycle

Factory registers directed routes permissionlessly after shared chain infrastructure and asset routers are available. The node discovers `RouteAdded` on **existing configured chains** and independently verifies registry snapshots. A new *physical chain* needs configuration and a controlled node restart under v3.2.3; it is not hot-reloaded.

## Recovery and security

Source receipt verifies Dispatch and original route/fee. MerkleTreeHook root/count anchor all leaves. v3.2.3 can cold-join from a verified complete peer, or append within 128 recent confirmed blocks. Missing full prefix in all peers requires operator-verified historical Hook reconstruction or backup. Node `xgr_getILNQuorum` may show `AVAILABLE_UNVERIFIED` before destination state checks; recovery must confirm current set, `Mailbox.process.staticCall` and `delivered(messageId)` on chain. Never repeat original source lock/burn for a pending delivery.

Full public reference: [XGR Interchain v3.2.3](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.2.3_Reference.md). Detailed validator CLI, env and RPC: [xgr-node operator guide](https://github.com/xgr-network/xgr-node/blob/XGR3.0/docs/ILN_V323_OPERATOR_REFERENCE.md). Unmanaged direct transfer: [independent delivery guide](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.2.3_Operations.md).
