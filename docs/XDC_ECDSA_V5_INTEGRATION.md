# XDC Mainnet — ECDSA V5 chain integration

**Phase 1 prepares contract deployment. Phase 2 covers node activation and transfers.**

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

## Phase 1 deployment

| Input | XDC |
| --- | ---: |
| Minimum reserve | 0.40 |
| Maximum executor reimbursement | 0.08 |
| Genesis reserve per validator | 0.80 |
| Initial source fee | 0.008 |

The three approved Genesis validators fund 2.40 XDC in total. Run
`bash tools/collect-xdc-bootstrap-proofs.sh` from the main validator host
as `xgradmin`. The script builds the pinned xgr-node CLI with Go, runs the
existing `ibft interchain bootstrap-proof` command on each validator and
writes three public JSON files under `~/xita-bootstrap-public/xdc/`.
The script expects noninteractive SSH access to the other two validators.

The Admin uses these files to verify the three destination-bound proofs via
XDC's native ECDSA recovery precompile. Successful verification and the
approved economics are required before the Admin prepares the first wallet
transaction. As in the BLS deployment, the Admin simulates each transaction
and verifies its receipt and runtime. The Registry and Factory constructor
values are pinned to the approved XDC manifest.

## Phase 2 activation

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
