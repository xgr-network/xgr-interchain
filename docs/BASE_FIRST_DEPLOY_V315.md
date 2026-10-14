# Base first deployment — XITA v3.1.5

Base chainId/domain: `8453`. XGRChain hub: `1643`.
The initial three Interchain validators are **manually selected** in
`config/validators/initial.json` and referenced by
`config/chains/base/bootstrap.json` as `genesisValidatorManifest`.
This is a fixed initial membership list, not the full XGRChain PoS set.
No other Registry or finality snapshot is needed to create it.

## Actual GitHub deployment status

- XGRChain: the v3.1.5 chain infrastructure, including ValidatorRegistry V3,
  ISM, transport, router deployment modules, Factory and SourceRegistry,
  is already documented in `deployments/chains/xgrchain.json`.
- Base: only the fresh EIP-2537 BLS verifier is documented in
  `deployments/chains/base.json`. The ValidatorRegistry and the remaining
  reusable infrastructure still require wallet transactions.
- The XGR-to-Base and Base-to-XGR asset routes remain to be deployed.

## Operator sequence

1. Run `./manage.sh update`, connect the deployment wallet, and open
   **Base → Chain fertig deployen** in the Admin UI.
2. The Admin reads the three existing Base-domain public CLI proofs from its
   configured `<public-evidence-dir>/base/validator-1.txt` through
   `validator-3.txt`. It validates each against the deployed Base BLS
   verifier using read-only `eth_call`. No manual precheck or PoS RPC.
3. For Registry V3, the signed constructor includes the fixed approved
   addresses, public BLS keys, proofs and the native ETH reserve deposit:
   minimum 0.00005 ETH, executor ceiling 0.00003 ETH,
   initial 0.0001 ETH per validator (0.0003 ETH total for three).
   Gas is additional and is shown in MetaMask.
4. The UI selects the correct MetaMask chain, signs one transaction per
   missing step, verifies its receipt and publishes the canonical GitHub
   record. It then continues to the next missing chain component.
   An explicitly rejected/unsent draft is not a permanent recovery gate.
   A genuine in-flight broadcast is still protected from double submission.
5. Once Base infrastructure is documented, use
   **Assets → XGR → Alle Schritte deployen** to create the remaining
   token routers and register both directed XGR ↔ Base routes.
   Final E2E transfers and BLS message delivery must be tested separately.

There is no backend wallet or private validator key upload. The UI proof
verification is automatic; the contract constructor independently checks
the PoPs again. Each paid deployment needs a MetaMask confirmation.
