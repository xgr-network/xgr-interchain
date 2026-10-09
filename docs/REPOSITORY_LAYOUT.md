# XETA v3.1.4 repository layout

contracts/ and test/: active ILN v3.1.4 contracts, security mixin, unit tests.
script/DeployXETA.s.sol: generic chain infrastructure/Gateway deployments; governance route ADD remains separate.
config/chains/: chain settings, planned Polygon and Arbitrum pending independent validation.
config/assets/XGR/: canonical native XGR, new wXGR on Base/Polygon/Arbitrum, six directed XGR-hub routes.
deployments/mainnet/: observed mainnet Hyperlane cores and explicit NULL values for undeployed XETA security contracts and routes.
runtime/native-relayer/: ILN v3.1.4 relayer, codec, independently constructible recovery calldata. No V1 service scripts.
docs/XETA_SPEC_V314.md and docs/XETA_ONBOARDING.md: binding product policy.

This branch contains the XETA v3.1.4 implementation. Source checkout alone does not deploy contracts or change running services.
Shared guarded native and synthetic Warp routers now compile against Hyperlane 11.1.0. Live source/destination E2E and full custody checks remain mandatory before route activation.

The actual multi-spoke design and bootstrap rules are specified in docs/XETA_ROUTER_ARCHITECTURE.md.
