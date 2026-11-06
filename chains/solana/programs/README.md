# Native Solana program suite

Reserved for auditable Rust/SVM implementation, not Solidity/EVM bytecode.

The program suite will implement Mailbox, ValidatorRegistry, Direct-BLS
verification, SourceRegistry, Factory, route-specific FeeVault and guarded
SPL collateral/synthetic routers. The XGRChain counterpart will be a separate
Solana-compatible Solidity Factory/Router/ISM/Registry family; the existing
EVM family must not change.

Before any deployable `.so` is accepted, implement and test:
1. Protocol-domain-separated exact message and route encoding, including
   full 32-byte Solana accounts and 20-byte XGR EVM addresses.
2. Current validator-set BLS quorum, proof-of-possession and replay protection.
3. Source lock/burn + fee allocation atomicity and destination mint/unlock.
4. Independent unsigned execution, account constraints, signer/authority
   boundaries, rent and token decimal conversion.
5. Pairing/hash-to-curve compute-unit measurements and adversarial vectors.

There is no executable program in this directory yet. Do not substitute an
unreviewed standard bridge or a trusted relayer for XITA Direct-BLS.


## Immutable permissionless program invariants

- All public deployments MUST have no upgrade/close authority.
- Wrapped SPL mint authority is a **route PDA** controlled exclusively by
  independently verified inbound message proof; it is not revoked because
  legitimate bridge minting must continue. Wrapped mint freeze authority is
  None. Original SPL mint authorities belong to their original projects.
- SPL token vaults are held by program PDAs, not any service/operator wallet.
- New assets and routes are registered by any actor satisfying protocol
  prerequisites; no allowlist, manual approval or unilateral pause/fee setter.
- Changes in validator membership follow authenticated existing XGR quorum
  rules; no separate GmbH validator registry owner.
- No mutable configuration must permit redirection of escrow, verifier,
  route identity, recipient or mint authority by an operator.
- A security fix requires new immutable deployment and voluntary adoption;
  no silent upgrade or forced migration of an existing immutable route.


## Required EVM-equivalent behavior

The single SVM program may contain multiple logical modules. It MUST provide
all EVM-equivalent operations and invariants: permissionless creator-owned
routers; immutable append-only route enrollment without a validator vote;
one mandatory XGRChain hop per directed route; current-set BLS 2/3
destination verification and quorum-governed membership changes; bootstrap
source-native fee and subsequent BLS quorum fee changes; gateway-atomic
principal movement + source fee; epoch-scoped FeeVault pull claims; inbound
replay protection; independent execution and optional commercial UI-only
service. Exact asset IDs, 32-byte identities and decimal conversions are
chain-specific codec adaptations, not alternate protocol governance.
