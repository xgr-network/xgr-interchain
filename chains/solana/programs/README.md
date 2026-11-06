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
