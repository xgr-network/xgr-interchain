# XITA Solana ↔ EVM behavior parity (normative acceptance contract)

Solana must reproduce **the behavior of existing XITA Direct-BLS V315**;
implementing in Rust/SVM is not authorization to invent governance, new fees,
a new validator set, route admission or central service privileges. The
standard is the *current Solidity implementation*, not an abstract bridge.

| Existing EVM implementation | Same required behavior on Solana |
| --- | --- |
| `XETATokenFactoryV315.deploy*Router` | Any actor can instantiate its own collateral, wrapped or native-asset router representation (Solana PDA/mint where appropriate); creator-bound local router ownership |
| `XETATokenFactoryV315.registerRoute` | Creator of the source router can register a directed route without BLS admission vote; atomic route/gateway/fee-vault state and immutable binding; one outbound route per router/domain |
| `XGRILNRegistryV315` | Append-only immediately enabled route records; no admin route deletion, veto or arbitrary mutation |
| `XGRILNRegistryV315.applySourceFee` | Initial source-native validator fee set at bootstrap, later changes require valid current validator-set BLS quorum (nonce/expiry/domain/registry bindings) |
| `XGRInterchainValidatorRegistryV3` | Validator set transitions require current-set BLS quorum, key proof-of-possession and independently checked membership state |
| `XITADirectBLSISM` and Direct protocol | Each inbound message authorized by the current destination set's 2/3 Direct-BLS, binding source operation, route, asset, recipient, amount, source fee and anti-replay identifiers |
| `XETARouterCore` and guarded routers | Only valid local route/gateway can dispatch; escrow lock/burn and verified reverse mint/unlock; no operator-controlled mint/freezes |
| `ILNGateway` | Public user-signed source entrypoint; source fee + token movement + exact transfer evidence are atomic; arbitrary replaceable executor/relayer |
| `XGRILNFeeVault` | Validator fees recorded per directed route and historical validator-set epoch; validators claim their own earned fees |
| `XITAExecutionGateway` | Entirely optional company/operator-controlled quote, sponsorship and commercial fee adapter; no ability to alter or gate base protocol |
| `XGRILNProtocol.assetIdV315/routeInstanceIdV315` | Same canonical asset identity and XGR hub topology; Solana 32-byte account/mint bindings and u64 amounts require collision-free, auditable codecs |
| EVM immutable source contracts | Solana programs made permanently immutable (no upgrade/close authority) **before** route activation |

## No independent Solana governance

The **same XGR Interchain validator set and BLS security principle** apply;
Solana may hold its own authenticated destination snapshot/Registry (as
Base/Arbitrum/BSC/Optimism do) but not a different, centrally administered
validator set. Membership/fee changes follow the quorum specified by the
existing V315 contracts, not a GmbH admin, upgrade multisig or manual approval.

The XGRChain counterpart may reuse the existing fee vault/verifier and
validator registry if compatible. Any additional Solana-aware Solidity
factory/router/registry/ISM must preserve the same public interface semantics
and security constraints. Existing EVM contracts and signature bytes must
stay unchanged.

## Admin workflow acceptance

Chain setup -> reviewed deployment artifact -> wallet-signed deployment ->
independent code/receipt verification -> token router/representation -> route
registration -> signed transfers -> recovery. This is a single product workflow
with EVM and Solana *transport adapters*, not two products or governance
models. The current Solana read-only staging panel is temporary.

No Solana transfer is approved for release until parity, adversarial security
tests, current-set validator checks, replay, fee snapshots, 2-hop XGR topology
and a user-signed independent relayer path all pass end-to-end.
