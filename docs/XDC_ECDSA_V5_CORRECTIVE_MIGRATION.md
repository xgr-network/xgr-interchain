# XDC Mainnet ECDSA V5 corrective integration — release blockade

**Status: DRAFT; NOT DEPLOYABLE; DO NOT ENABLE XDC TRANSFERS.**
This document is deliberately separate from the historical XDC V4 deployment record.
The old on-chain contracts and immutable GitHub receipt data must remain auditable.

## Invariant: same validator lifecycle as existing BLS V3 destinations

XDC has an **independently selected destination validator set**; participation in XGR PoS is
only a validator eligibility prerequisite, not automatic admission to each bridge chain.
The operator chooses membership with `xgrchain ibft interchain set-active --chain xdc --active true|false`.
The destination contract enforces all existing V3 economic invariants with ECDSA
rather than BLS proof formats:

1. Three **explicitly selected** genesis validator addresses with **destination-bound**
   ECDSA PoP; contract construction atomically credits and locks one native XDC
   reserve per genesis validator and begins at destination setId 1.
2. A single-validator ADD requires a signed old-set quorum, a verifiable
   ECDSA possession proof from the incoming validator, native XDC reserve
   >= minimum, and an unexpired chain+registry+set-bound transition.
3. A single-validator REMOVE requires the same quorum and rejects removal of
   the final member; it credits a capped executor reimbursement and a
   remainder refund without external payment during consensus mutation.
4. Active validators may top up their own reserves and claim credited
   refunds. Historical validator-set snapshots and fee-recipient indices
   remain immutable, so an exit does not erase previously earned fees.
5. Membership epochs, fee updates and message authorizations each use
   dedicated replay-resistant signature payloads. A validator may join
   another destination without joining XDC.

## What changes cryptographically

- ECDSA secp256k1 signature recovery replaces BLS aggregate pairing verification.
- 65-byte low-S r/s/v signatures are attached in canonical signer bitmap order.
- `getValidatorSetForVerification()` returns the ordered ECDSA validator
  **addresses encoded as bytes**, not 48-byte BLS public keys.
- All source evidence, on-chain registry binding, source fee governance,
  recovery semantics and CLI instructions still require independent integration
  tests; an ABI-compatible getter is not proof that the node is ready.
- The v5 ECDSA validator set commitment is destination-specific and distinct
  from the XGR Interchain chain's set; it must not use a global XGR root.

## Existing contracts and replacement scope

The receipt-pinned V4 `validatorRegistry` (0x70f5752326735b31641f21d174ba035e904db93c)
cannot be modified or funded into V5. Its immutable genesis set and missing
reserve lifecycle make it unsuitable for production.

Stage a replacement V5 ValidatorRegistry, destination ISM, new transport
(and its Mailbox/Hook children), new Factory and its SourceRegistry, plus a new
ExecutionGateway bound to the new SourceRegistry. Stateless ECDSA Verifier and
three RouterDeployer instances **may** be reused only after verifying their
runtime fingerprints, constructor bindings and security model. Do not mutate
old receipt files or silently point a partially upgraded chain manifest at
a mixture of old and new immutable dependency graphs.

The Admin requires an explicit **versioned replacement workflow**, not the
ordinary missing-components batch. Historical V4 receipts must be retained
alongside versioned V5 receipts. A new canonical chain binding may be
published only after all V5 deployment receipts, matching immutable bytecode,
on-chain constructor getters and finality observations are verified.

## Prerequisites before any XDC wallet signing

- Decide, record and independently verify exactly which three validators
  bootstrap the XDC destination. No automatic XGRChain registry membership copy.
- Explicitly approve native XDC minimum deactivation reserve, max executor
  reimbursement, genesis reserve per validator and initial native source fee;
  all four positive values are required. Do not reuse a symbolic 1-wei placeholder.
- Collect public per-validator ECDSA bootstrap proofs via the validator's
  local secrets manager; never export validator private keys.
- Implement and verify the node's separate ECDSA quorum, membership,
  CLI opt-in, source-fee governance and durable recovery/finality handling.
- Complete regression tests for all existing BLS chains, adversarial lifecycle
  test vectors and an independent security delta audit.

## Do not confuse milestones

- V5 registry source code in a draft PR is **not** a signed or final XDC release.
- A passing Solidity CI is **not** a secure working validator worker.
- A new contract deployment is **not** a route activation.
- No new light release, on-chain migration or XDC token transfer until all
  entry and exit economics, signer/CLI behavior and receipts are complete.
