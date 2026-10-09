# XGR Interchain — ILN v3.1.4
This standalone repository contains XGR Interchain ILN v3.1.4, an open, quorum-governed token-transfer protocol. **The new XETA/XITA routes are not deployed merely because this source repository exists.**

XGRChain (chain ID/domain 1643) is the central hub. Base, Polygon and Arbitrum are configured as planned spokes. Transfers between two external networks always route through XGRChain in two independent steps.

## Contracts and deployment
- `contracts/XETARouterCore.sol` is the shared, gateway-only, multi-spoke Hyperlane 11.1.0 TokenRouter.
- `contracts/XETAGuardedNativeWarpRouter.sol` handles native XGR custody on the hub.
- `contracts/XETAGuardedSyntheticWarpRouter.sol` handles synthetic wXGR mint/burn on spoke chains.
- One router instance per asset per chain. Each directed route has its own ILNGateway and automatically created FeeVault. Governance remains with the current validator quorum.
- `XGRILNInterchainISMV2`, `XGRILNProtocol` and `XGRInterchainValidatorRegistryV2` are the current V2 cryptographic and wire interfaces.
- `script/DeployXETA.s.sol` and `script/DeployXETARouters.s.sol` provide deployment helpers; neither can approve routes.

## Token and chain manifests
`config/chains/` lists supported/planned networks. `config/assets/XGR/{asset,routes,mainnet,metadata}.json` defines native XGR, planned wXGR representations and six directed hub-only routes. `deployments/mainnet/` contains verified observations; null values must remain null until deployment and governance are confirmed.

## XETA web platform
The standalone token-first web UI lives in `apps/web`; the infrastructure, runtime and UI are maintained together in this repository. `XGR_Web` remains the main XGR.Network website. Overview, Markets, /join and /token/:id form the token-first standalone frontend in `apps/web`. **The token page itself contains the Bridge experience; there is no separate /bridge product.** The public hostname and branding will be finalized separately. No new route is enabled until on-chain verification and quorum approval. See `docs/XETA_UI_ARCHITECTURE.md`.

## Economic guarantees
Alliance applications and standard integration are free. Token and route approval requires quorum. Source-native validator fees remain positive; offchain promotional refunds are optional. Future XGRChain hop sponsorship is not yet deployed. Inactive routes must remain accessible for redeem and recovery.

## Validate
```sh
forge build && forge test -vvv
node tools/validate-manifests.mjs
node --test tools/validate-manifests.test.mjs
node tools/check-xeta-clean.mjs
bash -n runtime/manage-relayers.sh
cd runtime/native-relayer && npm test
```

## Production boundary
Deploy XETA router, gateway, token and security components as new, separately verified instances; initial synthetic token supply is zero. Do not deploy or advertise new routes until real cross-chain custody, validator signatures, ISM/EIP-2537 compatibility and relayer-outage recovery pass.

## Operator console

`services/admin` contains the protected, loopback-only, read-only deployment planning UI. It does **not** execute transactions or governance. The independent XETA indexer under `services/indexer` is currently a scaffold, not a running transfer indexer. The existing XGR Explorer remains untouched.
