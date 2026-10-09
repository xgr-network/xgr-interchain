// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRILNRegistry} from "../IXGRILNRegistry.sol";
import {MockLocalGovernanceRegistry} from "./MockLocalGovernanceRegistry.sol";

contract MockXGRILNRegistry is IXGRILNRegistry {
    MockLocalGovernanceRegistry public governanceRegistry;

    constructor() {
        governanceRegistry = new MockLocalGovernanceRegistry(1643);
    }

    mapping(uint32 => mapping(bytes32 => RouteRecord)) private routes;
    mapping(uint32 => mapping(bytes32 => uint64)) private nonces;

    function setRoute(
        uint32 destinationDomain,
        bytes32 routeId,
        RouteRecord calldata route
    ) external {
        routes[destinationDomain][routeId] = route;
    }

    function setGovernanceNonce(
        uint32 destinationDomain,
        bytes32 routeId,
        uint64 nonce
    ) external {
        nonces[destinationDomain][routeId] = nonce;
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
        )
    {
        RouteRecord storage route = routes[destinationDomain][routeId];
        return (
            route.sourceChainId,
            route.sourceDomain,
            route.gateway,
            route.sourceRouter,
            route.mailbox,
            route.merkleTreeHook,
            route.destinationRouter,
            route.validatorFeeWei,
            route.enabled
        );
    }

    function governanceNonce(uint32 destinationDomain, bytes32 routeId)
        external
        view
        returns (uint64)
    {
        return nonces[destinationDomain][routeId];
    }
}
