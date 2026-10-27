# XITA v3.1.5 — validator and source-fee bootstrap

The latest GitHub `main` authorizes desired chains, assets, routes and
bootstrap inputs. This file is a **development gate**, not a claim of a
production-ready one-click deployment process.

## Bootstrapping each chain (explicit Interchain Genesis)

Every destination defines its initial Interchain validator selection once in
`config/chains/<chain>/bootstrap.json` through `genesisValidatorManifest`.
The referenced `config/validators/*.json` is the fixed, manually approved list
in constructor order. It is **not** the complete XGRChain PoS list; each chain
may select its own subset. No destination Interchain Registry or XGR PoS
snapshot needs to exist before the first Registry deployment.

The validator CLI creates **public**, destination-specific BLS proofs:

```bash
xgrchain ibft interchain bootstrap-proof \
  --data-dir /path/to/validator/data \
  --origin-chain-id 1643 \
  --destination-domain 8453
```

Save the three existing Base outputs (or N outputs for a future chain) as
`validator-1.txt`, `validator-2.txt`, etc. in the configured Admin public
evidence directory for that chain. The Admin reads these automatically at
Preview/Deploy. It validates address, source ID 1643, destination domain,
compressed/uncompressed BLS keys and signed payload, then uses an
**eth_call against the destination's already verified BLS verifier** to
authenticate each proof. No validator secret is uploaded, no extra wallet
signature is requested and no gas is spent by these checks.

The Registry V3 constructor receives the verified public key/proof arrays
and the exact native-currency reserve deposit
(`validatorCount * perValidatorWei`). It independently checks all PoPs,
creates initial `setId=1`, and reverts atomically if an input is invalid.
EIP-2537 destinations deploy the BLS verifier once first. XGRChain uses its
existing native compressed verifier at `0x0000000000000000000000000000000000002040`.

After Genesis, membership changes are separate BLS-quorum operations
on **that destination's** live ValidatorRegistry V3. The original selection
is never re-read dynamically from XGR PoS on the deployment path.

## Single source-native fee per physical chain

**Initial deployment**: the chain-wide positive native fee is approved in GitHub main, pinned into the immutable Factory constructor and passed to the Source ILN Registry constructor. There is no validator quorum for this one-time bootstrap; the registry starts at nonce 0. A deployer cannot subsequently edit the initial value.\n\n**Later changes**, after deployment, require the existing validator quorum protocol:

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
creates or updates `deployments/chains/<chain>.json` in the same
GitHub fast-forward commit. Asset router/gateway receipts instead update
the sparse `deployments/assets/<shard>/<SYMBOL>/` representation or route file using the canonical Asset ID.

The **initial fee** must be attested as part of the Registry/Factory deployment constructor binding; it is not a signed quorum update. A later **fee update is not a contract deployment**: it needs a separate
verified governance-event journal with proposal ID, setId, nonce,
feeWei, txHash, source chain and confirmed block. That journal and the
wallet-signed generic creation executor remain unfinished; they are
required before marking the one-click workflow executable. On GitHub
write failure, retain signed receipts in a durable local journal and
retry only the GitHub write. Never replay an already mined transaction.

## Release gates

- Validate the approved Genesis validator identities and destination-bound
  PoPs against the correct deployed verifier before each Registry creation
- Produce pinned build-artifact hashes and wallet transaction constructors
- Verify mailbox/hook addresses and EIP-2537 precompiles
- Store immutable signed transaction hashes before waiting for receipts
- Verify deployment receipt, contract runtime and constructor bindings
- Execute source-native fee quorums and store historical evidence
- Verify reciprocal routes and BLS safety attestations before enabling mint
- Demonstrate bidirectional bridge and relayer outage/recovery in E2E tests

Do not deploy validator registry or send reserve collateral while any of
these security prerequisites are unresolved.

## Mainnet-spoke (Base) cost / go-no-go gate

The first Base mainnet transaction is the independent EIP-2537 BLS verifier
deployment. `config/chains/base/bootstrap.json` contains approved native reserve amounts
and its fixed initial validator set; the Base verifier is already documented.
The Admin must still successfully verify the destination PoPs before a paid
ValidatorRegistry deployment.

1. Update the local checkout from the latest `main` and confirm
   the sealed Foundry artifacts pass `node services/admin/verify-sealed-constructors.mjs .`.
   The Admin preview runs EIP-2537 G1/G2/pairing positive and malformed
   negative vectors against the EXACT configured Base RPC; these must pass.
2. For the first `blsVerifier` contract: obtain a successful
   `eth_estimateGas` simulation before signing, independently check
   MetaMask network 8453 and ETH max cost, and require canonical receipt plus
   exact-runtime verification before moving on.
3. Reuse the three **Base-domain 8453** public CLI possession proofs.
   The Admin automatically verifies them against the documented Base BLS
   verifier before presenting the Registry transaction. No PoS snapshot.
4. Approve immutable minimum and maximum executor reserve amounts and
   the initial **Base-native** Source Fee. The currently configured fee is
   100000000000 wei = 0.0000001 ETH, independent of XGRChain's 0.1 XGR.
   Do not infer an economic approval from a prepopulated form.
5. Deploy remaining Base components strictly in Admin dependency order,
   verifying each immutable constructor binding, minimum confirmations,
   transaction hash, provenance and append-only GitHub receipt *before*
   the next paid transaction. Keep the existing XGRChain contracts.
6. Do not fund or deploy any asset router / activate bridge UI until the
   complete reciprocal real-message Direct-BLS delivery and self-paid
   wallet recovery path has been exercised on both real chains.

No contract deployment is performed by these software checks.

## Base mainnet ETH cost quotation (no paid calls)

The operator Admin simulator includes the buffered L2 execution-gas price,
the constructor's reserve deposit, **Base L1 data-availability fees** from
GasPriceOracle at `0x420000000000000000000000000000000000000F` and
OP-Stack operator fees. The L1 upper-bound quote uses constructor calldata
bytes plus a 512-byte transaction-envelope allowance. The OP-Stack quote
uses the full gas limit, including the 20% headroom. A missing, malformed
or reverting oracle quote blocks the transaction draft before wallet signing.
The Base 16,777,216 gas-per-transaction limit is checked.

The Admin's total is a **current estimate, not a fixed upper limit**:
gas-price and other network-fee parameters may move before MetaMask confirms.
Inspect the final ETH charge in MetaMask. Validator reserve deposits are
economically distinct from network fees (collateral vs paid gas).
No ETH is spent by the estimator.
