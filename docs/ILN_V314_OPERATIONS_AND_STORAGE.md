# XGR ILN v3.1.4 – operating and storage checklist

**Pre-release operating guide; feature branch only.** Base↔XGR is the first deployment. Other EVM chains and token routes require their own configuration and deployments.

## End-to-end operation

1. **Chain deployment:** Install each chain's configured RPC, canonical Mailbox/MerkleTreeHook, RegistryV2/ISM/BLS verifier, route-specific Warp routers, Gateway and its automatically created FeeVault. BLS verifier and precompile compatibility must be tested on the target chain, not assumed from EVM support.
2. **Validator activation:** A PoS validator opts into Interchain membership per configured chain using `xgrchain ibft interchain set-active --chain CHAIN --active true --data-dir DATA`. Governance uses the **source chain** active RegistryV2; signing a transfer uses the **destination chain** active RegistryV2. These are distinct sets and operations.
3. **Source route governance:** Use `proposal create` with the source and destination, destination domain, route ID and route-specific fee / routing addresses. Each participating source-chain validator must individually run `proposal approve`. After quorum is present, `proposal execute --data-dir DATA --proposal-id ID` submits the on-chain source Registry `applyGovernance` transaction. Verify confirmed nonce, emitted events and current `getRoute`. `ROUTE_ADD` enables the route immediately: complete router, liquidity and validator deployment FIRST.
4. **User quote:** Query `ILNGateway.quoteILN(destinationDomain, recipientBytes32, amount)`. The output is source-native validator fee, source-native router value, total source-native value, and token amount to approve. ERC-20 requires token allowance to **Gateway** (not Warp router). Native routes must supply the quoted native principal + router cost + validator fee exactly.
5. **User bridge:** Call **Gateway** `bridge(destinationDomain,recipientBytes32,amount)` with exact `msg.value`. The fee is atomically allocated to FeeVault's local source-chain validators; token lock/burn, Mailbox.Dispatch and ILNOperation must be in the same successful source receipt. Direct Warp-router calls are an explicit unsupported user risk and never qualify for ILN signing.
6. **Validator quorum:** After source confirmation, validators independently verify the Gateway event, historical route, same-tx canonical Mailbox.Dispatch, Merkle checkpoint and *undelivered* destination state. Only then sign. Node RPC supports `xgr_requestILNQuorum(route,messageId,sourceBlockNumber)` and `xgr_getILNQuorumAttestation(route,messageId,setId)`.
7. **Delivery:** A permitted relayer or an unrelated user submits the signed metadata/message to destination Mailbox.process. Read Mailbox.delivered(messageId) for the final settlement outcome. Optional relayer must not be trusted for authorization.
8. **Recovery:** `node runtime/native-relayer/recover-iln.mjs 0xMESSAGE_ID` reconstructs publicly verifiable original source evidence, asks for current-set quorum when necessary, and yields unsigned Mailbox.process calldata. No new bridge, lock, mint or validator fee is due for re-attestation. After a validator rotation an old quorum becomes stale; request a *new signature on the original message*.
9. **Validator native fee claims:** On the **source chain**, the validator wallet calls the route's immutable FeeVault `claim()`. Read `claimable(validatorAddress)` first. Example for an EVM JSON-RPC:
   ```bash
   cast call "$FEE_VAULT" "claimable(address)(uint256)" "$VALIDATOR_ADDRESS" --rpc-url "$SOURCE_RPC"
   cast send "$FEE_VAULT" "claim()" --private-key "$VALIDATOR_TX_KEY" --rpc-url "$SOURCE_RPC"
   ```
   Use an appropriately protected wallet process; never paste keys into logs or command history. `claimable` survives validator exit. Fees are paid in the *source chain's native currency*. No per-signature payout mechanism.
10. **Additional chains/token routes:** Add source and destination RPC environments on the participating validator nodes, deploy per-chain shared components once and per-token routers/Gateway/Vault for each route. Validate liquidity, quote semantics, signer bootstrap and recovery before on-chain route addition. A token bridge does NOT inherently execute a DEX swap or forward a multi-hop hub route automatically.

## Node disk retention policy

| Object | Cleanup rule | Why |
|---|---|---|
| Route catalog + confirmed scan cursors | Keep | Needed to recover on-chain discovery and restart safely |
| Outstanding message-specific attestation(s) | 30-day cache; prune only after source Gateway receipt, checkpoint and current destination signer-set can be reconstructed | Users re-request an attestation for the original message without new bridge, lock or validator fee |
| Attestations for delivered messages | Retain at least 7 more days since archive directory modification, then delete only after destination RPC confirms delivered again | Recoverable elsewhere via immutable chain data; avoids unlimited completed-transfer archives |
| Pending BLS local votes | Preserve while pending; remove on quorum finalization or positively confirmed destination delivery | Avoid source/ISM signer loss; stop repeated gossip after settlement |
| Public unsigned quorum request hints | 15-minute bounded lease; clients may re-request the *same original message* | Anti-spam; hint expiration never touches a token balance or immutable bridge operation |
| Expired source-governance proposal + quorum files | Remove after 7-day post-expiration grace; active ones remain | Expired signatures cannot govern anymore |
| FeeVault claimable balances | Never pruned from node JSON; held on-chain | Validator native fee claims survive membership changes |

Maintenance runs in a separate Go worker, currently every five minutes, checking at most 64 old transfer archive candidates per cycle. Failed chain RPC and ambiguous delivery **always keep** files. This bounds maintenance IO; on-disk outstanding quorums may still grow with number of undelivered operations, so operational observability, disk-alerts and reliable destination settlement remain necessary.

### Explicit release blockers

- Go CI green at the final commit; independent static/security review.
- Check real on-chain governance ABI tuple encoding and Tx receipt on an isolated EVM chain; 2/3 membership, expiry, nonce, set rotation.
- Test both directions (Base→XGR, XGR→Base) with native and ERC-20 Warp, real ISM/BLS verification and no duplicate Mint/Burn.
- Test fees and `claim()` before and after validator exit, and absence of payment during re-attestation.
- Test offline official relayer, third-party public recovery, wrong/expired quorum, disabled route with pending operations, registry fee update in same source block, persisted state restart and external chain RPC outage.
- Confirm no existing production router, contract, RPC or v3.1.3 state migration was unexpectedly overwritten.

Do not merge to production or assume `xgr-node/XGR3.0` is synchronized merely because `xgrchain/feature/interchain-v3.1.4` tests pass.

### Validator disk diagnostics

Use the read-only node command on each validator (works without starting the worker):

```bash
xgrchain ibft interchain storage-status --data-dir /path/to/node-data
```

The report counts total on-disk interchain files and bytes, separated into transfer attestations, local BLS votes, queued public quorum hints, governance and other interchain state. It is not a substitute for monitoring free disk space on the host; alert on remaining filesystem capacity as well as trends in pending versus delivered messages. The new cleanup schedule is five minutes, at most 64 old transfer archives inspected per cycle. Already delivered archive removal is deliberately conservative and only eventual, never an immediate consensus action.

### Regenerable pending quorums (v3.1.4)

At 30 days a pending message-specific quorum is eligible for eviction **only after** the validator node has re-read the canonical original source Gateway operation, historical route, verified same-tx Mailbox.Dispatch, original checkpoint and currently available destination validator set. Failed historical RPC/proof validation keeps the quorum. A new public quorum request signs the **original** message and requires no additional source fee. This policy depends on retained historical RPC coverage and sufficient online validators; an existing quorum provides availability when those components are unavailable. Operators may independently retain backups longer.
