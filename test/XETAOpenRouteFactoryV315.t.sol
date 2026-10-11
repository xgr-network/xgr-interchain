// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {XGRILNRegistryV315} from "../contracts/XGRILNRegistryV315.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XETAGuardedCollateralWarpRouterV315} from "../contracts/XETAGuardedCollateralWarpRouterV315.sol";
import {XETAGuardedSyntheticWarpRouter} from "../contracts/XETAGuardedSyntheticWarpRouter.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract XITAMockERC20 is ERC20 {
    constructor() ERC20("Original Asset", "ORIG") { _mint(msg.sender, 1_000_000 ether); }
}

contract XITAOpenMailboxMock {
    uint32 public immutable localDomain;
    uint256 public count;
    constructor(uint32 domain) { localDomain = domain; }
    function quoteDispatch(uint32, bytes32, bytes calldata, bytes calldata, address)
        external pure returns (uint256) { return 0; }
    function dispatch(uint32, bytes32, bytes calldata, bytes calldata, address)
        external payable returns (bytes32) {
        count++;
        return keccak256(abi.encodePacked(count));
    }
}

contract XETAOpenRouteFactoryV315Test is Test {
    uint64 internal constant BASE = 8453;
    uint64 internal constant HUB = 1643;
    address internal constant PEER_A = address(0xAAA1);
    address internal constant PEER_B = address(0xAAA2);
    XETATokenFactoryV315 internal factory;
    XGRILNRegistryV315 internal registry;
    MockLocalGovernanceRegistry internal validators;
    XITAOpenMailboxMock internal mailbox;
    XITAMockERC20 internal token;

    function setUp() public {
        vm.chainId(BASE);
        validators = new MockLocalGovernanceRegistry(uint32(BASE));
        mailbox = new XITAOpenMailboxMock(uint32(BASE));
        factory = new XETATokenFactoryV315(
            BASE, uint32(BASE), address(validators),
            address(mailbox), address(mailbox), address(mailbox), 200_000, 100
        );
        registry = XGRILNRegistryV315(factory.deployRegistry());
        token = new XITAMockERC20();
        XGRILNProtocol.SourceFeeProposalV315 memory proposal =
            XGRILNProtocol.SourceFeeProposalV315({
                sourceChainId: BASE, sourceDomain: uint32(BASE),
                registry: address(registry), setId: validators.setId(),
                nonce: 1, validUntil: uint64(block.timestamp + 600),
                validatorFeeWei: 100
            });
        registry.applySourceFee(proposal, hex"03", hex"01");
    }

    function testSameAssetCanHaveIndependentRegisteredRoutes() public {
        (bytes32 a,address first) = factory.deployCollateralRouter(
            address(token),bytes32(uint256(1)));
        (bytes32 b,address second) = factory.deployCollateralRouter(
            address(token),bytes32(uint256(2)));
        assertEq(a, b);
        assertTrue(first != second);
        (bytes32 idA,address gatewayA) =
            factory.registerRoute(first,HUB,uint32(HUB),PEER_A,PEER_A);
        (bytes32 idB,address gatewayB) =
            factory.registerRoute(second,HUB,uint32(HUB),PEER_B,PEER_B);
        assertTrue(idA != idB);
        assertTrue(gatewayA != gatewayB);
        assertTrue(registry.exists(uint32(HUB),idA));
        assertTrue(registry.exists(uint32(HUB),idB));
        (,,,,,,,,bool enabledA) = registry.getRoute(uint32(HUB),idA);
        (,,,,,,,,bool enabledB) = registry.getRoute(uint32(HUB),idB);
        assertTrue(enabledA);
        assertTrue(enabledB);
        assertEq(XETAGuardedCollateralWarpRouterV315(first).token(),address(token));
        assertEq(XETAGuardedCollateralWarpRouterV315(second).token(),address(token));
        (uint256 fee,,,) = ILNGateway(gatewayA).quoteILN(uint32(HUB),bytes32(uint256(1)),1 ether);
        assertEq(fee,100);
    }

    function testPermissionlessRegistrationWithoutValidatorVote() public {
        (,address local) = factory.deployCollateralRouter(address(token),bytes32(uint256(3)));
        validators.setResult(false);
        (bytes32 id,address gateway) = factory.registerRoute(local,HUB,uint32(HUB),PEER_A,PEER_A);
        (,,,,,,,uint256 fee,bool enabled) = registry.getRoute(uint32(HUB),id);
        assertTrue(enabled);
        assertEq(fee,100);
        assertEq(ILNGateway(gateway).warpRouter(),local);
    }

    function testActivatedCollateralRouteDoesNotUseOtherEscrow() public {
        (,address local) = factory.deployCollateralRouter(address(token),bytes32(uint256(4)));
        (,address second) = factory.deployCollateralRouter(address(token),bytes32(uint256(5)));
        (bytes32 id,address gateway) = factory.registerRoute(
            local,HUB,uint32(HUB),PEER_A,PEER_A
        );
        (bytes32 other,) = factory.registerRoute(
            second,HUB,uint32(HUB),PEER_B,PEER_B
        );
        (,,,,,,,uint256 fee,bool enabled) = registry.getRoute(uint32(HUB),id);
        assertTrue(enabled);
        assertEq(fee,100);
        (,,,,,,,,bool otherEnabled) = registry.getRoute(uint32(HUB),other);
        assertTrue(otherEnabled);
        token.approve(gateway,100 ether);
        bytes32 recipient = bytes32(uint256(uint160(address(0xCAFE))));
        (uint256 validatorFee,,uint256 total,uint256 quotedToken) =
            ILNGateway(gateway).quoteILN(uint32(HUB),recipient,100 ether);
        assertEq(validatorFee,100);
        assertEq(quotedToken,100 ether);
        ILNGateway(gateway).bridge{value:total}(uint32(HUB),recipient,100 ether);
        assertEq(token.balanceOf(local),100 ether);
        assertEq(token.balanceOf(second),0);
        assertEq(address(ILNGateway(gateway).feeVault()).balance,100);
    }

    function testIndependentSyntheticClaimsBeginWithZeroSupply() public {
        address origin = address(0x9999);
        (bytes32 a,address first) = factory.deploySyntheticRouter(
            HUB,origin,18,"Claim A","A",bytes32(uint256(6))
        );
        (bytes32 b,address second) = factory.deploySyntheticRouter(
            HUB,origin,18,"Claim B","B",bytes32(uint256(7))
        );
        assertEq(a,b);
        assertTrue(first != second);
        assertEq(XETAGuardedSyntheticWarpRouter(first).totalSupply(),0);
        assertEq(XETAGuardedSyntheticWarpRouter(second).totalSupply(),0);
        assertEq(factory.representedAssetId(first),a);
    }

    function testNoDirectBaseToPolygonRouteThroughFactory() public {
        (,address router) = factory.deployCollateralRouter(
            address(token),bytes32(uint256(8))
        );
        vm.expectRevert(XETATokenFactoryV315.InvalidDestination.selector);
        factory.registerRoute(router,137,137,PEER_A,PEER_A);
    }
}
