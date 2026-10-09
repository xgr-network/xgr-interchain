// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XGRILNProtocol} from "./XGRILNProtocol.sol";
import {XGRILNRegistryV315} from "./XGRILNRegistryV315.sol";
import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XETAGuardedNativeWarpRouter} from "./XETAGuardedNativeWarpRouter.sol";
import {XETAGuardedSyntheticWarpRouter} from "./XETAGuardedSyntheticWarpRouter.sol";
import {ILNGateway} from "./ILNGateway.sol";

interface IXETAXGRRouterBootstrapV315 {
    function bootstrapXETARoute(uint32 destinationDomain, bytes32 routeId) external;
}

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

    /// @dev Cross-chain peer bindings are a deployment-time trust boundary.
    /// They are NOT first-caller arguments and cannot be changed after creation.
    struct XGRPeer {
        uint64 chainId;
        address router;
    }

    mapping(uint32 => XGRPeer) public xgrPeerForDomain;

    error InvalidConfiguration();
    error RegistryNotDeployed();
    error RepresentationAlreadyExists();
    error WrongChain();
    error InvalidPeerConfiguration();
    error PeerNotConfigured();
    error RepresentationNotDeployed();
    error RouteAlreadyExists();

    event RegistryDeployed(address indexed registry);
    event RepresentationDeployed(bytes32 indexed assetId, address indexed router, uint64 chainId);
    event XGRRouteCreated(
        bytes32 indexed routeId,
        uint32 indexed destinationDomain,
        address indexed gateway,
        address sourceRouter,
        address destinationRouter
    );

    constructor(
        uint64 localChainId_, uint32 localDomain_,
        address validatorRegistry_,
        address mailbox_, address hook_, address ism_, uint256 gasLimit_,
        uint64[] memory peerChainIds_, uint32[] memory peerDomains_,
        address[] memory peerRouters_
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

        // A permissionless caller cannot reserve the sole official route with
        // an arbitrary remote router. The counterpart must be authenticated
        // during factory deployment, prior to exposing public route creation.
        if (peerChainIds_.length != peerDomains_.length ||
            peerDomains_.length != peerRouters_.length) revert InvalidPeerConfiguration();
        for (uint256 i; i < peerDomains_.length; ++i) {
            uint32 remoteDomain = peerDomains_[i];
            if (peerChainIds_[i] == 0 || peerChainIds_[i] == localChainId_ ||
                remoteDomain == 0 || remoteDomain == localDomain_ ||
                peerRouters_[i] == address(0) ||
                xgrPeerForDomain[remoteDomain].router != address(0) ||
                (localDomain_ != 1643 && remoteDomain != 1643))
                revert InvalidPeerConfiguration();
            xgrPeerForDomain[remoteDomain] =
                XGRPeer({chainId: peerChainIds_[i], router: peerRouters_[i]});
        }
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

    /// @notice Permissionless, ATOMIC bootstrap of a pre-authenticated XGR peer.
    /// @dev Requires an initialized source fee. Every failure atomically
    /// reverts Gateway, FeeVault, registry insert and Router enrollment.
    /// Third-party ERC20 routes are NOT admitted by this XGR-only bootstrap.
    function createXGRRoute(uint32 destinationDomain_)
        external returns (bytes32 routeId, address gateway)
    {
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        bytes32 assetId = xgrAssetId();
        address sourceRouter = representation[assetId];
        if (sourceRouter == address(0)) revert RepresentationNotDeployed();
        XGRPeer memory peer = xgrPeerForDomain[destinationDomain_];
        if (peer.router == address(0)) revert PeerNotConfigured();

        routeId = XGRILNProtocol.routeIdV315(
            assetId, localChainId, localDomain,
            peer.chainId, destinationDomain_
        );
        if (registry.exists(destinationDomain_, routeId)) revert RouteAlreadyExists();

        gateway = address(new ILNGateway{
            salt: keccak256(abi.encodePacked("XITA_GATEWAY_V315", routeId))
        }(address(registry), routeId, destinationDomain_, sourceRouter, false));

        // Native XGR has no ERC20 address; wrapped XGR is the ERC20 Router.
        // Registry stores these addresses as immutable route evidence.
        address sourceToken = localDomain == 1643 ? address(0) : sourceRouter;
        address destinationToken =
            destinationDomain_ == 1643 ? address(0) : peer.router;
        bytes32 registeredRouteId = registry.registerRoute(
            assetId, peer.chainId, destinationDomain_,
            sourceToken, destinationToken, gateway, sourceRouter,
            mailbox, merkleTreeHook, peer.router
        );
        if (registeredRouteId != routeId) revert InvalidConfiguration();

        IXETAXGRRouterBootstrapV315(sourceRouter).bootstrapXETARoute(
            destinationDomain_, routeId
        );
        emit XGRRouteCreated(
            routeId, destinationDomain_, gateway, sourceRouter, peer.router
        );
    }

}
