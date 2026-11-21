// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {XITASolanaCodec} from "../contracts/solana/XITASolanaCodec.sol";

contract XITASolanaCodecTest is Test {
    uint32 internal constant XGR = 1643;
    uint32 internal constant SOL = 1399811149;
    bytes32 internal constant XGR_ASSET = 0xa7585b8fbd074c1a7fa6df8b8e2e5ce73395ccbb64bf99b631c5da8ff2ac44e0;
    bytes32 internal constant SOL_ASSET = 0xd2aefcda8943cf2e0983e100de0325d0d1de575deb4f476e562c0e120db3957d;
    bytes32 internal constant MINT = 0x069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001;
    bytes32 internal constant SRC = bytes32(uint256(0xa11c));
    bytes32 internal constant DST = 0x06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9;
    bytes32 internal constant FORWARD = 0x185ea4af59c1c6160ca69ab81f0621fe4d823eab02cfd5c5e9decbd6000dadf6;
    bytes32 internal constant REVERSE = 0xf53653c35f340c4903ad09747d10d816aa59194f841822ae24114e5df6f3b263;
    bytes32 internal constant AUTH_HASH = 0x378e45af3059a027847165ac3e2bccd9fbc076d425f06fb3198c126ab2cfaa10;

    function _a() private pure returns (XITASolanaCodec.Authorization memory a) {
        a.sourceDomain = XGR;
        a.destinationDomain = SOL;
        a.assetId = XGR_ASSET;
        a.routeId = FORWARD;
        a.setId = 7;
        a.sourceHeight = 12345678;
        a.sourceRegistry = bytes32(uint256(0xb001));
        a.gateway = bytes32(uint256(0xb002));
        a.sourceRouter = SRC;
        a.sourceMailbox = bytes32(uint256(0xb003));
        a.destinationRouter = DST;
        a.validatorFeeAtomic = 123456789;
        a.messageId = bytes32(type(uint256).max / 255 * 0x11);
        a.recipient = bytes32(type(uint256).max / 255 * 0x33);
        a.amountCanonical = 1e18;
        a.destinationIsm = MINT;
        a.destinationRegistry = bytes32(type(uint256).max / 255 * 0x22);
    }
    function testExistingEvmAssetIdUnchanged() public pure {
        assertEq(XGRILNProtocol.assetIdV315(1643,address(0),0),XGR_ASSET);
    }
    function testAssetAndRouteGoldenVectors() public pure {
        assertEq(XITASolanaCodec.solanaAssetId(MINT,1), SOL_ASSET);
        assertEq(XITASolanaCodec.solanaRouteId(XGR_ASSET,XGR,SOL,SRC,DST),FORWARD);
        assertEq(XITASolanaCodec.solanaRouteId(XGR_ASSET,SOL,XGR,DST,SRC),REVERSE);
        assertTrue(FORWARD!=REVERSE);
    }
    function testSigningGoldenVectorAndBinding() public pure {
        XITASolanaCodec.Authorization memory a=_a();
        assertEq(XITASolanaCodec.directSigningBytes(a).length,501);
        assertEq(XITASolanaCodec.directSigningHash(a),AUTH_HASH);
        a.setId+=1;
        assertTrue(XITASolanaCodec.directSigningHash(a)!=AUTH_HASH);
    }
    function testBadRouteAndSpoofedSourceRejects() public {
        vm.expectRevert(XITASolanaCodec.InvalidSolanaCodec.selector);
        this.routeHash(XGR_ASSET,8453,SOL,SRC,DST);
        vm.expectRevert(XITASolanaCodec.InvalidSolanaCodec.selector);
        this.routeHash(XGR_ASSET,XGR,SOL,DST,SRC);
        XITASolanaCodec.Authorization memory a=_a();
        a.routeId=REVERSE;
        vm.expectRevert(XITASolanaCodec.InvalidSolanaCodec.selector);
        this.signingHash(a);
        a=_a();a.sourceMailbox=DST;
        vm.expectRevert(XITASolanaCodec.InvalidSolanaCodec.selector);
        this.signingHash(a);
    }
    function signingHash(XITASolanaCodec.Authorization memory a) external pure returns (bytes32) {
        return XITASolanaCodec.directSigningHash(a);
    }
    // Foundry vm.expectRevert requires a lower-depth external call.
    function routeHash(
        bytes32 asset,uint32 source,uint32 destination,
        bytes32 sourceRouter,bytes32 destinationRouter
    ) external pure returns (bytes32) {
        return XITASolanaCodec.solanaRouteId(
            asset,source,destination,sourceRouter,destinationRouter
        );
    }
    function scale(uint256 value,uint8 src,uint8 dst,bool svm)
        external pure returns (uint256) {
        return XITASolanaCodec.exactScaleAmount(value,src,dst,svm);
    }
    function testExactDecimals() public {
        assertEq(XITASolanaCodec.exactScaleAmount(1e18,18,9,true),1e9);
        assertEq(XITASolanaCodec.exactScaleAmount(1e9,9,18,false),1e18);
        vm.expectRevert(XITASolanaCodec.InvalidSolanaCodec.selector);
        this.scale(1,18,9,true);
        vm.expectRevert(XITASolanaCodec.InvalidSolanaCodec.selector);
        this.scale((uint256(type(uint64).max)+1)*1e9,18,9,true);
    }
}
