// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILNQuote, IILNWarpRouter} from "../ILNGateway.sol";

contract MockILNWarpRouter is IILNWarpRouter {
    string public constant name = "Mock wXGR";
    string public constant symbol = "mwXGR";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    uint256 public nativeFeeWei = 0.01 ether;
    uint256 public syntheticQuoteAmount;
    uint256 public nonce;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function token() external view override returns (address) {
        return address(this);
    }

    function setSyntheticQuoteAmount(uint256 value) external {
        syntheticQuoteAmount = value;
    }

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount)
        external
        returns (bool)
    {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function quoteTransferRemote(
        uint32,
        bytes32,
        uint256
    ) external view override returns (ILNQuote[] memory quotes) {
        quotes = new ILNQuote[](2);
        quotes[0] = ILNQuote({
            token: address(0),
            amount: nativeFeeWei
        });
        quotes[1] = ILNQuote({
            token: address(this),
            amount: syntheticQuoteAmount
        });
    }

    function transferRemote(
        uint32 destination,
        bytes32 recipient,
        uint256 amount
    ) external payable override returns (bytes32 messageId) {
        require(msg.value == nativeFeeWei, "native fee");
        require(balanceOf[msg.sender] >= amount, "bridge balance");

        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
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
