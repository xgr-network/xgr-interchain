// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILNQuote, IILNWarpRouter} from "../ILNGateway.sol";

contract MockILNNativeWarpRouter is IILNWarpRouter {
    uint256 public nativeFeeWei = 0.01 ether;
    uint256 public lockedWei;
    uint256 public nonce;

    function token() external pure override returns (address) {
        return address(0);
    }

    function quoteTransferRemote(
        uint32,
        bytes32,
        uint256
    ) external view override returns (ILNQuote[] memory quotes) {
        quotes = new ILNQuote[](1);
        quotes[0] = ILNQuote({
            token: address(0),
            amount: nativeFeeWei
        });
    }

    function transferRemote(
        uint32 destination,
        bytes32 recipient,
        uint256 amount
    ) external payable override returns (bytes32 messageId) {
        require(msg.value == amount + nativeFeeWei, "native value");
        lockedWei += amount;
        nonce++;

        return keccak256(
            abi.encodePacked(
                msg.sender,
                destination,
                recipient,
                amount,
                nonce
            )
        );
    }
}
