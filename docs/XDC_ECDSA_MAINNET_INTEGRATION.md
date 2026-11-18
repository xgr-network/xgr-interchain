# XDC mainnet ECDSA integration – draft security and deployment gates

**Status:** Deployment-only feature branch; awaiting CI, code review, merge and Admin software update. NO TOKEN ROUTES / NO MAINNET VALIDATOR SIGNING.
**Network:** XDC mainnet chain ID/domain 50, XGR mainnet hub chain ID/domain 1643. No Apothem, no alternative XGR validator network.

## Architecture and immutable boundaries

- Existing XGR, Base, Arbitrum, Optimism, BSC Direct-BLS contracts, fees, routes, codecs, P2P votes, deployments and validator identities MUST remain unchanged.
- The same active XGR-mainnet validators, identified by their already-existing consensus ECDSA addresses, are the only authorized ECDSA signers. Neither XITA backend nor an XDC contract operator may appoint a separate set.
- ECDSA destinations use **XGRInterchainECDSAVerifier**, **XGRInterchainECDSAValidatorRegistry**, **XITADirectECDSAISM** and **XITADirectECDSAProtocol**. Other generic EVM Factory/Router/Mailbox/Gateway/FeeVault components may be reused only after direct ABI/bytecode and transaction-level validation.
- The ECDSA signature payload has the same canonical 268-byte Direct message tail as BLS but its own `XITA_DIRECT_MESSAGE_ECDSA_V1` prefix. The destination ISM and destination registry are signed. Each selected signer contributes a canonical 65-byte (r,s,v) signature with low-S and v=27/28.
- Bitmap is in the exact pinned destination registry order. 2/3 means `ceil(2*n/3)`, not weighted by stake. Reject high bitmap bits, duplicate members, mismatched lengths, wrong sets and any message/route/fee tampering.
- Current-set checking is mandatory on message delivery. Historical snapshots exist exclusively for auditability and fee claims.

## Bootstrap truth boundary (CRITICAL)

The ECDSA registry is deployed with an immutable **genesis XGR validator-set commitment** and XGR set ID. The constructor rejects other chain IDs, missing root, missing verifier and non-mainnet destination.

That root is a **deployment-time assertion**, not a cryptographic proof of XGR consensus. Initial self-signatures can prove that the supplied keys are controlled, but cannot prove the root is the canonical XGR mainnet root. A trusted external source-state verification process is required before any activation:

1. Independently confirm canonical XGR chain 1643, finality and the actual XGR ValidatorRegistryV3 receipt-pinned address, set ID, ordered validator addresses and compressed BLS public keys from the XGR mainnet. Do not take an arbitrary user-facing RPC field or JSON file as proof.
2. Recompute `XGR_INTERCHAIN_SET_V2` commitment from the exact validator order and BLS keys and match XGR on-chain `validatorSetCommitment(setId)`.
3. Reconcile the same membership with XGR PoS eligibility, the established validator identities and the existing ECDSA public keys. Record immutable source block hash, registry address, commitment and independently checked witness evidence.
4. Deploy the new verifier and registry via wallet-signed Admin transaction with receipt and runtime-bytecode verification. Match constructor arguments to evidence and reject any unrelated registry or duplicate deployment.
5. Collect cryptographically valid 2/3 ECDSA bootstrap signatures from the **canonical** set, domain-bound to XDC 50, the exact registry address, XGR root and epoch. Only then call `activateBootstrap`.
6. The registry exposes no owner/admin setter, rescue, bypass or externally controlled signer list. After genesis, only current-set 2/3-quorum transitions can change membership. New validators additionally sign a possession proof.

XDC cannot query XGR consensus trustlessly using the current contracts. Therefore the externally supplied root must be independently verified and deployment/activation rigorously receipt-pinned. A later fully verified XGR light-client adapter would strengthen this boundary but is not implied by the current design.

## Mandatory remaining implementation

