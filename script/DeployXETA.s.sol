// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XGRILNInterchainISMV2} from "../contracts/XGRILNInterchainISMV2.sol";
import {XGRInterchainBLSVerifier} from "../contracts/XGRInterchainBLSVerifier.sol";
import {XGRInterchainValidatorRegistryV2} from "../contracts/XGRInterchainValidatorRegistryV2.sol";

/// @notice XITA v3.1.5 independent deployment scripts.
/// @dev Deploy the BLS verifier/validator registry/ISM, then deploy the
/// permissionless Factory. ALL asset routers and route Gateways are created
/// later through public Factory functions. NO route governance exists.
///
/// Common environment: LOCAL_CHAIN_ID, LOCAL_DOMAIN
/// Validator registry: MEMBERSHIP_ORIGIN_CHAIN_ID, BLS_VERIFIER,
/// BLS_VERIFIER_FORMAT, MINIMUM_DEACTIVATION_RESERVE_WEI,
/// MAX_EXECUTOR_REIMBURSEMENT_WEI, INITIAL_RESERVE_WEI, VALIDATOR_COUNT,
/// VALIDATOR_<N>_ADDRESS, _BLS_COMPRESSED, _BLS_EIP2537, _POSSESSION_PROOF.
/// Factory: LOCAL_REGISTRY_V2, MAILBOX, MERKLE_TREE_HOOK, DESTINATION_ISM,
/// DEFAULT_DESTINATION_GAS_LIMIT, INITIAL_SOURCE_FEE_WEI.
///
/// WARNING: always validate both chain counterparts and signer/BLS
/// verification before any mainnet transfer. Deployment is not activation.
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

/// @notice Deploy the validator set trust anchor for this source/destination.
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

/// @notice Deploy the destination ISM that checks BLS transfer checkpoints.
/// @dev This is the v3.1.5 route-aware ISM for both ordinary EVM destinations
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

/// @notice Factory deploys its own source registry and all public routers.
contract DeployXETAFactoryV315 is DeployXETABase {
    function run() external returns (XETATokenFactoryV315 factory) {
        uint64 chainId = _asUint64(_localChainId());
        uint32 domain = _localDomain();
        address validators = vm.envAddress("LOCAL_REGISTRY_V2");
        address mailbox_ = vm.envAddress("MAILBOX");
        address hook_ = vm.envAddress("MERKLE_TREE_HOOK");
        address ism_ = vm.envAddress("DESTINATION_ISM");
        uint256 gasLimit = vm.envUint("DEFAULT_DESTINATION_GAS_LIMIT");
        uint256 initialFeeWei = vm.envUint("INITIAL_SOURCE_FEE_WEI");
        if (validators == address(0) || mailbox_ == address(0) ||
            hook_ == address(0) || ism_ == address(0) || gasLimit == 0 || initialFeeWei == 0)
            revert InvalidEnv();

        vm.startBroadcast();
        factory = new XETATokenFactoryV315(
            chainId, domain, validators, mailbox_, hook_, ism_, gasLimit, initialFeeWei
        );
        factory.deployRegistry();
        vm.stopBroadcast();
    }
}
