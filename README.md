# XGR Interchain / XITA — Direct-BLS protocol

The maintained Interchain implementation uses XGRChain as its mandatory hub and **Direct-BLS authorization for each source message**. The node baseline is **xgr-node v3.4.0**; Solidity family suffixes (V315/V2) are independent interface versions.

## Permissionless protocol, optional service

Anyone can register supported routes through the public Factory. The canonical Asset ID and directed Route ID derive from on-chain identities; a XITA listing or token-project approval is not protocol admission. Validators independently verify actual source evidence and destination bindings. Chain-wide source fee governance remains distinct from route registration.

**The XITA-managed relayer is optional.** A user or any independent gas-paying executor can deliver an authenticated message with public `Mailbox.process`. The public `runtime/native-relayer/recover-iln.mjs` helper verifies the original source receipt, durable fee allocation, current destination BLS set/quorum, router and ISM, simulates execution, and emits unsigned calldata. It does not broadcast or hold user keys. Website, commercial Execution Gateway and sponsor availability are not protocol authorization requirements.

Working chain RPC access, eligible validator quorum, principal/allowance, source protocol fees and source/destination gas remain required. An independent executor bypasses a particular relayer outage, not missing authorization or invalid source evidence. Technical role separation does not by itself determine regulatory classification.

## Mandatory hub and asset flow

Every directed route has XGRChain (chain/domain 1643) at exactly one endpoint. Base (8453) → Arbitrum (42161) therefore requires two separately authenticated hops via XGRChain. Native/collateral routers lock original assets; synthetic routers mint only on authenticated delivery and burn before return/onward dispatch. A reverse route must be verified independently. ERC-20 approval can add wallet transactions.

## Current technical documentation

- [Structured full documentation index](https://github.com/xgr-network/XGR/blob/main/docs/interchain/README.md)
- [Contract API and fee reference](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Contract_Reference.md)
- [Complete CLI](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_CLI.md) and [JSON-RPC](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_RPC.md)
- [Validator observation, P2P and durable state](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Validator_Runtime.md)
- [Optional service HTTP APIs/configuration](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Services.md)
- [Source map and validation](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Source_Map.md)


- [Complete v3.4.0 reference](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Reference.md)
- [Independent transfer and recovery](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md)
- [Release and consensus activation](https://github.com/xgr-network/XGR/blob/main/docs/chain/XGRCHAIN_v3.4.0_Release_and_Activation.md)
- [Architecture](docs/architecture.md) and [operations](docs/operations.md)
- Actual deployment receipts: `deployments/chains/`, `deployments/assets/`; reverify against live chain state before signing.

## Repository layout

| Path | Role |
| --- | --- |
| `contracts/` | Source Gateway, Registry/Factory, escrow/synthetic routers, FeeVault, destination Direct-BLS ISM and validator registry |
| `script/` | Shared infrastructure deployment tooling |
| `config/`, `deployments/` | Chain/asset manifests and recorded deployment evidence |
| `runtime/native-relayer/` | Replaceable event watcher, canonical receipt/Direct-BLS verification and unsigned recovery |
| `apps/web/` | Optional XITA interface with wallet-owned transactions and transfer progress |
| `services/` | Optional indexing, commercial quote/sponsor, onboarding and administrative services |

Validator chain bindings and finality policy are in the public `xgr-node/interchain/config.go`; they are not per-route environment settings. XGRChain and rollup finality policies differ. Current Direct-BLS recovery does not require an Interchain Merkle hook, replica prefix or checkpoint inclusion proof. The chain's own state/receipt tries remain unrelated.

## Validation

```sh
forge test -vvv
node tools/validate-manifests.mjs
node --test tools/validate-manifests.test.mjs
bash -n runtime/manage-relayers.sh
(cd runtime/native-relayer && npm install --ignore-scripts && npm test)
```

Use the repository CI and current audit evidence for the precise test scope. Unit tests do not certify cross-chain deployment safety. Verify both directions, two-hop continuation, current-set rotation, finality/RPC failures, duplicate delivery rejection, wallet recovery and independent unsigned execution. Historical specifications and dated audits remain snapshots; they do not override the current Direct-BLS source.
