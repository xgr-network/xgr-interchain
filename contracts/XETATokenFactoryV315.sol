// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XGRILNProtocol} from "./XGRILNProtocol.sol";
import {XGRILNRegistryV315} from "./XGRILNRegistryV315.sol";
import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XETAGuardedNativeWarpRouter} from "./XETAGuardedNativeWarpRouter.sol";
import {XETAGuardedSyntheticWarpRouter} from "./XETAGuardedSyntheticWarpRouter.sol";

/// @notice Public, parameter-locked XITA factory for the canonical XGR asset.
/// @dev This is v3.1.5's safe XGR-only bootstrap. General third-party ERC20
/// factory onboarding additionally needs proof of original token metadata and
/// destination factory binding before its first-claim can be made permanent.
/// No owner, arbitrary minter, or upgradable implementation exists here.
contract XETATokenFactoryV315 {
    uint64 public immutable localChainId;
    uint32 public immutable localDomain;
    address public immutable validatorRegistry;
    address public immutable mailbox;
    address public immutable merkleTreeHook;
    address public immutable destinationIsm;
    uint256 public immutable defaultDestinationGasLimit;

    XGRILNRegistryV315 public registry;
    mapping(bytes32 => address) public representation;

    error InvalidConfiguration();
    error RegistryNotDeployed();
    error RepresentationAlreadyExists();
    error WrongChain();

    event RegistryDeployed(address indexed registry);
    event RepresentationDeployed(bytes32 indexed assetId, address indexed router, uint64 chainId);

    constructor(
        uint64 localChainId_, uint32 localDomain_,
        address validatorRegistry_,
        address mailbox_, address hook_, address ism_, uint256 gasLimit_
    ) {
        if (block.chainid != localChainId_ || localChainId_ == 0 || localDomain_ == 0 ||
            validatorRegistry_ == address(0) || mailbox_ == address(0) ||
            hook_ == address(0) || ism_ == address(0) || gasLimit_ == 0)
            revert InvalidConfiguration();
        IXGRInterchainValidatorSetV2 v = IXGRInterchainValidatorSetV2(validatorRegistry_);
        if (v.destinationDomain() != localDomain_ || v.verifier() == address(0))
            revert InvalidConfiguration();
        localChainId = localChainId_;
        localDomain = localDomain_;
        validatorRegistry = validatorRegistry_;
        mailbox = mailbox_;
        merkleTreeHook = hook_;
        destinationIsm = ism_;
        defaultDestinationGasLimit = gasLimit_;
    }

    function xgrAssetId() public pure returns (bytes32) {
        return XGRILNProtocol.assetIdV315(1643, address(0), 0);
    }

    /// @notice Anyone may deploy exactly one factory-bound ILN registry.
    /// @dev Factory constructor fixes EVERY registry parameter before first use.
    function deployRegistry() external returns (address) {
        if (address(registry) != address(0)) return address(registry);
        XGRILNRegistryV315 r = new XGRILNRegistryV315(
            localChainId, localDomain, validatorRegistry, address(this)
        );
        registry = r;
        emit RegistryDeployed(address(r));
        return address(r);
    }

    /// @notice Anyone may deploy the canonical native XGR router exactly once.
    function deployNativeXGR() external returns (address router) {
        if (localChainId != 1643 || localDomain != 1643) revert WrongChain();
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        bytes32 assetId = xgrAssetId();
        if (representation[assetId] != address(0)) revert RepresentationAlreadyExists();
        router = address(new XETAGuardedNativeWarpRouter{salt: assetId}(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit
        ));
        representation[assetId] = router;
        emit RepresentationDeployed(assetId, router, localChainId);
    }

    /// @notice XGR has one mint/burn representation on each destination chain.
    /// @dev The factory chooses all token metadata: no deployer-controlled mint.
    function deployWrappedXGR() external returns (address router) {
        if (localChainId == 1643 || localDomain == 1643) revert WrongChain();
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        bytes32 assetId = xgrAssetId();
        if (representation[assetId] != address(0)) revert RepresentationAlreadyExists();
        router = address(new XETAGuardedSyntheticWarpRouter{salt: assetId}(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit,
            18, "Wrapped XGR", "wXGR"
        ));
        representation[assetId] = router;
        emit RepresentationDeployed(assetId, router, localChainId);
    }
}
