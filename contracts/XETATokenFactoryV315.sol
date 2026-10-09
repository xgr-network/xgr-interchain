// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XGRILNProtocol} from "./XGRILNProtocol.sol";
import {XGRILNRegistryV315} from "./XGRILNRegistryV315.sol";
import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XETAGuardedNativeWarpRouter} from "./XETAGuardedNativeWarpRouter.sol";
import {XETAGuardedSyntheticWarpRouter} from "./XETAGuardedSyntheticWarpRouter.sol";
import {XETAGuardedCollateralWarpRouterV315} from "./XETAGuardedCollateralWarpRouterV315.sol";
import {ILNGateway} from "./ILNGateway.sol";

interface IXITATokenRouter {
    function token() external view returns (address);
    function bootstrapXETARoute(uint32 destinationDomain, bytes32 routeId) external;
}

/// @notice Immutable permissionless factory; no exclusive asset registration.
/// @dev All assets, including native XGR, use the same route instance ID.
/// Routers deploy first and bind to an independently deployed remote router
/// second, avoiding circular cross-chain CREATE2 address dependencies.
contract XETATokenFactoryV315 {
    uint64 public immutable localChainId;
    uint32 public immutable localDomain;
    address public immutable validatorRegistry;
    address public immutable mailbox;
    address public immutable merkleTreeHook;
    address public immutable destinationIsm;
    uint256 public immutable defaultDestinationGasLimit;

    XGRILNRegistryV315 public registry;

    mapping(address => bytes32) public assetIdForRouter;
    mapping(address => bytes32) public representedAssetId;
    mapping(address => address) public routerCreator;
    mapping(address => mapping(uint32 => bool)) public routeForDomainPrepared;

    error InvalidConfiguration();
    error RegistryNotDeployed();
    error InvalidOrigin();
    error WrongChain();
    error RouterUnauthorized();
    error RouteAlreadyPrepared();
    error InvalidDestination();
    error InvalidRouteActivation();

    event RegistryDeployed(address indexed registry);
    event RouterDeployed(bytes32 indexed assetId, address indexed router, address indexed creator);
    event RoutePrepared(bytes32 indexed routeId, address indexed router, address indexed gateway);
    event RouteActivated(bytes32 indexed routeId, address indexed router, uint32 indexed destinationDomain);

    constructor(
        uint64 chainId_, uint32 domain_, address validatorRegistry_,
        address mailbox_, address hook_, address ism_, uint256 gasLimit_
    ) {
        if (chainId_ == 0 || block.chainid != chainId_ || domain_ == 0 ||
            validatorRegistry_ == address(0) || validatorRegistry_.code.length == 0 ||
            mailbox_ == address(0) || mailbox_.code.length == 0 ||
            hook_ == address(0) || ism_ == address(0) || gasLimit_ == 0)
            revert InvalidConfiguration();
        IXGRInterchainValidatorSetV2 validators =
            IXGRInterchainValidatorSetV2(validatorRegistry_);
        if (validators.destinationDomain() != domain_ ||
            validators.verifier() == address(0)) revert InvalidConfiguration();
        localChainId = chainId_;
        localDomain = domain_;
        validatorRegistry = validatorRegistry_;
        mailbox = mailbox_;
        merkleTreeHook = hook_;
        destinationIsm = ism_;
        defaultDestinationGasLimit = gasLimit_;
    }

    function deployRegistry() external returns (address) {
        if (address(registry) != address(0)) return address(registry);
        XGRILNRegistryV315 r = new XGRILNRegistryV315(
            localChainId, localDomain, validatorRegistry, address(this)
        );
        registry = r;
        emit RegistryDeployed(address(r));
        return address(r);
    }

    function xgrAssetId() public pure returns (bytes32) {
        return XGRILNProtocol.assetIdV315(1643, address(0), 0);
    }

    function _requireRegistry() private view {
        if (address(registry) == address(0)) revert RegistryNotDeployed();
    }

    function _remember(bytes32 assetId, address router, bool wrapped) private {
        assetIdForRouter[router] = assetId;
        routerCreator[router] = msg.sender;
        if (wrapped) representedAssetId[router] = assetId;
        emit RouterDeployed(assetId, router, msg.sender);
    }

    /// @notice Source escrow for an ERC20 originating on this chain, or for
    /// an independently authenticated synthetic received on the hub.
    function deployCollateralRouter(address originalToken, bytes32 salt_)
        external returns (bytes32 assetId, address router)
    {
        _requireRegistry();
        if (originalToken.code.length == 0) revert InvalidOrigin();
        assetId = representedAssetId[originalToken];
        if (assetId == bytes32(0))
            assetId = XGRILNProtocol.assetIdV315(localChainId, originalToken, 1);
        bytes32 salt = keccak256(abi.encode("XITA_COLLATERAL_V315", msg.sender, salt_, assetId, originalToken));
        router = address(new XETAGuardedCollateralWarpRouterV315{salt: salt}(
            originalToken, address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit
        ));
        _remember(assetId, router, false);
    }

    /// @notice Synthetic claims remain zero-supply until authorized inbound
    /// delivery. Names and decimals supplied at creation are NOT origin proof.
    function deploySyntheticRouter(
        uint64 originChainId, address originToken, uint8 decimals_,
        string calldata name_, string calldata symbol_, bytes32 salt_
    ) external returns (bytes32 assetId, address router) {
        _requireRegistry();
        if (originChainId == 0 || originChainId == localChainId ||
            originToken == address(0) || decimals_ > 18 ||
            bytes(name_).length == 0 || bytes(symbol_).length == 0)
            revert InvalidOrigin();
        assetId = XGRILNProtocol.assetIdV315(originChainId, originToken, 1);
        bytes32 salt = keccak256(abi.encode(
            "XITA_SYNTHETIC_V315", msg.sender, salt_, assetId, decimals_,
            keccak256(bytes(name_)), keccak256(bytes(symbol_))
        ));
        router = address(new XETAGuardedSyntheticWarpRouter{salt: salt}(
            address(registry), mailbox, merkleTreeHook, destinationIsm,
            defaultDestinationGasLimit, decimals_, name_, symbol_
        ));
        _remember(assetId, router, true);
    }

    function deployNativeXGRRouter(bytes32 salt_) external returns (address router) {
        if (localChainId != 1643 || localDomain != 1643) revert WrongChain();
        _requireRegistry();
        bytes32 salt = keccak256(abi.encode("XITA_NATIVE_XGR_V315", msg.sender, salt_));
        router = address(new XETAGuardedNativeWarpRouter{salt: salt}(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit
        ));
        _remember(xgrAssetId(), router, false);
    }

    function deployWrappedXGRRouter(bytes32 salt_) external returns (address router) {
        if (localChainId == 1643 || localDomain == 1643) revert WrongChain();
        _requireRegistry();
        bytes32 salt = keccak256(abi.encode("XITA_WRAPPED_XGR_V315", msg.sender, salt_));
        router = address(new XETAGuardedSyntheticWarpRouter{salt: salt}(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit,
            18, "Wrapped XGR", "wXGR"
        ));
        _remember(xgrAssetId(), router, true);
    }

    /// @notice Public route enrollment by creator of THIS router instance.
    /// @dev Anyone may deploy their own routers and register their own routes.
    /// Multiple routes for the same asset and direction are permitted.
    function prepareRoute(
        address sourceRouter, uint64 destinationChainId,
        uint32 destinationDomain, address destinationRouter, address destinationToken
    ) external returns (bytes32 routeId, address gateway) {
        _requireRegistry();
        bytes32 assetId = assetIdForRouter[sourceRouter];
        if (assetId == bytes32(0) || routerCreator[sourceRouter] != msg.sender)
            revert RouterUnauthorized();
        if (destinationChainId == 0 || destinationChainId == localChainId ||
            destinationDomain == 0 || destinationDomain == localDomain ||
            destinationRouter == address(0) ||
            (localDomain != 1643 && destinationDomain != 1643))
            revert InvalidDestination();
        if (routeForDomainPrepared[sourceRouter][destinationDomain])
            revert RouteAlreadyPrepared();

        routeId = XGRILNProtocol.routeInstanceIdV315(
            assetId, localChainId, localDomain, destinationChainId,
            destinationDomain, sourceRouter, destinationRouter
        );
        gateway = address(new ILNGateway{
            salt: keccak256(abi.encode("XITA_GATEWAY_V315", routeId))
        }(address(registry), routeId, destinationDomain, sourceRouter, false));
        routeForDomainPrepared[sourceRouter][destinationDomain] = true;
        bytes32 registered = registry.registerRouteInstance(
            assetId, destinationChainId, destinationDomain,
            IXITATokenRouter(sourceRouter).token(), destinationToken,
            gateway, sourceRouter, mailbox, merkleTreeHook, destinationRouter
        );
        if (registered != routeId) revert InvalidRouteActivation();
        emit RoutePrepared(routeId, sourceRouter, gateway);
    }

    /// @notice Technical transfer-safety attestation, NOT permission to list
    /// a token. The validator set checks objective reciprocal chain facts.
    /// A failed proof reverts without changing registration or collateral.
    function activateRoute(
        XGRILNRegistryV315.RouteSafetyProofV315 calldata proof,
        bytes calldata signerBitmap, bytes calldata aggregateSignature
    ) external {
        _requireRegistry();
        registry.confirmRouteInstance(proof, signerBitmap, aggregateSignature);
        (,,, address router,,,,, bool enabled) =
            registry.getRoute(proof.destinationDomain, proof.routeId);
        if (!enabled || assetIdForRouter[router] == bytes32(0))
            revert InvalidRouteActivation();
        IXITATokenRouter(router).bootstrapXETARoute(proof.destinationDomain, proof.routeId);
        emit RouteActivated(proof.routeId, router, proof.destinationDomain);
    }
}
