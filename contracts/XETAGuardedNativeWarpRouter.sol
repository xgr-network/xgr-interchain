// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TokenRouter} from "@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol";
import {NativeCollateral} from "@hyperlane-xyz/core/contracts/token/libs/TokenCollateral.sol";
import {XETARouterCore} from "./XETARouterCore.sol";

/// @notice Native XGR adapter for the shared, multi-spoke XETA Router core.
/// @dev Exactly ONE native XGR router on XGRChain serves every XGR spoke.
///      No owner, public initializer, LP-vault or alternate dispatch path.
contract XETAGuardedNativeWarpRouter is XETARouterCore {
    constructor(
        address registry_,
        address mailbox_,
        address merkleTreeHook_,
        address destinationIsm_,
        uint256 defaultDestinationGasLimit_
    )
        TokenRouter(1, 1, mailbox_)
        XETARouterCore(registry_, defaultDestinationGasLimit_)
    {
        if (merkleTreeHook_ == address(0) || destinationIsm_ == address(0)) {
            revert XETAInvalidConfiguration();
        }
        _initializeXETA(merkleTreeHook_, destinationIsm_);
    }

    function _initializeXETA(address hook_, address ism_) private initializer {
        _MailboxClient_initialize(hook_, ism_, address(0));
    }

    function token() public pure override returns (address) {
        return address(0);
    }

    function _transferFromSender(uint256 amount) internal override {
        NativeCollateral._transferFromSender(amount);
    }

    function _transferTo(address recipient, uint256 amount) internal override {
        NativeCollateral._transferTo(recipient, amount);
    }

    receive() external payable {}
}
