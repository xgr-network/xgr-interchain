// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TokenRouter} from "@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol";
import {HypERC20} from "@hyperlane-xyz/core/contracts/token/HypERC20.sol";
import {XETARouterCore} from "./XETARouterCore.sol";

/// @notice Synthetic ERC20 asset adapter for the SAME shared XETA Router core.
/// @dev Deploy ONE instance per represented asset and physical chain.
///      It can serve multiple spokes when deployed on the XGRChain hub.
///      Supply begins at zero and grows only on authorized Mailbox delivery.
contract XETAGuardedSyntheticWarpRouter is HypERC20, XETARouterCore {
    constructor(
        address registry_,
        address mailbox_,
        address merkleTreeHook_,
        address destinationIsm_,
        uint256 defaultDestinationGasLimit_,
        uint8 decimals_,
        string memory name_,
        string memory symbol_
    )
        HypERC20(decimals_, 1, 1, mailbox_)
        XETARouterCore(registry_, defaultDestinationGasLimit_)
    {
        if (
            merkleTreeHook_ == address(0) ||
            destinationIsm_ == address(0) ||
            bytes(name_).length == 0 ||
            bytes(symbol_).length == 0
        ) revert XETAInvalidConfiguration();

        // Consume the upstream public initializer before the contract is live.
        // No initial supply. No permanently privileged owner.
        initialize(
            0,
            name_,
            symbol_,
            merkleTreeHook_,
            destinationIsm_,
            address(0)
        );
    }
    function _transferRemote(uint32 domain, bytes32 recipient, uint256 amount) internal override(TokenRouter, XETARouterCore) returns (bytes32) { return XETARouterCore._transferRemote(domain, recipient, amount); }
}