1. Build the XGR node's **real ECDSA signing pipeline** over the existing evidence-verified Interchain worker, never over arbitrary RPC-provided signing bytes. Re-check XGR sync, source receipt/fees/finality, canonical route/ISM/registry, current set, destination delivered status, XGR validator eligibility and set epoch immediately before signing. Persist votes before gossip and support crash recovery and rotation re-attestation.
2. Build scheme-separated ECDSA P2P votes, quorum aggregation and archival RPC with canonical destination order; do not reuse BLS vote archives or BLS gossip message types.
3. Implement XDC mainnet source-finality adapter with at least two independently operated full receipt/state witnesses, chain ID 50 and independently demonstrated finality semantics. Fail closed on unsupported `safe`/`finalized` methods; never guess a confirmation depth or silently downgrade to `latest`.
4. Verify XDC mainnet native asset, ERC-20, chain gas and EVM precompiles. Verify factory/registry/ISM/transport/router construction arguments and fee-vault historical claims; rebuild and seal independently verifiable runtime artifacts.
5. Add source fee governance ECDSA quorum, ECDSA membership transitions and destination contract ABI/registry readers to node/Admin/recovery without changing existing BLS routes. Mainnet XDC -> XGR messages are still authorized by the existing XGR destination **BLS** ISM.
6. Execute adversarial Foundry test matrix: forged validator set, rogue key, replay, duplicate/high bitmap bits, low-S, wrong chain/ISM/registry, expired/stale set, missing proof, self-referential bootstrap, cross-asset unlock, source finality reorg, fee mismatch, stuck relay, restarts and XGR validator join/remove.
7. Pass the full existing XGR-node and xgr-interchain CI suites, independent delta audit, multi-validator mainnet rollout policy and SMALL controlled XGR <-> XDC native/token transaction evidence. No existing deployment migration.
8. Until all transfer release gates pass: NO XDC mainnet asset route, bridge, token mint/release, validator signer activation or production transfer. Infrastructure-only deployments may require wallet-authorized XDC gas AFTER independent source-commitment verification, reviewed CI and explicitly approved contract artifacts; they do not grant protocol activation.

## Code and current limited coverage

- `contracts/XGRInterchainECDSAVerifier.sol`: stateless low-S, canonical bitmap, ordered 2/3 verification.
- `contracts/XGRInterchainECDSAValidatorRegistry.sol`: immutable genesis root, authenticated activation, quorum-governed epoch updates and immutable historical recipient snapshots.
- `contracts/XITADirectECDSAISM.sol`: direct route, header and message identity verification, current destination set check.
- `contracts/XITADirectECDSAProtocol.sol`: distinct ECDSA domain and canonical payload.
- `test/XITAECDSAMainnet.t.sol`: Foundry unit cases. An offline or CI passing test is not live transaction authorization.

The related node branch `xgr-node:feature/xdc-ecdsa-mainnet` includes policy isolation and an offline ECDSA codec/verifier but intentionally NO live signer or activated XDC policy.

## Deployment-only Admin milestone

After this PR is independently reviewed, all CI gates are green, it is merged into GitHub main, and the Admin checkout/compiled seals are refreshed, the existing **Chains & Onboarding** UI can deploy XDC network components in dependency order using its wallet-assisted journal/reconcile workflow. No browser may supply arbitrary constructor bytes or an alternative validator-root; every transaction uses a main-commit-sealed artifact and on-chain verified predecessor. Network ID/domain 50, ECDSA verifier, XGR-root-pinned registry, ECDSA ISM, fresh transport and EVM factory are required. The ECDSA registry is initially **unactivated** (setId = 0); deployment does not collect or request validator private keys, and does not create transferable asset routes.

The XGR bootstrap snapshot is based on the receipt-pinned XGR mainnet Interchain RegistryV3 active set and both configured XGR RPCs at one common recent source block. This is *two-endpoint consistency verification*, **not** a trustless cross-chain light-client proof or proof of independently operated providers. On an RPC disagreement, inability to query source state or missing destination `finalized` support, Admin fails closed. A deployment receipt is only published after canonical receipt, runtime-code and immutable-constructor checks succeed. Full asset routes require a separate release and audit.
