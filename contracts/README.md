# XITA Direct-BLS Solidity contracts

There is one public, permissionless route-registration architecture.

- `XETATokenFactoryV315.sol`: public per-chain Factory and two-step deployment
  of the source and destination Router pair. Creates a Gateway and an
  immutable enabled Registry record for every directed route.
- `XGRILNRegistryV315.sol`: append-only source-chain route registry with shared source-native fee
  governance through validator quorum. Registration is immediately recorded;
  there is no separate BLS route-admission vote. No route-specific governance or route deletion.
- `XGRILNProtocol.sol`: deterministic original Asset ID, ONE directed
  Router-pair Route ID format, source fee and deterministic route identity.
- `XETARouterCore.sol`: gateway-only transfer dispatch, immutable route
  enrollment, Hyperlane inbound message handling.
- `XETAGuardedNativeWarpRouter.sol`: native XGR collateral adapter.
- `XETAGuardedCollateralWarpRouterV315.sol`: independent ERC20 collateral
  escrow with received-amount checks.
- `XETAGuardedSyntheticWarpRouter.sol`: zero-supply synthetic mint/burn adapter.
- `ILNGateway.sol` and `XGRILNFeeVault.sol`: per-directed-route gateway,
  native fee collection and validator pull-based settlement.
- `XGRInterchainValidatorRegistryV3.sol` and `XITADirectBLSISM.sol`:
  validator BLS membership and direct per-message BLS transfer security.
  The registry V3 family and Direct-BLS ISM are independent of the node release
  version; the V2 validator-set interface names identify shared ABI types.

**Hard rule:** every directed route includes XGRChain at exactly one
endpoint, with BOTH chainId and domain equal to 1643. A spoke-to-spoke
transfer uses two separate transfers through XGRChain.

Use the current architecture and operations references below. Verify actual
remote-pair bindings and two-chain end-to-end behavior before enabling a deployment.

## Optional operator service (no protocol authority)

`XITAExecutionGateway.sol` is a chain-wide source adapter (one per chain),
with service-wallet-signed EIP-712 quotes (single signed `issuedAt`, configurable
on-chain validity 1–90 seconds; never a separately signed deadline) and
exact SOURCE-native relayer fee receipts.
It calls unchanged ILNGateway.bridge and does not grant the GmbH owner any
mint, validator, registration, source FeeVault or Mailbox authority.
Anyone can call `claimFees()`, but accrued commercial service fees are paid
exclusively to the current `serviceWallet`, even before completion: this is an explicitly operator-trusted commercial service, not
a refundable on-chain gas bond or an execution guarantee. Other relayers
can provide their own frontend, relayer, quote service and indexer.
No deployment is implied by adding the Solidity source.


## Current protocol baseline

For node v3.4.0, use the [current Direct-BLS architecture](https://github.com/xgr-network/xgr-interchain/blob/main/docs/architecture.md) and [independent execution runbook](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md). Route registration and authenticated destination delivery are permissionless. The XITA website, commercial gateway, sponsor and managed relayer are optional; validator authorization, chain access, gas and source protocol fees remain necessary. Contract/interface version suffixes are independent of node release versions.

## System context and individual contract roles

See the [system and contract interaction diagrams](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Context_and_Contracts.md) for all production contracts, libraries and interfaces, their callers and authority, deployment dependencies, principal/fee flows and the two-hop lifecycle. The [contract reference](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Contract_Reference.md) explains method behavior; the [declared API](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Contract_API.md) inventories signatures.
