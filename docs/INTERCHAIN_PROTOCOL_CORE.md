# Shared contract architecture — BLS V3 reference

`XGRInterchainValidatorRegistryV3` is the behavioral reference. The shared
core is extracted from the current V3 implementation and the corresponding
ECDSA lifecycle. The public V3 contract, V5 ECDSA contract and direct ISMs keep
their established external ABI and signature encodings.

## A single registry state machine

`XGRInterchainRegistryCore` owns:

- Explicit, independently selected destination membership and canonical order.
- Epoch/deadline checks and one set-ID increment for each successful ADD/REMOVE.
- Funded activation reserve, top-ups, last-validator protection and swap/pop.
- Removal reimbursement capped by the configured cap and the remaining reserve.
- Pull-based executor and validator claims; removal makes no payout call.
- Immutable ordered snapshots, set commitments and historical fee recipients.
- The common quorum interface and `ceil(2*n/3)` threshold.

Each public membership entry records `gasStart` before it allocates or encodes
adapter data, preserving the V3 reimbursement measurement boundary. The
common core performs settlement using that measurement.

Thin BLS/ECDSA implementations supply key representation and uniqueness,
proof-of-possession encoding, membership signing bytes, snapshot verification
keys, commitments and cryptographic verification. They cannot bypass the
common state machine or substitute an origin-chain roster.

V3's mandatory post-genesis possession registration and compressed/EIP-2537
key-equivalence checks remain in its adapter. ECDSA retains recovered-address
identity, registry-bound membership/join proofs, low-S signatures and ordered
65-byte signature packing. The existing V5 bounds (3–64 genesis members,
maximum 64 active members) are preserved; the common core still permits
removal down to one member, as both prior implementations did.

## A single direct-message policy

`XITADirectISMCore` checks current epoch, full authorization fields, message
header identities, message hash and the recipient router's reverse route.
Only then does it ask the registry to verify the quorum. The BLS and ECDSA
wrappers choose the established signing domain and retain their constructor
constraints. They do not implement separate message policies.

`XITADirectProtocol` contains one validated fixed-field encoder. The ECDSA
protocol delegates to that encoder with its own explicit domain. All signed
fields, including source registry/gateway/router/mailbox, fee, message ID,
destination ISM and destination registry, remain bound to the authorization.

Historical registry verification does not grant historical delivery rights.
The direct ISM requires the current set. Rotation requires re-attestation of
the existing source message, never another source lock.

## Shared recovery consumer

Both receipt-first and already-attested recovery use the same direct codec
and archive checks. The bound destination registry's verifier format selects
BLS compressed (1), BLS EIP-2537 (2), or ECDSA (3). A peer archive cannot select
a different scheme. ECDSA's fixed bitmap is checked against a validator count
read for the same epoch, and signatures retain canonical registry order.

Recovery still verifies the route, current registry quorum, destination ISM
and `Mailbox.process.staticCall`, then rechecks epoch and delivery state.
Receipt-first recovery retains its source finality, event and fee-allocation
evidence checks. Both produce the existing unsigned transaction preparation;
adding a codec does not broadcast a transaction or activate a chain.

## Compatibility and review

The existing `IXGRInterchainValidatorSetV2` interface name is retained for ABI
compatibility; the architectural reference for this work is **V3**.

BLS membership and bootstrap domains, direct-message domain, payload bytes,
bitmap encoding, key formats, ABI signatures/output names and pull-payment
semantics are preserved. ECDSA keeps its explicit domains and bitmap codec.
Tests compare the V3 fixed encodings, paired lifecycle behavior, historical
sets, reserve/claim conservation, more-than-eight-validator bitmaps and direct
policy rejection cases with real ECDSA proofs.

The Solidity refactor changes newly compiled bytecode and internal storage
layout. These are constructor-deployed contracts, not proxy upgrades. Existing
on-chain contracts are untouched; ABI/wire compatibility does not mean
bytecode identity or a new audit approval. New deployment artifacts and
receipts must be built and reviewed through the normal deployment workflow.

The structural check `tools/assert-xita-direct-clean.mjs` requires both registry
wrappers and both ISM wrappers to use their common cores. Existing source and
deployment checks remain enabled. The XDC Admin readiness gate and empty
deployment bindings are retained. This refactor creates no deployment, release
or transfer route.
