// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {ILNGateway} from "../contracts/ILNGateway.sol";
import {XGRILNInterchainISMV2} from "../contracts/XGRILNInterchainISMV2.sol";
import {XGRILNRegistry} from "../contracts/XGRILNRegistry.sol";
import {XGRInterchainBLSVerifier} from "../contracts/XGRInterchainBLSVerifier.sol";
import {XGRInterchainValidatorRegistryV2} from "../contracts/XGRInterchainValidatorRegistryV2.sol";

/// @notice Generic XGR Interchain v3.1.4 deployment scripts.
/// @dev Security-sensitive route activation is intentionally NOT performed here.
///      After deploying the route-specific Gateway, add the route through the
///      v3.1.4 ILN governance quorum flow so the canonical registry remains the
///      sole source of mutable route truth.
///
/// Common environment:
///   LOCAL_CHAIN_ID
///   LOCAL_DOMAIN
///
/// RegistryV2 environment:
///   MEMBERSHIP_ORIGIN_CHAIN_ID
///   BLS_VERIFIER
///   BLS_VERIFIER_FORMAT              (1 = compressed/native, 2 = EIP-2537)
///   MINIMUM_DEACTIVATION_RESERVE_WEI
///   MAX_EXECUTOR_REIMBURSEMENT_WEI
///   INITIAL_RESERVE_WEI              (per bootstrap validator)
///   VALIDATOR_COUNT
///   VALIDATOR_<N>_ADDRESS
///   VALIDATOR_<N>_BLS_COMPRESSED
///   VALIDATOR_<N>_BLS_EIP2537
///   VALIDATOR_<N>_POSSESSION_PROOF
///
/// ILN Registry environment:
///   LOCAL_REGISTRY_V2
///
/// ISM environment:
///   LOCAL_REGISTRY_V2
///
/// Gateway environment:
///   ILN_REGISTRY
///   ROUTE_ID
///   DESTINATION_DOMAIN
///   WARP_ROUTER
///   NATIVE_QUOTE_INCLUDES_PRINCIPAL
abstract contract DeployXETABase is Script {
    error WrongChain(uint256 expected, uint256 actual);
    error InvalidEnv();

    function _localChainId() internal returns (uint256 chainId) {
        chainId = vm.envUint("LOCAL_CHAIN_ID");
        if (chainId == 0) revert InvalidEnv();
        if (block.chainid != chainId) {
            revert WrongChain(chainId, block.chainid);
        }
    }

    function _localDomain() internal returns (uint32 domain) {
        uint256 raw = vm.envUint("LOCAL_DOMAIN");
        if (raw == 0 || raw > type(uint32).max) revert InvalidEnv();
        domain = uint32(raw);
    }

    function _asUint64(uint256 value) internal pure returns (uint64 out) {
        if (value == 0 || value > type(uint64).max) revert InvalidEnv();
        out = uint64(value);
    }

    function _validatorKey(
        uint256 index,
        string memory suffix
    ) internal returns (string memory) {
        return string.concat(
            "VALIDATOR_",
            vm.toString(index),
            suffix
        );
    }

    function _loadBootstrapValidators()
        internal
        returns (
            address[] memory validators,
            bytes[] memory compressedKeys,
            bytes[] memory eip2537Keys,
            bytes[] memory possessionProofs
        )
    {
        uint256 count = vm.envUint("VALIDATOR_COUNT");
        if (count == 0) revert InvalidEnv();

        validators = new address[](count);
        compressedKeys = new bytes[](count);
        eip2537Keys = new bytes[](count);
        possessionProofs = new bytes[](count);

        for (uint256 i = 0; i < count; i++) {
            validators[i] = vm.envAddress(
                _validatorKey(i, "_ADDRESS")
            );
            compressedKeys[i] = vm.envBytes(
                _validatorKey(i, "_BLS_COMPRESSED")
            );
            eip2537Keys[i] = vm.envBytes(
                _validatorKey(i, "_BLS_EIP2537")
            );
            possessionProofs[i] = vm.envBytes(
                _validatorKey(i, "_POSSESSION_PROOF")
            );
        }
    }
}

/// @notice Deploy the Solidity EIP-2537 verifier on chains that expose the
///         standard Prague BLS12-381 precompiles.
/// @dev Do NOT deploy this on XGRChain when using the native compressed verifier.
///      For XGRChain, configure BLS_VERIFIER to the native verifier address
///      (currently 0x0000000000000000000000000000000000002040) and format 1.
contract DeployXETAEIP2537Verifier is DeployXETABase {
    function run()
        external
        returns (XGRInterchainBLSVerifier verifier)
    {
        _localChainId();

        vm.startBroadcast();
        verifier = new XGRInterchainBLSVerifier();
        vm.stopBroadcast();
    }
}

