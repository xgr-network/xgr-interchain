// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {XITAStarterTokenCreator, XITACreatorERC20} from "../contracts/XITAStarterTokenCreator.sol";

contract XITAStarterTokenCreatorTest is Test {
    XITAStarterTokenCreator internal factory;
    address internal ownerWallet = address(0xA11CE);
    address internal operator = address(0xDEED);
    address internal minter = address(0xB0B);
    address internal other = address(0xBABE);
    uint256 internal constant SUPPLY = 1_000_000 ether;

    function setUp() public {
        vm.chainId(1643);
        factory = new XITAStarterTokenCreator();
    }

    function create(uint8 variant, uint8 decimalPlaces, uint256 cap, bool permitEnabled, address minter_)
        internal returns (XITACreatorERC20 token)
    {
        vm.prank(operator);
        address deployed = factory.createTokenConfigured(
            "Example Project", "EXM", 1000 * 10 ** decimalPlaces,
            ownerWallet, variant, decimalPlaces, cap * 10 ** decimalPlaces,
            permitEnabled, minter_
        );
        token = XITACreatorERC20(deployed);
        assertEq(token.owner(), ownerWallet);
        assertEq(token.balanceOf(ownerWallet), 1000 * 10 ** decimalPlaces);
        assertEq(token.balanceOf(operator), 0);
        assertEq(token.balanceOf(address(factory)), 0);
    }

    function testFixedTokenOperatorPaysButCannotControlOwnerOrMint() public {
        vm.prank(operator);
        XITACreatorERC20 token=XITACreatorERC20(factory.createToken("Example Project","EXM",SUPPLY,ownerWallet));
        assertEq(token.name(), "Example Project");
        assertEq(token.symbol(), "EXM");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.lifetimeCap(), SUPPLY);
        assertEq(token.lifetimeMinted(), SUPPLY);
        assertEq(token.owner(), ownerWallet);
        assertEq(token.tokenType(), 0);
        assertEq(token.balanceOf(ownerWallet), SUPPLY);
        assertEq(token.balanceOf(operator), 0);
        assertEq(token.balanceOf(address(factory)), 0);
        vm.expectRevert(XITACreatorERC20.UnsupportedFeature.selector);
        token.burn(1);
        vm.prank(ownerWallet);
        vm.expectRevert(XITACreatorERC20.UnsupportedFeature.selector);
        token.mint(other, 1);
        vm.prank(ownerWallet);
        vm.expectRevert(XITACreatorERC20.UnsupportedFeature.selector);
        token.setMinter(other);
        vm.prank(operator);
        vm.expectRevert("Ownable: caller is not the owner");
        token.transferOwnership(operator);
        vm.prank(ownerWallet);
        token.transfer(other,125 ether);
        assertEq(token.balanceOf(other),125 ether);
    }

    function testBurnableOnlyHolderOrApprovedSpenderCanBurn() public {
        XITACreatorERC20 token=create(1,6,1000,false,address(0));
        assertEq(token.decimals(),6);
        vm.prank(operator);
        vm.expectRevert("ERC20: burn amount exceeds balance");
        token.burn(1);
        vm.prank(ownerWallet);
        token.burn(25e6);
        assertEq(token.totalSupply(),975e6);
        assertEq(token.lifetimeMinted(),1000e6);
        vm.prank(operator);
        vm.expectRevert("ERC20: insufficient allowance");
        token.burnFrom(ownerWallet,1e6);
        vm.prank(ownerWallet);
        token.approve(operator,10e6);
        vm.prank(operator);
        token.burnFrom(ownerWallet,10e6);
        assertEq(token.totalSupply(),965e6);
        vm.prank(ownerWallet);
        vm.expectRevert(XITACreatorERC20.UnsupportedFeature.selector);
        token.mint(ownerWallet,1);
    }

    function testMintLifetimeCapNeverReopensAfterBurn() public {
        XITACreatorERC20 token=create(2,8,1100,true,minter);
        assertEq(token.minter(),minter);
        assertEq(token.lifetimeMinted(),1000e8);
        vm.prank(operator);
        vm.expectRevert(XITACreatorERC20.UnauthorizedMinter.selector);
        token.mint(operator,1);
        vm.prank(ownerWallet);
        vm.expectRevert(XITACreatorERC20.UnauthorizedMinter.selector);
        token.mint(other,1);
        vm.prank(minter);
        token.mint(other,100e8);
        assertEq(token.balanceOf(other),100e8);
        vm.prank(ownerWallet);
        token.burn(100e8);
        assertEq(token.totalSupply(),1000e8);
        assertEq(token.lifetimeMinted(),1100e8);
        vm.prank(minter);
        vm.expectRevert(XITACreatorERC20.LifetimeSupplyExceeded.selector);
        token.mint(other,1);
    }

    function testOnlyProjectOwnerRotatesOrDisablesMinter() public {
        XITACreatorERC20 token=create(2,18,2000,false,minter);
        vm.prank(operator);
        vm.expectRevert("Ownable: caller is not the owner");
        token.setMinter(operator);
        vm.prank(ownerWallet);
        token.setMinter(address(0));
        assertEq(token.minter(),address(0));
        vm.prank(minter);
        vm.expectRevert(XITACreatorERC20.UnauthorizedMinter.selector);
        token.mint(other,1);
        vm.prank(ownerWallet);
        token.setMinter(other);
        vm.prank(other);
        token.mint(other,1);
        assertEq(token.balanceOf(other),1);
        vm.prank(ownerWallet);
        token.renounceOwnership();
        assertEq(token.owner(),address(0));
        assertEq(token.minter(),address(0));
        vm.prank(other);
        vm.expectRevert(XITACreatorERC20.UnauthorizedMinter.selector);
        token.mint(other,1);
    }

    function testPermitDisabledAndOptionalEIP2612Works() public {
        XITACreatorERC20 disabled=create(0,18,1000,false,address(0));
        vm.expectRevert(XITACreatorERC20.UnsupportedFeature.selector);
        disabled.permit(ownerWallet,operator,100,block.timestamp+100,27,bytes32(0),bytes32(0));
        // Sign with a real private key and validate the actual domain separator.
        uint256 key=uint256(0xB0B0);
        address signer=vm.addr(key);
        vm.prank(operator);
        XITACreatorERC20 enabled=XITACreatorERC20(factory.createTokenConfigured(
          "Permit Example","PRM",100 ether,signer,0,18,100 ether,true,address(0)));
        bytes32 digest=keccak256(abi.encodePacked(
          bytes2(0x1901),enabled.DOMAIN_SEPARATOR(),
          keccak256(abi.encode(
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
            signer,operator,uint256(10 ether),uint256(0),uint256(block.timestamp+100)
          ))
        ));
        (uint8 v,bytes32 rr,bytes32 ss)=vm.sign(key,digest);
        enabled.permit(signer,operator,10 ether,block.timestamp+100,v,rr,ss);
        assertEq(enabled.allowance(signer,operator),10 ether);
        assertEq(enabled.nonces(signer),1);
    }

    function testConfiguredCreationEvidenceRecordsActualFeaturesAndRuntimeHash() public {
        vm.recordLogs();
        XITACreatorERC20 token=create(2,6,1500,true,minter);
        Vm.Log[] memory entries=vm.getRecordedLogs();
        bytes32 sig=keccak256("TokenConfigured(address,uint8,uint8,uint256,bool,address,bytes32)");
        bool found;
        for(uint256 i;i<entries.length;i++){
            Vm.Log memory entry=entries[i];
            if(entry.emitter!=address(factory)||entry.topics.length!=3||
               entry.topics[0]!=sig)continue;
            assertEq(entry.topics[1],bytes32(uint256(uint160(address(token)))));
            assertEq(entry.topics[2],bytes32(uint256(2)));
            (uint8 decimals_,uint256 cap,bool permit_,address minter_,bytes32 codeHash)=
              abi.decode(entry.data,(uint8,uint256,bool,address,bytes32));
            assertEq(decimals_,6);
            assertEq(cap,1500e6);
            assertTrue(permit_);
            assertEq(minter_,minter);
            assertEq(codeHash,address(token).codehash);
            found=true;
        }
        assertTrue(found);
    }

    function testInvalidConfigurationsNeverDeploy() public {
        vm.expectRevert(XITAStarterTokenCreator.InvalidName.selector);
        factory.createToken("A","ABC",SUPPLY,ownerWallet);
        vm.expectRevert(XITAStarterTokenCreator.InvalidSymbol.selector);
        factory.createToken("Example","aBC",SUPPLY,ownerWallet);
        vm.expectRevert(XITAStarterTokenCreator.InvalidOwner.selector);
        factory.createToken("Example","ABC",SUPPLY,address(0));
        vm.expectRevert(XITAStarterTokenCreator.InvalidSupply.selector);
        factory.createToken("Example","ABC",0,ownerWallet);
        vm.expectRevert(XITAStarterTokenCreator.InvalidSupply.selector);
        factory.createToken("Example","ABC",1e36+1,ownerWallet);
        vm.expectRevert(XITAStarterTokenCreator.InvalidTokenConfiguration.selector);
        factory.createTokenConfigured("Example","ABC",1000e6,ownerWallet,3,6,1100e6,false,minter);
        vm.expectRevert(XITAStarterTokenCreator.InvalidTokenConfiguration.selector);
        factory.createTokenConfigured("Example","ABC",1000e6,ownerWallet,2,7,1100e6,false,minter);
        vm.expectRevert(XITAStarterTokenCreator.InvalidTokenConfiguration.selector);
        factory.createTokenConfigured("Example","ABC",1000e6,ownerWallet,0,6,1100e6,false,address(0));
        vm.expectRevert(XITAStarterTokenCreator.InvalidTokenConfiguration.selector);
        factory.createTokenConfigured("Example","ABC",1000e6,ownerWallet,2,6,1100e6,false,address(0));
        vm.expectRevert(XITAStarterTokenCreator.InvalidSupply.selector);
        factory.createTokenConfigured("Example","ABC",1000e6,ownerWallet,2,6,999e6,false,minter);
    }

    function testNoFactoryFeesOrUnprivilegedAdminMethods() public {
        vm.deal(operator,1 ether);
        vm.prank(operator);
        (bool paid,)=address(factory).call{value:1 ether}("");
        assertFalse(paid);
        vm.prank(operator);
        XITACreatorERC20 token=XITACreatorERC20(factory.createToken("Example","ABC",SUPPLY,ownerWallet));
        (bool mintOk,)=address(token).call(abi.encodeWithSignature("mint(address,uint256)",operator,100));
        (bool pauseOk,)=address(token).call(abi.encodeWithSignature("pause()"));
        (bool proxyOk,)=address(token).staticcall(abi.encodeWithSignature("implementation()"));
        (bool claimOk,)=address(factory).call(abi.encodeWithSignature("claimFees()"));
        assertFalse(mintOk);
        assertFalse(pauseOk);
        assertFalse(proxyOk);
        assertFalse(claimOk);
    }
}
