# Current Direct-BLS architecture

The current source-based reference is maintained in the public XGR documentation.

- [System context, individual contracts and caller authority](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Context_and_Contracts.md)
- [Architecture and multiple routes](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Overview.md)
- [Exact wire format and trust boundaries](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Security_Model.md)
- [Assets and public Factory registration](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Asset_Bridge.md)
- [Contracts, source fees and claims](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Contract_Reference.md)
- [Executable transfer without managed relayer](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md)
- [Complete Interchain CLI](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_CLI.md)
- [Complete Interchain RPC](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_RPC.md)
- [Validator runtime and retention](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Validator_Runtime.md)
- [Optional services and HTTP APIs](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Services.md)
- [Receipt-backed deployment inventory](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Deployment_Reference.md)
- [Source map and verification scope](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Source_Map.md)

Public Factory registration and authenticated destination execution are permissionless on supported physical networks. The commercial quote signer, website, sponsor, indexer and managed relay are optional. Required source evidence, validator quorum, protocol fees, gas and chain access remain dependencies. A source dispatch is recovered using its original hash/message ID; do not duplicate principal movement after a service outage.
