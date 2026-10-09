# XITA / XGR Interchain v3.1.5 — protocol decisions and deployment gates

**DEVELOPMENT PROTOTYPE — NOT PRODUCTION READY.**

## Protocol invariants

1. XGRChain (chain/domain 1643) is mandatory as one endpoint; direct spoke-to-spoke is invalid.
2. One canonical asset is identified by origin chain and native/ERC20 token identity; one XITA representation per asset and physical chain. Standard XITA factory routers alone implement synthetic mint/burn.
3. One directed route per (assetID, sourceChainID, sourceDomain, destinationChainID, destinationDomain). Reverse direction has its own ID.
4. AssetID = keccak256(abi.encode(keccak256('XITA_ASSET_V315'), uint64(originChain), tokenAddress, uint8(kind))). Native kind 0 has token address zero; ERC20 kind 1 has nonzero address.
5. RouteID = keccak256(abi.encode(keccak256('XITA_ROUTE_V315'), assetID, uint64(sourceChainID), uint32(sourceDomain), uint64(destinationChainID), uint32(destinationDomain))).
6. Gateway, both routers, token addresses, Mailbox and Hook are immutable route record attributes, NOT RouteID inputs. This avoids deployment circular dependencies.
7. The authenticated destination Router address remains mandatory in route data: Hyperlane delivery needs it even though it does not participate in the RouteID hash.
8. Append-only, permissionless onboarding. No route enable/disable/delete, no routemaking quorum, no global route administrator.
9. Validator quorum decides **one fee per source chain**, denominated in source-native smallest units and shared by every token route. No per-route fee changes or fee-derived route IDs.
10. Transfer and validator membership BLS quorums remain unchanged. Verified listing on GitHub and xita.xgr.network is a separate opt-in trust/discovery process.

## Fee governance wire format

XITA_SOURCE_FEE_V315 || bytes8(sourceChainId) || bytes4(sourceDomain) || bytes20(registry) || bytes8(setId) || bytes8(nonce) || bytes8(validUntil) || bytes32(feeWei).

Use the active source-chain validator set, its existing BLS verifier, fresh per-chain nonce, and expiry. Historical fee verification by source block and message receipt MUST remain valid.

## Mainnet deployment blockers

- FIRST CLAIM: a permissionless caller must never be able to reserve the only official route by submitting an arbitrary destination router. Factory-only calling is insufficient without objective counterpart authentication. A deterministic or cryptographically proven destination Factory/Router binding is mandatory before exposing public route registration.
- THIRD-PARTY ASSETS: first-caller-supplied token decimals/name/symbol on a remote chain must not permanently capture a canonical asset identity. General ERC20 collateral adapter and origin metadata authentication are not yet implemented. Current safe factory bootstrap handles canonical XGR only.
- FEES: initial values remain undecided by design. Zero (unset) prevents routing until the validator quorum initializes a positive source fee.
- END TO END: both directions, lock/mint/burn/unlock, fee changes, historical snapshots, recovery and chain joins require integration testing.
- LEGACY RECOVERY: do not discard v3.1.1/3.1.4 recovery capabilities or stranding collateral during migration.

## Development patch inventory

- xgrchain PoS_3: consensus/ibft/interchain/iln_v315.go, interchain/evm/source_fee_v315.go, interchain/runtime/source_fee_v315.go and ibft interchain source-fee create/approve.
- xgr-interchain main: XGRILNProtocol hash helpers, XGRILNRegistryV315.sol, XETATokenFactoryV315.sol, Foundry tests.
- Existing v3.1.4 registry and legacy governance remain until safe v3.1.5 replacement is fully tested; none of these additions authorizes deployment.

Do not copy into xgr-node XGR3.0, build a release, or deploy to production before closure of all blockers.
