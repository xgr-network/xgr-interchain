// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract XITATopologyMailboxMock {
    uint32 public immutable localDomain;
    constructor(uint32 domain) { localDomain = domain; }
}

contract XITAXGRHubTopologyV315Test is Test {
    uint64 private constant HUB = 1643;
    uint64 private constant BASE = 8453;
    uint64 private constant POLYGON = 137;
    address private constant A = address(0xA11CE);
    address private constant B = address(0xB0B);

    function route(
        uint64 sourceChain, uint32 sourceDomain,
        uint64 targetChain, uint32 targetDomain
    ) external pure returns (bytes32) {
        bytes32 asset = XGRILNProtocol.assetIdV315(HUB, address(0), 0);
        return XGRILNProtocol.routeInstanceIdV315(
            asset, sourceChain, sourceDomain, targetChain, targetDomain, A, B
        );
    }

    function testBothHubTransferDirectionsAreAllowed() public {
        bytes32 outbound = this.route(HUB, uint32(HUB), BASE, uint32(BASE));
        bytes32 inbound = this.route(BASE, uint32(BASE), HUB, uint32(HUB));
        assertTrue(outbound != bytes32(0));
        assertTrue(inbound != bytes32(0));
        assertTrue(outbound != inbound);
    }

    function testHubAlsoConnectsToOtherEVMChains() public {
        assertTrue(this.route(HUB, uint32(HUB), POLYGON, uint32(POLYGON)) != bytes32(0));
        assertTrue(this.route(POLYGON, uint32(POLYGON), HUB, uint32(HUB)) != bytes32(0));
    }

    function testNoDirectSpokeToSpokeTransfer() public {
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        this.route(BASE, uint32(BASE), POLYGON, uint32(POLYGON));
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        this.route(POLYGON, uint32(POLYGON), BASE, uint32(BASE));
    }

    function testDomain1643CannotImpersonateXGRChain() public {
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        this.route(BASE, uint32(HUB), POLYGON, uint32(POLYGON));
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        this.route(POLYGON, uint32(POLYGON), BASE, uint32(HUB));
    }

    function testXGRChainId1643NeedsMatchingDomain1643() public {
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        this.route(HUB, uint32(POLYGON), BASE, uint32(BASE));
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        this.route(BASE, uint32(BASE), HUB, uint32(POLYGON));
    }

    function testHubToHubAndSameChainAlwaysRejected() public {
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        this.route(HUB, uint32(HUB), HUB, uint32(HUB));
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        this.route(BASE, uint32(BASE), BASE, uint32(BASE));
    }

    function testFactoryRejectsMismatchedHubIdentityAtDeployment() public {
        vm.chainId(HUB);
        MockLocalGovernanceRegistry validators =
            new MockLocalGovernanceRegistry(uint32(POLYGON));
        XITATopologyMailboxMock mailbox =
            new XITATopologyMailboxMock(uint32(POLYGON));
        vm.expectRevert(XETATokenFactoryV315.InvalidConfiguration.selector);
        new XETATokenFactoryV315(
            HUB, uint32(POLYGON), address(validators),
            address(mailbox), address(mailbox), address(mailbox), 200_000, 100
        );
    }

    function testFactoryRejectsSpokeToSpokeAndHubDomainSpoof() public {
        vm.chainId(BASE);
        MockLocalGovernanceRegistry validators =
            new MockLocalGovernanceRegistry(uint32(BASE));
        XITATopologyMailboxMock mailbox =
            new XITATopologyMailboxMock(uint32(BASE));
        XETATokenFactoryV315 factory = new XETATokenFactoryV315(
            BASE, uint32(BASE), address(validators),
            address(mailbox), address(mailbox), address(mailbox), 200_000, 100
        );
        factory.deployRegistry();
        address router = factory.deployWrappedXGRRouter(bytes32(uint256(1)));
        vm.expectRevert(XETATokenFactoryV315.InvalidDestination.selector);
        factory.prepareRoute(router, POLYGON, uint32(POLYGON), A, address(0));
        vm.expectRevert(XETATokenFactoryV315.InvalidDestination.selector);
        factory.prepareRoute(router, POLYGON, uint32(HUB), A, address(0));
        vm.expectRevert(XETATokenFactoryV315.InvalidDestination.selector);
        factory.prepareRoute(router, HUB, uint32(POLYGON), A, address(0));
    }
}
