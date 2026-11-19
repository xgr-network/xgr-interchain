# XDC Mainnet — ECDSA V5 chain integration

**Status: implementation incomplete; contract deployment and transfers disabled.**

XDC (chain ID/domain 50) is a destination with its own independently selected
validator roster. Each participating XGR PoS validator decides separately whether
to opt in via the standard `ibft interchain set-active --chain xdc` operation.
Validator signing uses the existing `consensus/validator.key` ECDSA key,
not a second interchain signing key.

The destination ValidatorRegistry V5 mirrors BLS V3 economics and governance:
three explicitly selected genesis validators, proof of possession, native XDC
deactivation reserves per validator, quorum-authorized individual ADD/REMOVE,
executor reimbursement limits, top-ups, claims, historical fee-recipient
snapshots, and replay-bound epochs. ECDSA secp256k1 verification replaces
only the BLS pairing verification. Validators on other destinations do not
automatically become XDC validators.

The Admin must refuse XDC wallet deployment until the three genesis
identities, their public destination-bound possession proofs, minimum native
reserve, maximum executor reimbursement, funded reserve per validator,
and initial source fee have been explicitly selected and validated. Missing
values must not be defaulted to arbitrary one-wei amounts.

The node's production ECDSA worker, source/finality evidence, gossip,
quorum aggregation, durable recovery and per-chain CLI must pass adversarial
tests and a separate delta audit before approving a light release.
No token transfer route is enabled by this document.

## Chain-specific Solidity contract selection

The established BLS V3 Solidity sources are not refactored or redeployed.
BLS V3 continues to use `XGRInterchainValidatorRegistryV3.sol` and
`XITADirectBLSISM.sol`. The separate ECDSA implementation remains
`XGRInterchainECDSAValidatorRegistryV5.sol`,
`XGRInterchainECDSAVerifier.sol`, `XITADirectECDSAISM.sol`
and `XITADirectECDSAProtocol.sol`.

The Admin chooses the verified creation artifact from the approved chain
manifest, **not** from a missing BLS precompile, an RPC response, a wallet
signature or the chain name alone:

| Configured verifier | Required scheme | Registry / ISM | Registry version | Key format |
| --- | --- | --- | --- | --- |
| compressed | bls | BLS V3 / Direct BLS ISM | 3 | 1 |
| eip2537 | bls | BLS V3 / Direct BLS ISM | 3 | 2 |
| ecdsa | ecdsa (mandatory) | ECDSA V5 / Direct ECDSA ISM | 5 | 3 |

Before any dependent deployment, the Admin independently checks the already
deployed registry's `registryVersion()`, `verifierKeyFormat()`,
`destinationDomain()` and `originChainId()`. Signed wallet intent and
receipt reconciliation use the same chain-specific artifact selection and
constructor/runtime verification.

The Node uses one generic V3 worker and an explicit crypto adapter selected
from release-reviewed, receipt-pinned per-chain policy. It continues to
address the **existing** deployed BLS V3 registries on XGR, Base,
Arbitrum, Optimism and BSC. Its ECDSA candidate for chain 50 remains
unbound until a separate reviewed deployment and node release. No
pre-existing transfer, custody balance or destination ISM is replaced.
