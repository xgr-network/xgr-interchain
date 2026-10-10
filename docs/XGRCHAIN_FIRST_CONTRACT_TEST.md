# Generic XITA v3.1.5 Deployment Preflight

The chain and the test order are selected by the operator. Every chain,
asset, route, fee, verifier format and address comes from the validated
GitHub main configuration. No XGRChain-first or Base-first special path exists.

## Read-only inspection

- `GET /admin/api/first-deploy`: planning data for **all** configured chains,
  not a fixed list. Select a chain in the Admin workflow.
- `GET /admin/api/chain-preflight?chain=<configured-name>`: read-only RPC
  identity, Hyperlane Mailbox/Hook bytecode, gas price and verifier-specific
  tests. Unknown chains are rejected.
- `blsVerifierFormat="compressed"`: requires a config-defined precompile
  address and tests rejection of a malformed compressed signature via
  `eth_call`. Precompiles may have empty `eth_getCode`.
- `blsVerifierFormat="eip2537"`: validates RPC/Core only at this stage.
  Positive and negative EIP-2537 tests remain mandatory.

All chains are blocked from contract deployment until a positive BLS vector,
chain-bound public validator proofs, finalized PoS snapshot, approved reserve
and native initial fee, trusted contract artifacts, wallet executor, journal,
receipt verification and GitHub backcommit are working.

The first operational trial may be selected on XGRChain to save gas, but
choosing it does not change any protocol architecture or code path.
