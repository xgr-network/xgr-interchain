// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TokenRouter} from "@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol";
import {IXGRILNRegistry} from "./IXGRILNRegistry.sol";
import {XGRILNProtocol} from "./XGRILNProtocol.sol";

interface IXETARouteAssetLookup {
    function assetRoute(uint32 domain, bytes32 routeId) external view returns (
        bytes32 assetId, uint64 remoteChainId, address sourceToken, address destinationToken);
}

/// @dev Gateway getters are immutable; routing authority is permissionless and
///      bound to the on-chain source registry. No route admission quorum.
interface IXETABoundGateway {
    function ilnRegistry() external view returns (IXGRILNRegistry);
    function routeId() external view returns (bytes32);
    function destinationDomain() external view returns (uint32);
    function warpRouter() external view returns (address);
}

/// @notice One XETA router CORE per asset and physical chain.
/// @dev Inherits the original Hyperlane TokenRouter dispatch + inbound handling.
///      Every outgoing token movement is guarded at the INTERNAL entry point.
///      XGRChain (domain 1643) is always one endpoint of every route.
///      Routes are bound once to the Factory-authorized public registry.
///      Hyperlane ownership MUST be renounced during concrete router setup.
abstract contract XETARouterCore is TokenRouter {
    uint32 internal constant XGR_HUB_DOMAIN = 1643;

    IXGRILNRegistry public immutable xetaRegistry;
    uint256 public immutable xetaDefaultDestinationGasLimit;

    // One routed asset can have multiple remote domains but each domain
    // has exactly one immutable route/Gateway binding on this router.
    mapping(uint32 => bytes32) public xetaRouteIdForDomain;

    error XETAInvalidConfiguration();
    error XETAInvalidRoute();
    error XETAUnauthorizedGateway();
    error XETAAlreadyInitialized();
    error XETAInvalidGatewayBinding();

    event XETARouteBootstrapped(
        uint32 indexed destinationDomain,
        bytes32 indexed routeId,
        address indexed gateway,
        address destinationRouter
    );

    constructor(address registry_, uint256 defaultDestinationGasLimit_) {
        if (
            registry_ == address(0) ||
            registry_.code.length == 0 ||
            defaultDestinationGasLimit_ == 0
        ) revert XETAInvalidConfiguration();
        xetaRegistry = IXGRILNRegistry(registry_);
        xetaDefaultDestinationGasLimit = defaultDestinationGasLimit_;
    }

    /// @notice Permissionless, one-time enrollment by the public token Factory.
    /// @dev No founder-owned key and no ability to replace an enrolled remote.
    ///      The canonical gateway is verified as a REAL ILNGateway instance
    ///      with the exact immutable router/registry/route/domain bindings.
    function bootstrapXETARoute(uint32 destination, bytes32 routeId) external {
        if (routeId == bytes32(0)) revert XETAInvalidRoute();
        if (xetaRouteIdForDomain[destination] != bytes32(0)) {
            revert XETAAlreadyInitialized();
        }

        IXGRILNRegistry.RouteRecord memory route =
            _xetaCanonicalRoute(destination, routeId);

        if (routers(destination) != bytes32(0)) revert XETAInvalidRoute();
        if (route.gateway.code.length == 0) revert XETAInvalidGatewayBinding();

        IXETABoundGateway gateway = IXETABoundGateway(route.gateway);
        if (
            address(gateway.ilnRegistry()) != address(xetaRegistry) ||
            gateway.routeId() != routeId ||
            gateway.destinationDomain() != destination ||
            gateway.warpRouter() != address(this)
        ) revert XETAInvalidGatewayBinding();

        xetaRouteIdForDomain[destination] = routeId;
        _enrollRemoteRouter(
            destination,
            bytes32(uint256(uint160(route.destinationRouter)))
        );
        _setDestinationGas(destination, xetaDefaultDestinationGasLimit);

        emit XETARouteBootstrapped(
            destination,
            routeId,
            route.gateway,
            route.destinationRouter
        );
    }

    /// @notice Destination ISM asks the actual recipient router to authenticate
    ///         the signed source route against this router's own asset ID.
    /// @dev No external chain calls or human route approvals. The configured
    ///      local reverse route stores the expected canonical asset identity.
    function verifyInboundRoute(
        uint64 originChainId,
        uint32 originDomain,
        address originRouter,
        bytes32 signedOriginRouteId
    ) external view returns (bool) {
        bytes32 localRouteId = xetaRouteIdForDomain[originDomain];
        if (originChainId == 0 || originDomain == 0 || originRouter == address(0) ||
            signedOriginRouteId == bytes32(0) || localRouteId == bytes32(0))
            return false;

        IXGRILNRegistry.RouteRecord memory local = _xetaCanonicalRoute(
            originDomain, localRouteId
        );
        if (local.destinationRouter != originRouter ||
            routers(originDomain) != bytes32(uint256(uint160(originRouter))))
            return false;

        (bytes32 assetId, uint64 registeredOriginChain,,) =
            IXETARouteAssetLookup(address(xetaRegistry)).assetRoute(originDomain, localRouteId);
        if (assetId == bytes32(0) || registeredOriginChain != originChainId)
            return false;

        bytes32 expectedOriginRoute = XGRILNProtocol.routeInstanceIdV315(
            assetId, originChainId, originDomain, uint64(block.chainid),
            localDomain, originRouter, address(this)
        );
        return signedOriginRouteId == expectedOriginRoute;
    }

    /// @dev Hyperlane's PUBLIC transferRemote calls this internal function.
    ///      Overrides in concrete adapters MUST NOT bypass this implementation.
    function _transferRemote(
        uint32 destination,
        bytes32 recipient,
        uint256 amount
    ) internal virtual override returns (bytes32 messageId) {
        bytes32 routeId = xetaRouteIdForDomain[destination];
        if (routeId == bytes32(0)) revert XETAInvalidRoute();

        IXGRILNRegistry.RouteRecord memory route =
            _xetaCanonicalRoute(destination, routeId);

        if (
            msg.sender != route.gateway ||
            routers(destination) != bytes32(uint256(uint160(route.destinationRouter)))
        ) revert XETAUnauthorizedGateway();

        return super._transferRemote(destination, recipient, amount);
    }

    function _xetaCanonicalRoute(uint32 destination, bytes32 routeId)
        internal view
        returns (IXGRILNRegistry.RouteRecord memory route)
    {
        // The hub can have many spokes. A spoke can only connect to the hub.
        if (
            destination == 0 ||
            destination == localDomain ||
            (localDomain != XGR_HUB_DOMAIN && destination != XGR_HUB_DOMAIN)
        ) revert XETAInvalidRoute();

        (
            route.sourceChainId,
            route.sourceDomain,
            route.gateway,
            route.sourceRouter,
            route.mailbox,
            route.dispatchHook,
            route.destinationRouter,
            route.validatorFeeWei,
            route.enabled
        ) = xetaRegistry.getRoute(destination, routeId);

        if (
            !route.enabled ||
            route.sourceChainId != uint64(block.chainid) ||
            route.sourceDomain != localDomain ||
            route.gateway == address(0) ||
            route.sourceRouter != address(this) ||
            route.mailbox != address(mailbox) ||
            route.dispatchHook != address(hook) ||
            route.destinationRouter == address(0) ||
            route.validatorFeeWei == 0
        ) revert XETAInvalidRoute();
    }
}
