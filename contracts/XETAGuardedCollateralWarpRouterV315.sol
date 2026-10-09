// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TokenRouter} from "@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {XETARouterCore} from "./XETARouterCore.sol";

/// @notice Independently collateralized ERC20 bridge adapter for XITA v3.1.5.
/// @dev Each open route creates its OWN fresh router and escrow. An unrelated
/// registration can never gain access to a different router's collateral.
/// Deflationary/fee-on-transfer ERC20s are deliberately NOT supported.
contract XETAGuardedCollateralWarpRouterV315 is XETARouterCore {
    using SafeERC20 for IERC20;

    IERC20 public immutable underlying;

    error UnsupportedUnderlyingToken();

    constructor(
        address token_,
        address registry_,
        address mailbox_,
        address merkleTreeHook_,
        address destinationIsm_,
        uint256 defaultDestinationGasLimit_
    )
        TokenRouter(1, 1, mailbox_)
        XETARouterCore(registry_, defaultDestinationGasLimit_)
    {
        if (token_.code.length == 0 ||
            merkleTreeHook_ == address(0) || destinationIsm_ == address(0))
            revert XETAInvalidConfiguration();

        underlying = IERC20(token_);
        _initializeXETA(merkleTreeHook_, destinationIsm_);
    }

    function _initializeXETA(address hook_, address ism_) private initializer {
        _MailboxClient_initialize(hook_, ism_, address(0));
    }

    function token() public view override returns (address) {
        return address(underlying);
    }

    function _transferFromSender(uint256 amount) internal override {
        uint256 beforeBalance = underlying.balanceOf(address(this));
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        if (underlying.balanceOf(address(this)) != beforeBalance + amount)
            revert UnsupportedUnderlyingToken();
    }

    function _transferTo(address recipient, uint256 amount) internal override {
        underlying.safeTransfer(recipient, amount);
    }
}
