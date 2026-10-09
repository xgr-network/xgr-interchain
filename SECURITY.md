# Security Policy

## Scope

This repository contains XGR Interchain contracts, deployment manifests, native relayer runtime and operational documentation.

Security-sensitive components include:

- XGR Interchain validator registries,
- XGR native Interchain ISMs,
- BLS verification,
- Hyperlane routing and aggregation configuration,
- Warp lock/mint and burn/unlock routers,
- native relayer proof construction and submission logic,
- deployment and runtime configuration.

XGRChain consensus itself is maintained in the separate `xgr-node` repository.

## Reporting a vulnerability

Please report suspected security vulnerabilities privately to:

    security@xgr.network

Do not open a public GitHub issue for an unpatched vulnerability.

Include, where possible:

- affected component and network,
- contract address or file path,
- reproduction steps,
- expected and observed behavior,
- impact assessment,
- transaction/message IDs,
- suggested mitigation.

Do not include private keys, seed phrases or other secrets in a report.

## Operational state

A deployed route is not automatically a publicly available route.

Pause flags, router direction gates, validator quorum health and relayer submission state are operational controls and may change independently from repository deployment status.

For current deployment inventory see:

    deployments/
    docs/DEPLOYMENTS.md

## Security model

The native relayer is not a trust anchor. It can delay delivery but cannot manufacture a valid XGR BLS quorum attestation.

Interchain validator membership changes require the configured XGR Interchain quorum. Validator membership is destination-scoped; checkpoint attestations are route-scoped.

Destination security uses the route-aware XGRILNInterchainISMV2 with canonical route and BLS quorum verification. Any further ISM composition must be independently verified before deployment.

## Supported code

Security reports should target the current `main` branch and current deployed contracts. Identify the affected XETA deployment, chain, code version and transaction evidence when reporting.
