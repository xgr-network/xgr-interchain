# XDC ECDSA V5 — separate contracts, shared node workflow

BLS V3 contracts are the immutable compatibility reference. The existing
`XGRInterchainValidatorRegistryV3.sol`, `XITADirectBLSISM.sol`,
`XITADirectProtocol.sol` and all deployed Base/Arbitrum/Optimism/BSC/XGR
registries and ISMs must remain unchanged.

The destination-specific ECDSA implementations are independent Solidity
contracts: `XGRInterchainECDSAVerifier.sol`,
`XGRInterchainECDSAValidatorRegistryV5.sol`,
`XITADirectECDSAISM.sol` and `XITADirectECDSAProtocol.sol`.
They implement the same protocol behavior through ECDSA-specific proofs and
signatures; they do not inherit a shared registry/ISM state machine.

The Admin resolves the signed chain manifest to one explicit profile:

| Declared format | Registry artifact | Destination ISM | Required version | Key format |
| --- | --- | --- | --- | --- |
| `compressed` | `XGRInterchainValidatorRegistryV3` | `XITADirectBLSISM` | 3 | 1 |
| `eip2537` | `XGRInterchainValidatorRegistryV3` | `XITADirectBLSISM` | 3 | 2 |
| `ecdsa` + `signatureScheme: ecdsa` | `XGRInterchainECDSAValidatorRegistryV5` | `XITADirectECDSAISM` | 5 | 3 |

All artifact-selection and receipt checks must use that same profile and
verify the deployed registry's `registryVersion()`,
`verifierKeyFormat()`, `destinationDomain()` and `originChainId()`
against the approved manifest before dependent wallet transactions.

The XGR-Node keeps one generic validator lifecycle / evidence / gossip /
recovery worker. Only the cryptographic adapter changes per compiled chain
policy: BLS on existing destinations, ECDSA (using the pre-existing
`consensus/validator.key`) on a separately authorized XDC deployment.
The node must never infer the scheme from missing BLS precompiles or an
untrusted RPC response. The receipt-pinned destination Registry and ISM
remain the source of truth for on-chain verification.

**XDC is not authorized for deployment or transfers.** Its contract
selection is prepared but `bootstrap.json` still has empty genesis
validators, possession proofs and economic parameters. The Admin's wallet
deployment gate must remain closed. No node release, new routing, source lock
or contract replacement is authorized by this change.
