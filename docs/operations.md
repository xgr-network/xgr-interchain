# XGR Interchain / XITA — operator handbook

**Baseline:** current xgr-interchain main, xgr-node **v3.2.3**. This document supersedes the obsolete v3.1.4 `ROUTE_ADD` governance and quorum activation instructions.

## Release and readiness gates

1. Check exact chain IDs and online Registry/Factory/ISM/Mailbox/Hook addresses using `deployments/chains/{xgrchain,base,arbitrum}.json`, `eth_chainId` and actual contract runtime code; never trust filenames alone.
2. Distinguish configured asset/route prospects from fully receipt-verified deployment, paired reverse routes and public readiness. Do not publish an unbacked synthetic.
3. Run Solidity Foundry tests, runtime relayer JS tests, admin deployment/reconcile tests, frontend transfer/recovery tests and native node/interchain Go tests before production changes.
4. Use the browser Admin deployment preparation and wallet signatures to deploy shared chain components once, asset routers once per chain and route Gateways/FeeVaults once per *directed route*. Always reconcile GitHub receipts and verified EVM state before retrying failed submissions; deliberate new deployments require fresh recorded identities, not erasing evidence.
5. **No route-activation BLS governance vote is necessary.** On-chain permissionless Factory/Registry registration is the current v3.1.5 rule; 2/3 BLS governance is only for the single chain-wide source validator fee.
6. Validate both directions with small real amounts and independently verify source escrow/burn, verified destination mint/unlock, fee allocation and final Mailbox delivery.

## Validator node configuration

The audited environment template `runtime/xgr-node-interchain-mainnet.env.example` covers Base, Arbitrum and XGRChain source/destination network identities, Registry addresses, RPC endpoints, confirmation depth, verifier format and reserves. Route IDs are *not* per-token node environment variables. Each node must run a tagged binary compatible with these contracts; verify `xgrchain version`. Adding a whole new chain currently requires a controlled validator restart while adding a new route to an existing chain is discovered live.

Read-only health:

```sh
curl -sS http://127.0.0.1:8545 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"xgr_getILNIndexerStatus","params":[]}' | jq .
curl -sS http://127.0.0.1:8545 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"xgr_getInterchainValidators","params":["base"]}' | jq .
xgrchain ibft interchain storage-status --data-dir /ABS/NODE/DATA
```

Use the [node manual](https://github.com/xgr-network/xgr-node/blob/XGR3.0/docs/ILN_V323_OPERATOR_REFERENCE.md) for opt-in/out CLI, Bootstrap Proof, fee create/approve/execute, rpc quorum, source config and replica handling. Never publish node private keys in logs or documentation.

## Merkle initialization and P2P

Data in `<node>/interchain/iln/replicas/<sourceChainId>/<hook>.json` contain ordered leaves, root/count/checkpoint, **not serialized messages**. Every peer snapshot is treated as untrusted and independently rehashed against confirmed Hook root/count. A node may recover from a verified P2P peer with a complete prefix; recent on-chain updates are limited to 128 confirmed blocks.

If *all peers* lack necessary history, verify canonical historical Hook `InsertedIntoTree` logs using `./manage.sh init-merkle --chain CHAIN --data-dir /ABS/PATH --rpc RPC --dry-run`. Before a write, back up the target node and stop **only that node**, then follow [Merkle bootstrap instructions](docs/ILN_V320_MERKLE_BOOTSTRAP.md) (same-repo relative path: `ILN_V320_MERKLE_BOOTSTRAP.md`). Never fabricate missing leaves, replace live replica files or shut down every PoS validator simultaneously.

## Direct recovery without managed relay

Use public `ILNGateway.quoteILN` and `ILNGateway.bridge` with user wallet; the optional commercial fee adapter is unnecessary. Source receipt gives canonical original operation and message ID. `node runtime/native-relayer/recover-iln.mjs 0xMESSAGE_ID` prepares an **unsigned** `Mailbox.process` call if all source, FeeVault, Merkle and current-set quorum checks pass. The user signs that destination call and pays its gas, checks `delivered(messageId)`, then signs a separate second hop if needed. Do not restart source bridge for pending delivery.

## Monitoring and incident matrix

| Signal | Action |
| --- | --- |
| Worker health stale or missing | Verify process, XGR sync, correct data-dir and credentials |
| Route `catching-up` / missing `localLeaves` | Validate source RPC, root/count, P2P donors, existing persisted data |
| `SOURCE_MERKLE_RECONSTRUCTION` | Preserve original message; bootstrap one independently verified full replica only if peers cannot provide it |
| RPC 403/429/503 | Verify independent RPC chain ID; fail over to trusted provider, don't treat missing archival state as loss of funds |
| Quorum incomplete | Verify membership and source FeeVault operation, current destination set, pending votes |
| Validator-set change | Re-attest **same original message**; never repeat lock/burn |
| Destination already delivered | Verify destination receipt and recipient asset balance; do not replay |
| Optional sponsor unavailable | Show user actual gas funding requirement; do not pretend the step was sponsored |
| Indexer behind | Distinguish status availability from on-chain outcome and avoid false duplicate UI journeys |

## Data and release boundaries

Keep independent backups of validator data directories, source receipts/message bytes, Merkle replicas, route catalogs, fee/accounting event records and recovery tools. The XITA fee worker and indexed commercial-service event processing are not validator signing inputs; private IP/country accounting evidence does not belong in public contracts or manifests.

Operational code lives in `services/admin`, `services/managed-relay`, `services/indexer`, `runtime/native-relayer` and `apps/web`. `./manage.sh deploy` publishes the website and never secretly deploys new on-chain contracts. Follow [deployment reference](docs/GENERIC_CHAIN_DEPLOYMENT_V315.md) (same-repo relative: `GENERIC_CHAIN_DEPLOYMENT_V315.md`) and [roundtrip audit](docs/XITA_ROUNDTRIP_AUDIT.md) (same-repo relative: `XITA_ROUNDTRIP_AUDIT.md`).
