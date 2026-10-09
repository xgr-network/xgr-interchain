// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IXGRILNRegistry {
    struct RouteRecord {
        uint64 sourceChainId;
        uint32 sourceDomain;
        address gateway;
        address sourceRouter;
        address mailbox;
        address merkleTreeHook;
        address destinationRouter;
        uint256 validatorFeeWei;
        bool enabled;
    }

    function getRoute(uint32 destinationDomain, bytes32 routeId)
        external
        view
        returns (
            uint64 sourceChainId,
            uint32 sourceDomain,
            address gateway,
            address sourceRouter,
            address mailbox,
            address merkleTreeHook,
            address destinationRouter,
            uint256 validatorFeeWei,
            bool enabled
        );

    function governanceNonce(uint32 destinationDomain, bytes32 routeId)
        external
        view
        returns (uint64);
}
