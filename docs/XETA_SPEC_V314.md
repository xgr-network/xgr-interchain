# XETA Interchain v3.1.4 — accepted specification
Date 2026-10-09. Normative for new routes, not an on-chain activation.

## Core invariants
- XGRChain 1643 remains the MANDATORY hub. External chain A to B is two independent bridge operations via XGRChain; no direct external A to B public routes.
- Freeze xgr-node v3.1.4. Never modify native consensus or the current BLS attestation wire protocol for XETA onboarding.
- Deploy independent XETA router and token instances, fresh custody and new source-governed routes. Wrapped token supply starts at zero and grows exclusively through authorized XETA deliveries.
- New outbound Warp routers enforce gateway-only transferRemote; check the route canonical registry, source chain, gateway, router, and destination. A standalone guard mixin is NOT a complete Hyperlane router. Integrate against a pinned upstream implementation, preserving existing Mailbox-inbound handling; test live E2E before activation.
- Each route remains under local current-validator two-thirds BLS quorum governance, nonce and expiry. No company-admin authority.
- Route-specific strictly positive source-native ILN validator fees remain; may be materially greater than 1 wei. Gateway atomically allocates once to all active source-side validators; pull claims work after exit, no relayer-selected recipients.
- Token onboarding is fully FREE for projects via GitHub PR or a web form generating the same manifest proposal. No unilateral on-chain activation by UI, web form or merge. Verify source contract behavior and signatory authorization.
- Optional promotional fee refunds belong to an OFFCHAIN backend and UI after verified successful route operation: dedupe by route/message/payer and cap sponsor budgets. Users continue to pay network gas normally.
- Future sponsored XGR hub forwarder may fund XGR gas and second-hop ILN fees without the end user holding XGR, but is NOT part of current release. Do not claim XGR-free two-hop transfers before forwarder implementation.
- Inactivity NEVER disables an on-chain route. Remove inactive projects from top lists or default UI only; preserve direct redemption and bridge access. Safety pauses require approved governance and a recoverable asset path.

## Gas and security
- Gateway bridge removes redundant pre-dispatch validator-set reads, while atomic FeeVault.allocate checks them and reverts original lock/burn if invalid.
- FeeVault requires the address-only RegistryV2 `getFeeRecipients()` getter and fails closed without it; distribute micro-fees with only nonzero storage writes. Rotating remainder remains unchanged.
- No direct Warp invocation for new assets. Validate full upstream router compatibility, fee-on-transfer/rebasing token exclusion, supply conservation, Merkle source receipts, actual EIP-2537 on each supported mainnet, recovery after validators rotate, and one-time FeeVault payouts.
- Benchmark gas with 3, 5, 10, 25 validators and real two-hop receipts; do not infer total transaction costs from Forge test-function gas.
- Shared chain infrastructure is independent of assets; token onboarding only adds asset manifests, routers, gateways, fees, and governance decisions.
- Manifests and source code are not proof of deployment or route activation. Publish routes only after verified deployment and validator-quorum authorization.
