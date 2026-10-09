# XETA v3.1.4 active Solidity contracts

ILNGateway.sol: source-chain fee-qualified canonical Bridge entry point.
XGRILNFeeVault.sol: source-native validator fee allocation, sparse wei payouts, pull-claims.
XGRILNRegistry.sol: quorum-governed route add/fee/update/enable/disable.
XGRInterchainValidatorRegistryV2.sol: membership, BLS keys, historical snapshots, lightweight fee-recipient getter.
XGRILNInterchainISMV2.sol: route-aware destination BLS verification and exact Message ID authorization.
XGRInterchainBLSVerifier.sol: EIP-2537 BLS verifier, conditional on actual chain compatibility.
XETARouterCore.sol: shared multichain Hyperlane TokenRouter, gateway-only internal dispatch and quorum-bound destination bootstrap.
XETAGuardedNativeWarpRouter.sol: thin native XGR custody adapter on XGRChain.
XETAGuardedSyntheticWarpRouter.sol: thin synthetic token mint/burn adapter for wXGR on external EVM chains.
Pinned Hyperlane 11.1.0 is installed by contract CI. Fork and live E2E validation remain deployment gates.

Only the current XETA v3.1.4 interfaces and implementations belong in this source tree. See docs/XETA_SPEC_V314.md.
