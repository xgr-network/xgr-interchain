// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {XETAGuardedCollateralWarpRouterV315} from "./XETAGuardedCollateralWarpRouterV315.sol";

/// @notice Immutable public CREATE2 router module. One shared instance per chain.
/// @dev Caller-namespaced salts prevent third parties from preempting a Factory
///      route deployment. Every router remains permissionlessly factory-registered.
contract XETACollateralRouterDeployer {
    function deploy(address token, address registry, address mailbox, address hook, address ism, uint256 gasLimit, bytes32 salt) external returns(address router) {
        bytes32 scopedSalt = keccak256(abi.encode(msg.sender, salt));
        router = address(new XETAGuardedCollateralWarpRouterV315{salt:scopedSalt}(token, registry, mailbox, hook, ism, gasLimit));
    }
}
