# H-01 — External RPC source evidence: implementation and residual risks

**Purpose:** Evidence index for independent reviewers, **not an advance severity determination or proof of deployment**. Historical H-01 remains High in the original frozen reports; the next auditor independently determines current residual severity.

## Live source design visible in `xgr-network/xgr-node` / `XGR3.0`

- `interchain/config.go`: Base 8453 and Arbitrum 42161 each list four HTTPS RPC endpoints and per-endpoint operator labels. The reviewed code labels official RPC, Tenderly, PublicNode, and dRPC separately. These are configured **claims**, not third-party-verified ownership/upstream attestation.
- `interchain/evm/rpc_evidence_quorum.go`: `GetQuorumVerifiedDirectILNOperation` requires **two distinct configured operator IDs** independently supplying matching finality-qualified evidence. Entire receipt/route/fee checks execute against one provider per observation; evidence from different providers is not spliced. `sameILNWitness` compares canonical source block hash, transaction hash, log index, message ID, route ID, block number, destination domain, validator fee, exact message bytes and route snapshot.
- `interchain/runtime/iln_direct_signing.go`: External source messages pass through the quorum verifier before the signing flow. XGRChain (1643) instead uses `VerifyNativeXGROperation` against the validator's local committed IBFT state.
- `interchain/evm/finality.go`: Base and Arbitrum require the `safe` head; unsupported `safe` or mismatched canonical hashes fail closed. **Safe is not identical to Ethereum L1 finalization** and retains sequencer/settlement assumptions.

## Existing source tests — inspect and rerun, not proof of production
- `interchain/evm/rpc_evidence_quorum_test.go`: compares receipt, fee, block hash and message/snapshot mismatches.
- `interchain/evm/rpc_evidence_quorum_integration_test.go`: same-operator failover does not count twice; conflicting providers and only one operator fail closed.
- `interchain/evm/finality_test.go`: missing `safe` head and conflicting canonical block fail closed.
- `interchain/config_test.go`: pinned chain IDs and policy checks.

## Concrete current provider labels

| Source | Compiled RPC URLs / claimed operator groups |
| --- | --- |
| Base | mainnet.base.org (official), gateway.tenderly.co/public/base (Tenderly), base-rpc.publicnode.com (PublicNode), base.drpc.org (dRPC) |
| Arbitrum | arb1.arbitrum.io/rpc (official), arbitrum-one-rpc.publicnode.com (PublicNode), arbitrum.gateway.tenderly.co (Tenderly), arbitrum.drpc.org (dRPC) |
| XGRChain | No remote RPC witness in the Direct-BLS source-signing path; local committed IBFT source state |

## Threat-boundary improvement and unproven assumptions

The implementation substantially reduces the ability of **one faulty or malicious external RPC service** to induce signing of a false source operation. It does not by itself establish a cryptographic remote-chain light-client proof, protect against **two colluding/correlated upstream operators** producing matching false observations, or guarantee final Ethereum settlement of an L2 safe block. A provider operating an aggregator or shared upstream may not represent an independent failure domain. Likewise, evidence from two operator labels is not automatically two independent physical infrastructures; audit this explicitly. Verify that active validators run the audited release, and that no signing path bypasses quorum. Verify 2-of-N safety with byzantine, stale, equivocation, split view, outage, repeated 429, and false route/fee receipt tests.

## Independent reclassification standard

Historical H-01 is immutable. An auditor may independently support **Medium residual risk** only if the implemented witness constraints, true operator/upstream independence, fault injection, deployed binaries, credible exploit prerequisites and remaining scope/impact jointly justify it. A remaining High finding must stay High if the evidence does not substantiate reduction. Record exact commit, active binary, test logs, RPC ownership/upstream substantiation, risk-owner acceptance, monitoring and re-evaluation triggers. No predetermined score or requested downgrade.

## Primary historical references
- `audits/2026-10-24-xita-direct-bls-v1.0.0/`
- `audits/2026-10-25-xita-direct-bls-reassessment-v2.0.0/`

This document is a reviewer roadmap and must be validated from the frozen source under audit.
