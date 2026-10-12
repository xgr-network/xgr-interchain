# XITA v3.1.5 - Address binding and fresh transport audit (12 October 2026)

## Findings

The currently deployed XGRChain ValidatorRegistry V3 and destination ISM are
documented and immutable: their addresses do **not** need to be redeployed.

The existing generic deployer forwards:
- BLS verifier address to ValidatorRegistry V3;
- validatorRegistry to ISM;
- validatorRegistry, Mailbox, MerkleTreeHook, ISM, fee and all three router
  deployers to the permissionless Factory;
- Factory-owned SourceRegistry to the canonical TokenRouter constructors;
- TokenRouter pair to each directed Gateway/SourceRegistry;
- source ValidatorRegistry, Gateway and Route ID into each FeeVault.

Factory and SourceRegistry constructor getter checks exist in
`services/admin/chain-reconcile.mjs`. Factory now refuses missing code,
foreign-domain Mailboxes, hooks belonging to another Mailbox, or an ISM
bound to a different validator Registry/domain.

## Transport blocker: concrete implementation and follow-up gates

`contracts/XITAFreshTransportV315.sol` introduces a fresh, **atomic**
deployment bundle wrapping the pinned Hyperlane 11.1.0 Mailbox and Merkle
Tree Hook, with a zero-fee required ProtocolFee Hook. It initializes the
Mailbox *within the creation transaction* using the existing destination
ISM. The bundle itself permanently owns Mailbox configuration and exposes
no function to retarget it.

**This commit intentionally does NOT authorize the bundle in the Admin
wallet deploy sequence yet.** The existing deployable Factory remains
fail-closed while `infrastructure.hyperlane` is empty.

Prior to enabling a transport transaction in the Admin, implement:
1. A specific signed-wallet `transportBundle` creation task *after* ISM
   with a commit-pinned runtime artifact.
2. Independently verify the bundle's immutable ISM/domain; Mailbox
   `localDomain`, `owner`, `defaultIsm`, `defaultHook`,
   `requiredHook`, and Merkle hook `mailbox` plus actual runtime code.
3. Atomically record bundle, child Mailbox, Hook, and required Hook
   addresses and verified receipts in `deployments/chains/<chain>.json`.
   Never infer an existing legacy Mailbox from a config file.
4. Populate the generic infrastructure inventory from **those receipts**;
   bind the Factory to the fresh Mailbox/Hook; verify all Factory getter
   addresses independently against the documented transport and ISM.
5. Exercise real positive/negative message BLS proofs, Merkle checkpoint
   handling, replay and both bridge directions before opening transfers.

`XITA_SPEC_V315.md` still identifies live mainnet acceptance as incomplete.
Do not submit a Factory creation transaction until these gates are closed.
