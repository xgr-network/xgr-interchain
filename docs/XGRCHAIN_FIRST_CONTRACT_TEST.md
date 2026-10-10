# XGRChain-first contract test (v3.1.5)

We test first on **XGRChain mainnet (1643)** because native XGR is
available and considerably cheaper than ETH. This does **not** make failed
or duplicate mainnet deployments reversible.

## Phase 0: cost-free mainnet verification

After `./manage.sh update`, inspect
`GET /admin/api/xgr-preflight` or the first deployment section in Admin.
It checks chain ID, Hyperlane Mailbox/Merkle hook runtime code, current
gas price, and the **native compressed BLS verifier at 0x2040** by a
deliberately invalid ABI-encoded signature via read-only `eth_call`.
Expected result: 32-byte ABI false. The precompile legitimately returns
`0x` from `eth_getCode`; this is not evidence of absence.

**Passing the negative test DOES NOT prove positive BLS verification.**
A known-good positive compressed signature must also be tested. The
current XGR validator CLI `ibft interchain bootstrap-proof` produces
the **EIP-2537 uncompressed 256-byte** signature as `possessionProof`;
the 0x2040 native verifier requires a **96-byte compressed** signature.
Do not put 256-byte EIP proofs into the XGRChain manifest. A tested
conversion or safe exporter is needed before deployment, with the same
payload, validator address, chain ID 1643 and destination domain 1643.
Never copy validator private keys to the admin or GitHub.

## Remaining prerequisites for a real paid contract deployment

- Three matched validator public keys and valid domain-bound PoPs;
  finalized XGR PoS membership snapshot verified against the selected set
- Initial XGR-native source fee approved in `config/bootstrap/xgrchain.json`
- Reserve floor, max executor reimbursement, and per-validator balance
  approved as XGR wei; note the Registry constructor locks three reserves
- Trusted commit-pinned Foundry init/runtime code, simulated deployment,
  wallet approval and gas estimate
- Durable tx journal, on-chain receipt + codehash verification, automatic
  GitHub deployment records (all integrated, including crash recovery)
- Only then route creation, technical quorum and live transfer E2E

We deliberately do not expose a wallet transaction from this smoke test.
No assets are locked or bridged.
