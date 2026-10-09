// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {XETAGuardedNativeWarpRouter} from "../contracts/XETAGuardedNativeWarpRouter.sol";
import {XETAGuardedSyntheticWarpRouter} from "../contracts/XETAGuardedSyntheticWarpRouter.sol";

/// @notice Deploy ONE native-XGR router on the XGRChain hub.
/// @dev Governance RouteAdd, Gateway deployment, remote bootstrap and
///      E2E validation take place separately; script has NO route authority.
contract DeployXETANativeAssetRouter is Script {
    function run() external returns (XETAGuardedNativeWarpRouter router) {
        require(block.chainid == 1643, "XGRChain only");
        address registry = vm.envAddress("ILN_REGISTRY");
        address mailbox_ = vm.envAddress("MAILBOX");
        address hook_ = vm.envAddress("MERKLE_TREE_HOOK");
        address ism = vm.envAddress("DESTINATION_ISM");
        uint256 gasLimit = vm.envUint("DEFAULT_DESTINATION_GAS_LIMIT");
        require(registry != address(0) && mailbox_ != address(0) &&
            hook_ != address(0) && ism != address(0) &&
            gasLimit > 0, "invalid infrastructure");
        vm.startBroadcast();
        router = new XETAGuardedNativeWarpRouter(
            registry, mailbox_, hook_, ism, gasLimit
        );
        vm.stopBroadcast();
    }
}

/// @notice Deploy ONE wXGR (or other synthetic token) router per chain.
/// @dev Synthetic supply always starts at zero. Bootstrap XETA route(s)
///      only after local source validator quorum ROUTE_ADD.
contract DeployXETASyntheticAssetRouter is Script {
    function run() external returns (XETAGuardedSyntheticWarpRouter router) {
        require(block.chainid != 0, "wrong chain");
        address registry = vm.envAddress("ILN_REGISTRY");
        address mailbox_ = vm.envAddress("MAILBOX");
        address hook_ = vm.envAddress("MERKLE_TREE_HOOK");
        address ism = vm.envAddress("DESTINATION_ISM");
        uint256 gasLimit = vm.envUint("DEFAULT_DESTINATION_GAS_LIMIT");
        uint256 decimals_ = vm.envUint("SYNTHETIC_DECIMALS");
        require(registry != address(0) && mailbox_ != address(0) &&
            hook_ != address(0) && ism != address(0) &&
            gasLimit > 0 && decimals_ <= 36, "invalid configuration");
        string memory name_ = vm.envString("SYNTHETIC_NAME");
        string memory symbol_ = vm.envString("SYNTHETIC_SYMBOL");
        vm.startBroadcast();
        router = new XETAGuardedSyntheticWarpRouter(
            registry, mailbox_, hook_, ism, gasLimit,
            uint8(decimals_), name_, symbol_
        );
        vm.stopBroadcast();
    }
}
