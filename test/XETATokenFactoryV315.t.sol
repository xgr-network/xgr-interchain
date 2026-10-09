// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XGRILNRegistryV315} from "../contracts/XGRILNRegistryV315.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";

contract XETATokenFactoryV315Test is Test {
    XETATokenFactoryV315 internal factory;
    MockLocalGovernanceRegistry internal validators;

    function setUp() public {
        vm.chainId(8453);
        validators=new MockLocalGovernanceRegistry(8453);
        factory=new XETATokenFactoryV315(
            8453,8453,address(validators),
            address(0x1111),address(0x2222),address(0x3333),250_000
        );
    }

    function testAnyoneCanCreateSameSingletonRegistry() public {
        vm.prank(address(0xBEEF));
        address first=factory.deployRegistry();
        assertTrue(first!=address(0));
        assertEq(first,address(factory.registry()));
        vm.prank(address(0xB0B));
        address again=factory.deployRegistry();
        assertEq(first,again);
        XGRILNRegistryV315 deployed=XGRILNRegistryV315(first);
        assertEq(deployed.factory(),address(factory));
        assertEq(deployed.sourceDomain(),8453);
        assertEq(deployed.governanceRegistry().destinationDomain(),8453);
    }

    function testXGRRepresentationIdentityIsFactoryDerived() public view {
        bytes32 expected=XGRILNProtocol.assetIdV315(1643,address(0),0);
        assertEq(factory.xgrAssetId(),expected);
        assertEq(factory.representation(expected),address(0));
    }

    function testNativeXGRCannotBeDeployedOnBase() public {
        factory.deployRegistry();
        vm.expectRevert(XETATokenFactoryV315.WrongChain.selector);
        factory.deployNativeXGR();
    }

    function testConstructorRejectsWrongChain() public {
        vm.expectRevert(XETATokenFactoryV315.InvalidConfiguration.selector);
        new XETATokenFactoryV315(
            1643,1643,address(validators),
            address(0x1111),address(0x2222),address(0x3333),250_000
        );
    }
}
