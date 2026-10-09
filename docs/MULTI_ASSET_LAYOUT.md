# XETA v3.1.4 asset and chain layout

config/chains/<chain>.json: chain/domain identity, RPC and verifier format. Chain entries do not imply confirmed deployment.
config/assets/<ASSET>/{asset,routes,mainnet}.json: canonical token identity, representations, desired pairs, governance planning.
deployments/mainnet/infrastructure/<chain>.json: independently observed shared Mailbox/Hook, RegistryV2, ISM and BLS verifier, with null values while pending.
deployments/mainnet/assets/<ASSET>.json: only verified token-specific routes, routers, Gateways, FeeVaults and governance transactions.
contracts/: chain-neutral XETA ILN security and deployment source. script/DeployXETA.s.sol: current generic deployment script.

Example: XGR is native on XGRChain (1643) and new synthetic wXGR on Base, Polygon and Arbitrum. Six directed one-hop spokes are planned; each has separate source-native fee. Two-hop external-to-external UX always crosses XGRChain and needs a future sponsor/forwarder before it can be XGR-wallet-free. This repository does not claim deployment of that sponsor.

## Onboarding
Use GitHub PR or a web form that creates the same manifest proposal and manual review. Project onboarding is free. A merge never activates a route without validator quorum. No inactive route is disabled; default UI and featured lists may be reordered without compromising direct redemption access. See docs/XETA_ONBOARDING.md.

## Validation
Run node tools/validate-manifests.mjs and node --test tools/validate-manifests.test.mjs before promotion. Full Forge, JS and on-chain E2E are separate requirements. No unverified address is ever populated simply to satisfy static checks.
