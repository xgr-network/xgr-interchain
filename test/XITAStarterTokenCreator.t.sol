// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {XITAStarterTokenCreator, XITAFixedSupplyToken} from "../contracts/XITAStarterTokenCreator.sol";

contract XITAStarterTokenCreatorTest is Test {
    XITAStarterTokenCreator internal factory;
    address internal user = address(0xA11CE);
    address internal other = address(0xB0B);
    uint256 internal constant SUPPLY = 1_000_000 ether;

    function setUp() public {
        vm.chainId(1643);
        factory = new XITAStarterTokenCreator();
    }

    function testOnlyWalletOwnsEntireFixedSupply() public {
        vm.prank(user);
        address created = factory.createToken("Example Project", "EXM", SUPPLY, user);
        XITAFixedSupplyToken token = XITAFixedSupplyToken(created);
        assertEq(token.name(), "Example Project");
        assertEq(token.symbol(), "EXM");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(user), SUPPLY);
        assertEq(token.balanceOf(address(factory)), 0);
        assertEq(token.balanceOf(address(this)), 0);
        assertEq(token.owner(), user);
        vm.prank(user);
        token.transfer(other, 125 ether);
        assertEq(token.balanceOf(other), 125 ether);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testManyCreatorsHaveIndependentTokens() public {
        vm.prank(user);
        address a = factory.createToken("Example Project", "EXM", SUPPLY, user);
        vm.prank(other);
        address b = factory.createToken("Example Project", "EXM", SUPPLY, other);
        assertTrue(a != b);
        assertEq(ERC20(a).balanceOf(other), 0);
        assertEq(ERC20(b).balanceOf(other), SUPPLY);
        assertEq(ERC20(a).totalSupply(), SUPPLY);
    }

    function testInvalidNameAndSymbolAreRejected() public {
        vm.expectRevert(XITAStarterTokenCreator.InvalidName.selector);
        factory.createToken("A", "ABC", SUPPLY, user);
        vm.expectRevert(XITAStarterTokenCreator.InvalidSymbol.selector);
        factory.createToken("Example Project", "Abc", SUPPLY, user);
        vm.expectRevert(XITAStarterTokenCreator.InvalidSymbol.selector);
        factory.createToken("Example Project", "2ABC", SUPPLY, user);
        vm.expectRevert(XITAStarterTokenCreator.InvalidSymbol.selector);
        factory.createToken("Example Project", "ABC_DEF", SUPPLY, user);
    }

    function testEmitsWalletBoundCreationEvidence() public {
        // The newly created address is unknown until constructor execution, so
        // verify emitted fields with the recorded logs and returned receipt.
        vm.recordLogs();
        vm.prank(user);
        address deployed = factory.createToken("Example Project", "EXM", SUPPLY, user);
        Vm.Log[] memory entries = vm.getRecordedLogs();
        bytes32 sig = keccak256("TokenCreated(address,address,address,string,string,uint256)");
        bool verified;
        for (uint256 i = 0; i < entries.length; ++i) {
            Vm.Log memory log = entries[i];
            if (log.emitter != address(factory) || log.topics.length != 4 ||
                log.topics[0] != sig) continue;
            assertEq(log.topics[1], bytes32(uint256(uint160(user))));
            assertEq(log.topics[2], bytes32(uint256(uint160(deployed))));
            assertEq(log.topics[3], bytes32(uint256(uint160(user))));
            (string memory name, string memory symbol, uint256 supply) =
                abi.decode(log.data, (string,string,uint256));
            assertEq(name, "Example Project");
            assertEq(symbol, "EXM");
            assertEq(supply, SUPPLY);
            verified = true;
        }
        assertTrue(verified, "Token creator must emit canonical deploy evidence");
    }

    function testNoEtherCanBeSentToCreatorAsProtocolFee() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        (bool paid,) = address(factory).call{value: 1 ether}("");
        assertFalse(paid);
        assertEq(address(factory).balance, 0);
    }

    function testInvalidSupplyCannotCreateToken() public {
        vm.expectRevert(XITAStarterTokenCreator.InvalidSupply.selector);
        factory.createToken("Example Project", "ABC", 0, user);
        vm.expectRevert(XITAStarterTokenCreator.InvalidSupply.selector);
        factory.createToken("Example Project", "ABC", 1e36+1, user);
    }

    function testNoAdminMintOrFeeWithdrawalInterface() public {
        vm.prank(user);
        address token = factory.createToken("Example Project", "ABC", SUPPLY, user);
        (bool mintOk,) = token.call(abi.encodeWithSignature("mint(address,uint256)",other,100));
        (bool ownerOk,bytes memory ownerData) = token.staticcall(abi.encodeWithSignature("owner()"));
        (bool proxyOk,) = token.staticcall(abi.encodeWithSignature("implementation()"));
        (bool claimOk,) = address(factory).call(abi.encodeWithSignature("claimFees()"));
        assertFalse(mintOk);
        assertTrue(ownerOk);
        assertEq(abi.decode(ownerData,(address)),user);
        assertFalse(proxyOk);
        assertFalse(claimOk);
        assertEq(ERC20(token).totalSupply(),SUPPLY);
    }
}

contract XITAOperatorCreatorSeparationTest is Test {
 XITAStarterTokenCreator factory;
 address operator=address(0xDEED);
 address project=address(0xBEEF);
 function setUp() public {factory=new XITAStarterTokenCreator();}
 function testXGRPaysGasButProjectReceivesOwnershipAndSupply() public {
  vm.prank(operator);
  address deployed=factory.createToken("Project","PRJ",123 ether,project);
  XITAFixedSupplyToken token=XITAFixedSupplyToken(deployed);
  assertEq(token.owner(),project);
  assertEq(token.balanceOf(project),123 ether);
  assertEq(token.balanceOf(operator),0);
  assertEq(token.balanceOf(address(factory)),0);
  vm.prank(operator);
  vm.expectRevert("Ownable: caller is not the owner");
  token.transferOwnership(operator);
  vm.prank(project);
  token.transferOwnership(address(0xF00));
  assertEq(token.owner(),address(0xF00));
 }
 function testZeroOwnerRejected() public {
  vm.expectRevert(XITAStarterTokenCreator.InvalidOwner.selector);
  factory.createToken("Project","PRJ",123 ether,address(0));
 }
}
