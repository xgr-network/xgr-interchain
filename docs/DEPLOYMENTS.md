# XITA v3.1.5 — fresh prelaunch deployment

XGRChain (chain/domain 1643) is the mandatory routing hub. Spoke-to-spoke
transfers are two authenticated hops. Route registration is permissionless,
without validator vote or a separate activation transaction.

## Clean starting state

- All new XITA infrastructure has `components: {}` and `receiptPaths: []`.
- No old XITA receipt files, archives or deployed Registry V2 references remain
  in the current deployment configuration.
- Existing Hyperlane Mailbox and MerkleTreeHook are shared chain infrastructure;
  they are not deployments of the new XITA stack.
- The first XITA ValidatorRegistry deployment is V3. A fresh address is
  recorded only after a new finalized wallet transaction is verified.
- Previously broadcast transactions remain permanently visible on-chain,
  independently of this clean prelaunch repository.

## Deploy once per chain

1. Validate RPC, on-chain Hyperlane core and BLS positive/negative vectors.
2. Deploy the BLS verifier where required and ValidatorRegistry V3 with PoP.
3. Deploy ISM and the three reusable router deployment modules.
4. Deploy the small permissionless Factory and its SourceRegistry.
5. Deploy per-asset routers; each directed registration atomically creates a
   Gateway and FeeVault without validator voting.
6. Verify both directions, authenticated BLS checkpoint delivery, replay and
   recovery, source-native fees and Claim payouts.
7. Verify XGRChain's mandatory two-hop flow before public availability.

The wallet write-ahead journal is local server state, **not** part of Git.
Before a clean prelaunch reset, the operator must verify there are no pending
or unreconciled transactions. Never automatically erase a submitted intent
just to permit a new broadcast.
