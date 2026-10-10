# XITA v3.1.5 — validator and source-fee bootstrap

The latest GitHub `main` authorizes desired chains, assets, routes and
bootstrap inputs. This file is a **development gate**, not a claim of a
production-ready one-click deployment process.

## Bootstrapping each chain

For each chain approved under `config/chains/<chain>.json`,
`config/bootstrap/<chain>.json` specifies:

- Immutable origin chain 1643 (XGR PoS), target chain ID/domain
- Finalized XGR PoS validator snapshot height, ordered validator addresses
- Each validator's 48-byte compressed BLS public key, 128-byte EIP-2537
  public key and a destination-bound proof of possession
- A reserve floor, maximum reimbursable exit fee, per-validator initial
  stake/reserve in the destination's native currency (integer wei)
- A proposed single source-chain validator fee in native smallest units;
  signed fee quorum has a 1–600 second expiry (default 300 seconds).

Both compressed and EIP-2537 formats are required in the registry
constructor. **Never send validator private keys to the Admin console.**

On validator node v3.1.5, the current CLI creates a destination-specific
public bootstrap proof:

```bash
xgrchain ibft interchain bootstrap-proof \
  --data-dir /path/to/validator/data \
  --origin-chain-id 1643 \
  --destination-domain 8453
```

Each validator must generate a proof for each intended destination domain.
The CLI currently outputs the EIP-2537 *uncompressed* possession signature,
but the native XGRChain precompile expects a **96-byte compressed G2 proof**
in its constructor. That format mismatch must be bridged by a validated
public signature conversion routine or by a proven compatible exporter.
Do not simply copy an EIP-2537 signature to a compressed native slot. XGR
node consensus software must not be changed for this UI feature.

On destination deployment, the wallet funds
`validatorCount * perValidatorReserveWei` as `msg.value`. The
constructor verifies **every** validator's destination-scoped BLS proof,
sets the immutable initial set and starts with `setId=1`. A rejected PoP
reverts the entire transaction; it cannot leave a partially trusted set.

The verifier comes before the validator registry. XGRChain uses the native
compressed verifier at `0x0000000000000000000000000000000000002040`;
EIP-2537 chains need a verified deployed BLS verifier and positive/negative
test vectors. Never equate an EIP-2537-capable EVM with a successfully
verified EIP-2537 deployment merely because the chain ID matches.

## Single source-native fee per physical chain

After ValidatorRegistry, ISM, Factory and source ILN Registry are verifiably
deployed, the chain-wide source fee is proposed through the existing
validator quorum protocol:

1. `ibft interchain fee create --source <chain> --fee-wei <value> --data-dir <validator-data>`
2. Each participating validator explicitly calls `ibft interchain fee approve --proposal-id <hash> --data-dir <validator-data>`.
3. `ibft interchain fee execute --proposal-id <hash> --data-dir <validator-data>`.
4. Read `validatorFeeWei()`, `sourceFeeNonce()`, the validator `setId()`
   and the confirmed `SourceFeeUpdated` receipt on **that source chain**.

An operator UI may display progress and submit a signed quorum, but **must
not impersonate validators or auto-approve a fee on their behalf**. There is
exactly one fee per physical source chain, never per asset or router route.

## Immutable GitHub documentation

Every verified contract transaction adds an immutable receipt and
updates `deployments/mainnet/infrastructure/<chain>.json` in the same
GitHub fast-forward commit. Asset router/gateway receipts instead update
`deployments/mainnet/assets/<asset>.json` using the canonical Asset ID.

A **fee update is not a contract deployment**: it needs a separate
verified governance-event journal with proposal ID, setId, nonce,
feeWei, txHash, source chain and confirmed block. That journal and the
wallet-signed generic creation executor remain unfinished; they are
required before marking the one-click workflow executable. On GitHub
write failure, retain signed receipts in a durable local journal and
retry only the GitHub write. Never replay an already mined transaction.

## Release gates

- Validate snapshot membership against finalized XGR PoS before contract
  creation; compare PoPs with the correct verifier on each destination
- Produce pinned build-artifact hashes and wallet transaction constructors
- Verify mailbox/hook addresses and EIP-2537 precompiles
- Store immutable signed transaction hashes before waiting for receipts
- Verify deployment receipt, contract runtime and constructor bindings
- Execute source-native fee quorums and store historical evidence
- Verify reciprocal routes and BLS safety attestations before enabling mint
- Demonstrate bidirectional bridge and relayer outage/recovery in E2E tests

Do not deploy validator registry or send reserve collateral while any of
these security prerequisites are unresolved.
