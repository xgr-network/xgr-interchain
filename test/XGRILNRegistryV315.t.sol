// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {XGRILNRegistryV315} from "../contracts/XGRILNRegistryV315.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract XGRILNRegistryV315Test is Test {
    uint64 internal constant CHAIN = 8453;
    uint32 internal constant DOMAIN = 8453;
    uint32 internal constant DEST = 1643;
    XGRILNRegistryV315 internal registry;
    MockLocalGovernanceRegistry internal validators;
    bytes32 internal assetId;

    function setUp() public {
        vm.chainId(CHAIN);
        validators = new MockLocalGovernanceRegistry(DOMAIN);
        // The test contract represents the immutable public onboarding factory.
        registry = new XGRILNRegistryV315(CHAIN, DOMAIN, address(validators), address(this));
        assetId = XGRILNProtocol.assetIdV315(1643, address(0), 0);
    }

    function _fee(uint64 nonce, uint256 value)
        internal view returns (XGRILNProtocol.SourceFeeProposalV315 memory)
    {
        return XGRILNProtocol.SourceFeeProposalV315({
            sourceChainId: CHAIN, sourceDomain: DOMAIN,
            registry: address(registry), setId: validators.setId(),
            nonce: nonce, validUntil: uint64(block.timestamp + 5 minutes),
            validatorFeeWei: value
        });
    }

    function _route() internal returns (bytes32) {
        return registry.registerRoute(
            assetId, 1643, DEST, address(registry), address(0),
            address(this), address(this), address(this), address(this), address(0x4444)
        );
    }

    function testCannotCreateRouteWithoutSourceFee() public {
        vm.expectRevert(XGRILNRegistryV315.InvalidRoute.selector);
        _route();
    }

    function testSourceFeeSharedAcrossRegisteredRoutes() public {
        registry.applySourceFee(_fee(1, 100), hex"03", hex"01");
        bytes32 routeId = _route();
        bytes32 expectedId = XGRILNProtocol.routeIdV315(assetId, CHAIN, DOMAIN, 1643, DEST);
        assertEq(routeId, expectedId);
        (,,,,,,,uint256 fee,bool enabled) = registry.getRoute(DEST, routeId);
        assertEq(fee, 100);
        assertTrue(enabled);
        registry.applySourceFee(_fee(2, 250), hex"03", hex"01");
        (,,,,,,,fee,enabled) = registry.getRoute(DEST, routeId);
        assertEq(fee, 250);
        assertTrue(enabled);
        assertEq(registry.sourceFeeNonce(), 2);
        assertEq(registry.governanceNonce(DEST, routeId), 0);
    }

    function testDuplicateRouteCannotBeReplaced() public {
        registry.applySourceFee(_fee(1, 100), hex"03", hex"01");
        _route();
        vm.expectRevert(XGRILNRegistryV315.RouteAlreadyExists.selector);
        _route();
    }

    function testOnlyFactoryCanRegisterEvenWithValidAddresses() public {
        registry.applySourceFee(_fee(1, 100), hex"03", hex"01");
        vm.expectRevert(XGRILNRegistryV315.UnauthorizedRegistrar.selector);
        vm.prank(address(0xBEEF));
        registry.registerRoute(
            assetId, 1643, DEST, address(0), address(0), address(this),
            address(this), address(this), address(this), address(0x4444)
        );
    }

    function testRejectsDirectSpokeRoute() public {
        registry.applySourceFee(_fee(1, 100), hex"03", hex"01");
        vm.expectRevert(XGRILNProtocol.InvalidRouteKey.selector);
        registry.registerRoute(
            assetId, 137, 137, address(0), address(0),
            address(this), address(this), address(this), address(this), address(0x4444)
        );
    }

    function testFeeQuorumIsRequiredAndReplayProtected() public {
        validators.setResult(false);
        vm.expectRevert(XGRILNRegistryV315.InvalidFeeQuorum.selector);
        registry.applySourceFee(_fee(1, 100), hex"03", hex"01");
        validators.setResult(true);
        registry.applySourceFee(_fee(1, 100), hex"03", hex"01");
        vm.expectRevert(XGRILNRegistryV315.InvalidFeeNonce.selector);
        registry.applySourceFee(_fee(1, 100), hex"03", hex"01");
    }

    function testFeeGovernanceRejectsRotatedSet() public {
        XGRILNProtocol.SourceFeeProposalV315 memory old = _fee(1, 100);
        validators.setSetId(old.setId + 1);
        vm.expectRevert(XGRILNRegistryV315.InvalidFeeQuorum.selector);
        registry.applySourceFee(old, hex"03", hex"01");
    }

    function testIdsIncludeAssetAndBothChainIdentitiesButNotContracts() public pure {
        bytes32 a = XGRILNProtocol.assetIdV315(1643, address(0), 0);
        bytes32 b = XGRILNProtocol.assetIdV315(8453, address(0x1234), 1);
        assertTrue(a != b);
        bytes32 forward = XGRILNProtocol.routeIdV315(a, 1643, 1643, 8453, 8453);
        bytes32 reverse = XGRILNProtocol.routeIdV315(a, 8453, 8453, 1643, 1643);
        assertTrue(forward != reverse);
    }
}
