// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRILNRegistryV315} from "../contracts/XGRILNRegistryV315.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract XGRILNRegistryV315Test is Test {
    uint64 private constant CHAIN = 8453;
    uint32 private constant DOMAIN = 8453;
    uint64 private constant HUB = 1643;
    uint32 private constant HUB_DOMAIN = 1643;
    address private constant PEER = address(0x4444);
    XGRILNRegistryV315 private registry;
    MockLocalGovernanceRegistry private validators;
    bytes32 private assetId;

    function setUp() public {
        vm.chainId(CHAIN);
        validators = new MockLocalGovernanceRegistry(DOMAIN);
        registry = new XGRILNRegistryV315(
            CHAIN, DOMAIN, address(validators), address(this), 100
        );
        assetId = XGRILNProtocol.assetIdV315(HUB, address(0), 0);
    }

    function _fee(uint64 nonce, uint256 amount)
        internal view returns (XGRILNProtocol.SourceFeeProposalV315 memory)
    {
        return XGRILNProtocol.SourceFeeProposalV315({
            sourceChainId: CHAIN, sourceDomain: DOMAIN,
            registry: address(registry), setId: validators.setId(),
            nonce: nonce, validUntil: uint64(block.timestamp + 600),
            validatorFeeWei: amount
        });
    }

    function _route() internal returns (bytes32) {
        return registry.registerRouteInstance(
            assetId, HUB, HUB_DOMAIN, address(this), address(0),
            address(this), address(this), address(this), address(this), PEER
        );
    }

    function _safetyProof(bytes32 id)
        internal view returns (XGRILNRegistryV315.RouteSafetyProofV315 memory)
    {
        return XGRILNRegistryV315.RouteSafetyProofV315({
            destinationDomain: HUB_DOMAIN,
            routeId: id,
            reverseRouteId: XGRILNProtocol.routeInstanceIdV315(
                assetId, HUB, HUB_DOMAIN, CHAIN, DOMAIN, PEER, address(this)
            ),
            remoteRegistry: address(0x1231),
            remoteFactory: address(0x1232),
            remoteGateway: address(0x1233),
            remoteRouterCodeHash: keccak256("remote"),
            localRouterCodeHash: address(this).codehash,
            setId: validators.setId(),
            validUntil: uint64(block.timestamp + 600)
        });
    }

    function testInitialFeeIsPresentWithoutQuorum() public {
        assertEq(registry.validatorFeeWei(), 100);
        assertEq(registry.sourceFeeNonce(), 0);
        assertTrue(_route() != bytes32(0));
    }

    function testZeroInitialFeeRejected() public {
        vm.expectRevert(XGRILNRegistryV315.InvalidConfiguration.selector);
        new XGRILNRegistryV315(CHAIN, DOMAIN, address(validators), address(this), 0);
    }

    function testRegisteredRouteIsPreparedButNotActive() public {
        registry.applySourceFee(_fee(1,100),hex"03",hex"01");
        bytes32 id = _route();
        bytes32 expected = XGRILNProtocol.routeInstanceIdV315(
            assetId,CHAIN,DOMAIN,HUB,HUB_DOMAIN,address(this),PEER
        );
        assertEq(id,expected);
        assertTrue(registry.exists(HUB_DOMAIN,id));
        (,,,,,,,uint256 fee,bool enabled) = registry.getRoute(HUB_DOMAIN,id);
        assertEq(fee,0);
        assertFalse(enabled);
    }

    function testTechnicalSafetyAttestationActivatesSharedSourceFee() public {
        registry.applySourceFee(_fee(1,100),hex"03",hex"01");
        bytes32 id = _route();
        registry.confirmRouteInstance(_safetyProof(id),hex"03",hex"01");
        (,,,,,,,uint256 fee,bool enabled) = registry.getRoute(HUB_DOMAIN,id);
        assertEq(fee,100);
        assertTrue(enabled);
        registry.applySourceFee(_fee(2,250),hex"03",hex"01");
        (,,,,,,,fee,enabled) = registry.getRoute(HUB_DOMAIN,id);
        assertEq(fee,250);
        assertTrue(enabled);
        assertEq(registry.sourceFeeNonce(),2);
    }

    function testTwoRegistrationsCannotClaimTheSameRouterPair() public {
        registry.applySourceFee(_fee(1,100),hex"03",hex"01");
        _route();
        vm.expectRevert(XGRILNRegistryV315.RouteAlreadyExists.selector);
        _route();
    }

    function testExternalCallerCannotBypassThePublicFactory() public {
        registry.applySourceFee(_fee(1,100),hex"03",hex"01");
        vm.expectRevert(XGRILNRegistryV315.UnauthorizedRegistrar.selector);
        vm.prank(address(0xBEEF));
        registry.registerRouteInstance(
            assetId,HUB,HUB_DOMAIN,address(this),address(0),
            address(this),address(this),address(this),address(this),PEER
        );
    }

    function testNoDirectSpokeToSpokeRegistration() public {
        registry.applySourceFee(_fee(1,100),hex"03",hex"01");
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        registry.registerRouteInstance(
            assetId,137,137,address(this),address(0),
            address(this),address(this),address(this),address(this),PEER
        );
    }

    function testSafetyProofMustMatchImmutableLocalRouter() public {
        registry.applySourceFee(_fee(1,100),hex"03",hex"01");
        bytes32 id = _route();
        XGRILNRegistryV315.RouteSafetyProofV315 memory p = _safetyProof(id);
        p.localRouterCodeHash = keccak256("fake");
        vm.expectRevert(XGRILNRegistryV315.InvalidRouteSafetyProof.selector);
        registry.confirmRouteInstance(p,hex"03",hex"01");
    }

    function testSourceFeeSignatureQuorumAndReplayProtection() public {
        XGRILNProtocol.SourceFeeProposalV315 memory proposal = _fee(1,100);
        validators.setResult(false);
        vm.expectRevert(XGRILNRegistryV315.InvalidFeeQuorum.selector);
        registry.applySourceFee(proposal,hex"03",hex"01");
        validators.setResult(true);
        registry.applySourceFee(proposal,hex"03",hex"01");
        vm.expectRevert(XGRILNRegistryV315.InvalidFeeNonce.selector);
        registry.applySourceFee(proposal,hex"03",hex"01");
    }

    function testRotatedValidatorSetCannotSignOldFeeProposal() public {
        XGRILNProtocol.SourceFeeProposalV315 memory proposal = _fee(1,100);
        validators.setSetId(proposal.setId+1);
        vm.expectRevert(XGRILNRegistryV315.InvalidFeeQuorum.selector);
        registry.applySourceFee(proposal,hex"03",hex"01");
    }
}
