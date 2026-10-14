# XGRChain / Base — current XITA v3.1.5 execution order

## Infrastructure status

The current GitHub deployment manifest already documents XGRChain
ValidatorRegistry V3, ISM, transport, router deployers, Factory and
SourceRegistry. They must not be redeployed as a prerequisite for Base.

Base's EIP-2537 BLS verifier is also documented. The remaining
Base infrastructure is still pending, starting with ValidatorRegistry V3.

## Initial validator Genesis

The initial three Interchain validators have been explicitly selected in
`config/validators/initial.json`, referenced from each chain's
`bootstrap.json` as `genesisValidatorManifest`. This is intentionally a
subset of XGRChain PoS membership. The source node's
`ibft interchain bootstrap-proof` command creates a PUBLIC destination-domain
proof but does not register validators on Base.

For each Base Registry preview/prepare, Admin automatically validates
`validator-1.txt` through `validator-3.txt` from its configured public
evidence directory against the deployed Base verifier. It does not query
XGRChain staking or its Interchain Registry and does not require a
pre-exported PoS snapshot. The Registry constructor verifies the same PoPs
while installing setId 1.

## Finish the deployment

Run `./manage.sh update` then choose **Base → Chain fertig deployen**.
The sequence verifies dependencies, prompts MetaMask once for each missing
paid contract, records the confirmed contract receipts in GitHub and moves on.

After Base is complete, choose **Assets → XGR → Alle Schritte deployen**
to create/reuse the routers and register both XGR ⇄ Base directions.
A route registration is permissionless; it does not require a separate
validator vote. Finish with a real small-value bidirectional E2E test.

No transaction is signed or broadcast by preparing these documents.