/// @notice Deploy the canonical destination-scoped ValidatorRegistryV2.
/// @dev The same local RegistryV2 is also the governance authority for the
///      ILN Registry when this physical chain acts as a source chain.
contract DeployXETARegistryV2 is DeployXETABase {
    function run()
        external
        returns (XGRInterchainValidatorRegistryV2 registry)
    {
        _localChainId();
        uint32 localDomain = _localDomain();

        uint64 membershipOriginChainId = _asUint64(
            vm.envUint("MEMBERSHIP_ORIGIN_CHAIN_ID")
        );
        address verifier = vm.envAddress("BLS_VERIFIER");

        uint256 rawFormat = vm.envUint("BLS_VERIFIER_FORMAT");
        if (rawFormat == 0 || rawFormat > type(uint8).max) {
            revert InvalidEnv();
        }
        uint8 verifierFormat = uint8(rawFormat);

        uint256 minimumReserve = vm.envUint(
            "MINIMUM_DEACTIVATION_RESERVE_WEI"
        );
        uint256 maxReimbursement = vm.envUint(
            "MAX_EXECUTOR_REIMBURSEMENT_WEI"
        );
        uint256 reservePerValidator = vm.envUint(
            "INITIAL_RESERVE_WEI"
        );

        if (
            verifier == address(0) ||
            minimumReserve == 0 ||
            maxReimbursement == 0 ||
            reservePerValidator < minimumReserve
        ) revert InvalidEnv();

        (
            address[] memory validators,
            bytes[] memory compressedKeys,
            bytes[] memory eip2537Keys,
            bytes[] memory possessionProofs
        ) = _loadBootstrapValidators();

        uint256 deploymentValue =
            reservePerValidator * validators.length;

        vm.startBroadcast();
        registry = new XGRInterchainValidatorRegistryV2{
            value: deploymentValue
        }(
            membershipOriginChainId,
            localDomain,
            verifier,
            verifierFormat,
            minimumReserve,
            maxReimbursement,
            validators,
            compressedKeys,
            eip2537Keys,
            possessionProofs
        );
        vm.stopBroadcast();
    }
}

/// @notice Deploy the source-chain canonical ILN Registry.
/// @dev LOCAL_REGISTRY_V2 must be the RegistryV2 deployed on this same physical
///      chain. Route state is added later through quorum-approved governance.
contract DeployXETAILNRegistry is DeployXETABase {
    function run() external returns (XGRILNRegistry registry) {
        uint64 localChainId = _asUint64(_localChainId());
        uint32 localDomain = _localDomain();
        address localRegistryV2 = vm.envAddress(
            "LOCAL_REGISTRY_V2"
        );
        if (localRegistryV2 == address(0)) revert InvalidEnv();

        vm.startBroadcast();
        registry = new XGRILNRegistry(
            localChainId,
            localDomain,
            localRegistryV2
        );
        vm.stopBroadcast();
    }
}

/// @notice Deploy the generic destination ISM.
/// @dev This is the v3.1.4 route-aware ISM for both ordinary EVM destinations
///      and XGRChain. The RegistryV2 selects the actual verifier implementation,
///      so XGRChain can use its native verifier while Base-like chains use
///      XGRInterchainBLSVerifier/EIP-2537.
contract DeployXETAISM is DeployXETABase {
    function run()
        external
        returns (XGRILNInterchainISMV2 ism)
    {
        _localChainId();
        _localDomain();

        address localRegistryV2 = vm.envAddress(
            "LOCAL_REGISTRY_V2"
        );
        if (localRegistryV2 == address(0)) revert InvalidEnv();

        vm.startBroadcast();
        ism = new XGRILNInterchainISMV2(localRegistryV2);
        vm.stopBroadcast();
    }
}

/// @notice Deploy one route-specific source Gateway.
/// @dev The deployed Gateway is inert until a matching route record is added to
///      ILN_REGISTRY through the v3.1.4 governance quorum flow.
contract DeployXETAGateway is DeployXETABase {
    function run() external returns (ILNGateway gateway) {
        _localChainId();
        _localDomain();

        address ilnRegistry = vm.envAddress("ILN_REGISTRY");
        bytes32 routeId = vm.envBytes32("ROUTE_ID");
        uint256 rawDestinationDomain = vm.envUint(
            "DESTINATION_DOMAIN"
        );
        address warpRouter = vm.envAddress("WARP_ROUTER");
        bool nativeQuoteIncludesPrincipal = vm.envBool(
            "NATIVE_QUOTE_INCLUDES_PRINCIPAL"
        );

        if (
            ilnRegistry == address(0) ||
            routeId == bytes32(0) ||
            rawDestinationDomain == 0 ||
            rawDestinationDomain > type(uint32).max ||
            warpRouter == address(0)
        ) revert InvalidEnv();

        vm.startBroadcast();
        gateway = new ILNGateway(
            ilnRegistry,
            routeId,
            uint32(rawDestinationDomain),
            warpRouter,
            nativeQuoteIncludesPrincipal
        );
        vm.stopBroadcast();
    }
}
