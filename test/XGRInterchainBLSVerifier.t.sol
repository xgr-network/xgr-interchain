// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRInterchainBLSVerifier} from "../contracts/XGRInterchainBLSVerifier.sol";

contract XGRInterchainBLSVerifierTest is Test {
    XGRInterchainBLSVerifier internal verifier;

    bytes internal constant EIP2537_PUBLIC_KEY =
        hex"000000000000000000000000000000000695ad325dfc7e1191fbc9f186f58eff42a634029731b18380ff89bf42c464a42cb8ca55b200f051f57f1e1893c687590000000000000000000000000000000010ea7912ef7a227c01298a7c7a96b1851b23021741c71938f39638b1d368aaa621452426b5d8199773a2cb5b2743a5da";

    bytes internal constant EIP2537_SIGNATURE =
        hex"0000000000000000000000000000000017088961632badc833b832b51fe006ae532b7238672ca5fc446e3b2b80fe1b2be767eb7b765698ae722b64cefc96e6850000000000000000000000000000000009db6117270d4bc0494417ec453aac0d2646dc40309c71d27babd5c0018ff829b00d1edb3dd2ae6dfa6f4e6e0d27720d0000000000000000000000000000000005dbb6817679e48421d3d97ad6af3c70ea6b5edbc449415ec42394976a62b16ccd25cf64ca7b1396bcfd24f44e49c0d800000000000000000000000000000000050ad2bec4ae472752a1b15928e8126e3b55c1ee74d5e3e4df1e4bf803e5724af0324af0d172526813e686f69d900984";

    function setUp() public {
        verifier = new XGRInterchainBLSVerifier();
    }

    function testKryptologyVectorVerifies() public view {
        bytes[] memory keys = new bytes[](1);
        keys[0] = EIP2537_PUBLIC_KEY;

        assertTrue(
            verifier.verify(
                bytes("xgr-eip2537-vector"),
                keys,
                hex"01",
                EIP2537_SIGNATURE
            )
        );
    }

    function testKryptologyVectorVerifiesAggregatedMultiKeyPath() public view {
        bytes[] memory keys = new bytes[](2);
        keys[0] = EIP2537_PUBLIC_KEY;
        keys[1] = EIP2537_PUBLIC_KEY;

        (bool ok, bytes memory aggregateSignature) =
            address(0x0d).staticcall(bytes.concat(EIP2537_SIGNATURE, EIP2537_SIGNATURE));
        assertTrue(ok);
        assertEq(aggregateSignature.length, 256);

        assertTrue(
            verifier.verify(
                bytes("xgr-eip2537-vector"),
                keys,
                hex"03",
                aggregateSignature
            )
        );

        assertFalse(
            verifier.verify(
                bytes("xgr-eip2537-vector"),
                keys,
                hex"01",
                aggregateSignature
            )
        );
    }

    function testKryptologyVectorRejectsChangedMessage() public view {
        bytes[] memory keys = new bytes[](1);
        keys[0] = EIP2537_PUBLIC_KEY;

        assertFalse(
            verifier.verify(
                bytes("xgr-eip2537-vector!"),
                keys,
                hex"01",
                EIP2537_SIGNATURE
            )
        );
    }
}
