// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {XGRILNRegistry} from "../contracts/XGRILNRegistry.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract XGRILNRegistryTest is Test {
    uint64 internal constant SOURCE_CHAIN = 8453;
    uint32 internal constant SOURCE_DOMAIN = 8453;
    uint32 internal constant DESTINATION_DOMAIN = 1643;
    bytes32 internal constant ROUTE_ID =
        0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;

    MockLocalGovernanceRegistry internal verifier;
    XGRILNRegistry internal registry;

    function setUp() public {
        vm.chainId(SOURCE_CHAIN);
        verifier = new MockLocalGovernanceRegistry(SOURCE_DOMAIN);
        registry = new XGRILNRegistry(SOURCE_CHAIN, SOURCE_DOMAIN, address(verifier));
    }

    function testRouteKeyMatchesGoCanonicalVector() public {
        XGRILNProtocol.RouteKey memory key = XGRILNProtocol.RouteKey({
            sourceChainId: SOURCE_CHAIN,
            sourceDomain: SOURCE_DOMAIN,
            destinationDomain: DESTINATION_DOMAIN,
            routeId: ROUTE_ID
        });

        bytes memory expected =
            hex"5847525f494c4e5f524f5554455f56320000000000002105000021050000066baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        assertEq(XGRILNProtocol.encodeRouteKey(key), expected);
    }

    function testGovernanceFeeUpdateMatchesGoCanonicalVector() public view {
        XGRILNProtocol.GovernanceProposal memory proposal =
            XGRILNProtocol.GovernanceProposal({
                proposalType: 1,
                registry: 0x5555555555555555555555555555555555555555,
                setId: 7,
                nonce: 12,
                validUntil: 1900000000,
                route: XGRILNProtocol.Route({
                    key: XGRILNProtocol.RouteKey({
                        sourceChainId: 8453,
                        sourceDomain: 8453,
                        destinationDomain: 1643,
                        routeId: ROUTE_ID
                    }),
                    gateway: address(0),
                    sourceRouter: address(0),
                    mailbox: address(0),
                    merkleTreeHook: address(0),
                    destinationRouter: address(0),
                    validatorFeeWei: 50_000_000_000_000,
                    enabled: false
                })
            });

        bytes memory expected =
            hex"5847525f494c4e5f474f5645524e414e43455f56320000000000002105000021050000066baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa55555555555555555555555555555555555555550000000000000007000000000000000c00000000713fb300010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002d79883d2000";

        assertEq(XGRILNProtocol.encodeGovernanceProposal(proposal), expected);
    }

    function testGovernanceAddsRouteAndAdvancesOnlyItsNonce() public {
        XGRILNProtocol.GovernanceProposal memory proposal = _routeAdd(1);
        registry.applyGovernance(proposal, hex"03", hex"01");

        assertEq(registry.governanceNonce(DESTINATION_DOMAIN, ROUTE_ID), 1);
        assertEq(
            registry.governanceNonce(
                DESTINATION_DOMAIN,
                0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
            ),
            0
        );

        (
            uint64 chainId,
            uint32 domain,
            address gateway,
            address sourceRouter,
            address mailbox,
            address hook,
            address destinationRouter,
            uint256 fee,
            bool enabled
        ) = registry.getRoute(DESTINATION_DOMAIN, ROUTE_ID);

        assertEq(chainId, SOURCE_CHAIN);
        assertEq(domain, SOURCE_DOMAIN);
        assertEq(gateway, address(0x1111));
        assertEq(sourceRouter, address(0x2222));
        assertEq(mailbox, address(0x3333));
        assertEq(hook, address(0x4444));
        assertEq(destinationRouter, address(0x5555));
        assertEq(fee, 10);
        assertTrue(enabled);
    }

    function testRejectsDirectSpokeToSpokeRouteWithValidQuorum() public {
        XGRILNProtocol.GovernanceProposal memory proposal = _routeAdd(1);
        proposal.route.key.destinationDomain = 137; // Base -> Polygon is forbidden
        vm.expectRevert(XGRILNRegistry.InvalidProposal.selector);
        registry.applyGovernance(proposal, hex"03", hex"01");
        assertFalse(registry.exists(137, ROUTE_ID));
        assertEq(registry.governanceNonce(137, ROUTE_ID), 0);
    }

    function testRejectsSameDomainRouteWithValidQuorum() public {
        XGRILNProtocol.GovernanceProposal memory proposal = _routeAdd(1);
        proposal.route.key.destinationDomain = SOURCE_DOMAIN;
        vm.expectRevert(XGRILNRegistry.InvalidProposal.selector);
        registry.applyGovernance(proposal, hex"03", hex"01");
        assertFalse(registry.exists(SOURCE_DOMAIN, ROUTE_ID));
    }

    function testRejectsStaleRouteNonce() public {
        registry.applyGovernance(_routeAdd(1), hex"03", hex"01");

        XGRILNProtocol.GovernanceProposal memory update = _feeUpdate(1, 25);
        vm.expectRevert(
            abi.encodeWithSelector(
                XGRILNRegistry.StaleGovernanceNonce.selector,
                uint64(2),
                uint64(1)
            )
        );
        registry.applyGovernance(update, hex"03", hex"01");
    }

    function testFeeUpdateIsRouteSpecific() public {
        registry.applyGovernance(_routeAdd(1), hex"03", hex"01");
        registry.applyGovernance(_feeUpdate(2, 25), hex"03", hex"01");

        (,,,,,,, uint256 fee,) = registry.getRoute(DESTINATION_DOMAIN, ROUTE_ID);
        assertEq(fee, 25);
        assertEq(registry.governanceNonce(DESTINATION_DOMAIN, ROUTE_ID), 2);
    }

    function testRejectsHistoricalQuorumAfterValidatorSetRotation() public {
        // A completed quorum for set 7 must not control mutable route
        // governance after a membership transition to set 8.
        XGRILNProtocol.GovernanceProposal memory oldProposal = _routeAdd(1);
        verifier.setSetId(8);
        vm.expectRevert(XGRILNRegistry.InvalidGovernanceQuorum.selector);
        registry.applyGovernance(oldProposal, hex"03", hex"01");
        assertFalse(registry.exists(DESTINATION_DOMAIN, ROUTE_ID));
        assertEq(registry.governanceNonce(DESTINATION_DOMAIN, ROUTE_ID), 0);
    }

    function testRejectsInvalidGovernanceQuorum() public {
        verifier.setResult(false);
        vm.expectRevert(XGRILNRegistry.InvalidGovernanceQuorum.selector);
        registry.applyGovernance(_routeAdd(1), hex"03", hex"01");
    }

    function _routeAdd(uint64 nonce)
        internal
        view
        returns (XGRILNProtocol.GovernanceProposal memory)
    {
        return XGRILNProtocol.GovernanceProposal({
            proposalType: 2,
            registry: address(registry),
            setId: 7,
            nonce: nonce,
            validUntil: uint64(block.timestamp + 5 minutes),
            route: XGRILNProtocol.Route({
                key: XGRILNProtocol.RouteKey({
                    sourceChainId: SOURCE_CHAIN,
                    sourceDomain: SOURCE_DOMAIN,
                    destinationDomain: DESTINATION_DOMAIN,
                    routeId: ROUTE_ID
                }),
                gateway: address(0x1111),
                sourceRouter: address(0x2222),
                mailbox: address(0x3333),
                merkleTreeHook: address(0x4444),
                destinationRouter: address(0x5555),
                validatorFeeWei: 10,
                enabled: true
            })
        });
    }

    function _feeUpdate(uint64 nonce, uint256 fee)
        internal
        view
        returns (XGRILNProtocol.GovernanceProposal memory)
    {
        return XGRILNProtocol.GovernanceProposal({
            proposalType: 1,
            registry: address(registry),
            setId: 7,
            nonce: nonce,
            validUntil: uint64(block.timestamp + 5 minutes),
            route: XGRILNProtocol.Route({
                key: XGRILNProtocol.RouteKey({
                    sourceChainId: SOURCE_CHAIN,
                    sourceDomain: SOURCE_DOMAIN,
                    destinationDomain: DESTINATION_DOMAIN,
                    routeId: ROUTE_ID
                }),
                gateway: address(0),
                sourceRouter: address(0),
                mailbox: address(0),
                merkleTreeHook: address(0),
                destinationRouter: address(0),
                validatorFeeWei: fee,
                enabled: false
            })
        });
    }
}
