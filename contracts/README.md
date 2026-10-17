# XITA v3.1.5 Solidity contracts

There is one public, permissionless route-registration architecture.

- `XETATokenFactoryV315.sol`: public per-chain Factory and two-step deployment
  of the source and destination Router pair. Creates a Gateway and an
  immutable pending Registry record for every directed route.
- `XGRILNRegistryV315.sol`: source-chain route registry, inactive-until-proven
  state, factual remote counterpart BLS attestation, shared source-native fee
  with validator quorum. No route-specific governance or route deletion.
- `XGRILNProtocol.sol`: deterministic original Asset ID, ONE directed
  Router-pair Route ID format, source fee and signed checkpoint payload.
- `XETARouterCore.sol`: gateway-only transfer dispatch, immutable route
  enrollment, Hyperlane inbound message handling.
- `XETAGuardedNativeWarpRouter.sol`: native XGR collateral adapter.
- `XETAGuardedCollateralWarpRouterV315.sol`: independent ERC20 collateral
  escrow with received-amount checks.
- `XETAGuardedSyntheticWarpRouter.sol`: zero-supply synthetic mint/burn adapter.
- `ILNGateway.sol` and `XGRILNFeeVault.sol`: per-directed-route gateway,
  native fee collection and validator pull-based settlement.
- `XGRInterchainValidatorRegistryV2.sol` and `XGRILNInterchainISMV2.sol`:
  validator BLS membership and authenticated checkpoint transfer security.
  Their V2 suffix identifies the cryptographic wire format, not an old route
  registry or an alternative application protocol.

**Hard rule:** every directed route includes XGRChain at exactly one
endpoint, with BOTH chainId and domain equal to 1643. A spoke-to-spoke
transfer uses two separate transfers through XGRChain.

See `docs/XITA_SPEC_V315.md`. Not ready for mainnet without genuine
remote-pair validation and two-chain end-to-end tests.

## Optional operator service (no protocol authority)

`XITAExecutionGateway.sol` is a chain-wide source adapter (one per chain),
with owner-signed EIP-712 quotes (single signed `issuedAt`, configurable
on-chain validity 1–90 seconds; never a separately signed deadline) and
exact SOURCE-native relayer fee receipts.
It calls unchanged ILNGateway.bridge and does not grant the GmbH owner any
mint, validator, registration, source FeeVault or Mailbox authority.
The GmbH owner can withdraw its own delivery service fees even before
completion: this is an explicitly operator-trusted commercial service, not
a refundable on-chain gas bond or an execution guarantee. Other relayers
can provide their own frontend, relayer, quote service and indexer.
No deployment is implied by adding the Solidity source.
