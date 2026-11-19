# XDC Mainnet — ECDSA V5 chain integration

**Status: shared V3 protocol architecture implemented in source; XDC integration,
contract deployment and transfers remain disabled.**

The contract lifecycle and direct-message policy now use the common cores
described in [INTERCHAIN_PROTOCOL_CORE.md](INTERCHAIN_PROTOCOL_CORE.md). The
corresponding node refactor integrates typed BLS/ECDSA adapters into the same
membership, governance, evidence, gossip and recovery worker. Source-level
parity tests do not establish live-chain readiness or approve a release.

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
