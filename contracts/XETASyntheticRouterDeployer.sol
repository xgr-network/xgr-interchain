// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {XETAGuardedSyntheticWarpRouter} from "./XETAGuardedSyntheticWarpRouter.sol";

/// @notice Immutable public CREATE2 router module. One shared instance per chain.
/// @dev Caller-namespaced salts prevent third parties from preempting a Factory
///      route deployment. Every router remains permissionlessly factory-registered.
contract XETASyntheticRouterDeployer {
    function deploy(address registry, address mailbox, address hook, address ism, uint256 gasLimit, uint8 decimals, string calldata name, string calldata symbol, bytes32 salt) external returns(address router) {
        bytes32 scopedSalt = keccak256(abi.encode(msg.sender, salt));
        router = address(new XETAGuardedSyntheticWarpRouter{salt:scopedSalt}(registry, mailbox, hook, ism, gasLimit, decimals, name, symbol));
    }
}
