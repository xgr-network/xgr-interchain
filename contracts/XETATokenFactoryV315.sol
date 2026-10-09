// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XGRILNProtocol} from "./XGRILNProtocol.sol";
import {XGRILNRegistryV315} from "./XGRILNRegistryV315.sol";
import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XETAGuardedNativeWarpRouter} from "./XETAGuardedNativeWarpRouter.sol";
import {XETAGuardedSyntheticWarpRouter} from "./XETAGuardedSyntheticWarpRouter.sol";
import {ILNGateway} from "./ILNGateway.sol";
import {XETAGuardedCollateralWarpRouterV315} from "./XETAGuardedCollateralWarpRouterV315.sol";

interface IILNXETATokenView {
    function token() external view returns (address);
}

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

    struct OpenRouteRequest {
        uint64 destinationChainId;
        uint32 destinationDomain;
        address destinationRouter;
        bytes32 userSalt;
    }

    /// @dev Every open ERC20 route receives a fresh independent Router.
    /// Synthetic tokens deployed by this factory retain their original
    /// canonical assetId even when later locked for a second hub hop.
    mapping(address => bytes32) public openRouterAssetId;
    mapping(address => bytes32) public representedAssetId;
    mapping(address => address) public openRouterCreator;
    mapping(address => mapping(uint32 => bool)) public openRouterDomainReserved;

    error InvalidConfiguration();
    error RegistryNotDeployed();
    error RepresentationAlreadyExists();
    error WrongChain();
    error InvalidPeerConfiguration();
    error PeerNotConfigured();
    error RepresentationNotDeployed();
    error RouteAlreadyExists();
    error InvalidOpenRoute();
    error UnauthorizedRouterCreator();
    error RouterDomainReserved();

    event RegistryDeployed(address indexed registry);
    event RepresentationDeployed(bytes32 indexed assetId, address indexed router, uint64 chainId);
    event XGRRouteCreated(
        bytes32 indexed routeId,
        uint32 indexed destinationDomain,
        address indexed gateway,
        address sourceRouter,
        address destinationRouter
    );
    event ERC20RoutePrepared(
        bytes32 indexed assetId,
        bytes32 indexed routeId,
        address indexed router,
        address gateway,
        uint32 destinationDomain,
        address destinationRouter
    );
    event ERC20RouteActivated(bytes32 indexed routeId, address indexed router);

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

    /// @notice Step 1: deploy standalone collateral escrow before knowing
    /// the opposite chain's router address. This avoids CREATE2 circularity.
    function deployOpenCollateralRouter(address token_, bytes32 userSalt)
        external returns (bytes32 assetId, address router)
    {
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        if (token_.code.length == 0) revert InvalidOpenRoute();
        assetId = representedAssetId[token_];
        if (assetId == bytes32(0))
            assetId = XGRILNProtocol.assetIdV315(localChainId, token_, 1);
        router = address(new XETAGuardedCollateralWarpRouterV315{
            salt: keccak256(abi.encode(
                "XITA_COLLATERAL_UNBOUND_V315", msg.sender, userSalt,
                assetId, token_
            ))
        }(
            token_, address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit
        ));
        openRouterAssetId[router] = assetId;
        openRouterCreator[router] = msg.sender;
    }

    /// @notice Step 1 on the destination chain: zero-supply representation.
    /// Any metadata claim remains unverified until remote safety attestation.
    function deployOpenSyntheticRouter(
        uint64 originChainId, address originToken, uint8 decimals_,
        string calldata name_, string calldata symbol_, bytes32 userSalt
    ) external returns (bytes32 assetId, address router) {
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        if (originChainId == localChainId || originToken == address(0) ||
            decimals_ > 18 || bytes(name_).length == 0 ||
            bytes(symbol_).length == 0) revert InvalidOpenRoute();
        assetId = XGRILNProtocol.assetIdV315(originChainId, originToken, 1);
        router = address(new XETAGuardedSyntheticWarpRouter{
            salt: keccak256(abi.encode(
                "XITA_SYNTH_UNBOUND_V315", msg.sender, userSalt, assetId,
                decimals_, keccak256(bytes(name_)), keccak256(bytes(symbol_))
            ))
        }(
            address(registry), mailbox, merkleTreeHook, destinationIsm,
            defaultDestinationGasLimit, decimals_, name_, symbol_
        ));
        openRouterAssetId[router] = assetId;
        representedAssetId[router] = assetId;
        openRouterCreator[router] = msg.sender;
    }

    function deployOpenNativeXGRRouter(bytes32 userSalt)
        external returns (address router)
    {
        if (localChainId != 1643 || localDomain != 1643) revert WrongChain();
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        router = address(new XETAGuardedNativeWarpRouter{
            salt: keccak256(abi.encode(
                "XITA_NATIVE_UNBOUND_V315", msg.sender, userSalt
            ))
        }(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit
        ));
        openRouterAssetId[router] = xgrAssetId();
        openRouterCreator[router] = msg.sender;
    }

    function deployOpenWrappedXGRRouter(bytes32 userSalt)
        external returns (address router)
    {
        if (localChainId == 1643 || localDomain == 1643) revert WrongChain();
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        router = address(new XETAGuardedSyntheticWarpRouter{
            salt: keccak256(abi.encode(
                "XITA_WRAPPED_UNBOUND_V315", msg.sender, userSalt
            ))
        }(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit,
            18, "XITA XGR Route (Unverified)", "xwXGR"
        ));
        openRouterAssetId[router] = xgrAssetId();
        openRouterCreator[router] = msg.sender;
    }

    /// @notice Step 2: pair routers already deployed on both chains.
    /// @dev Only the creator may bind their OWN router, never someone else's.
    /// Once paired, registration is append-only and no user can later change
    /// the remote address. Every route still needs objective safety evidence.
    function prepareExistingOpenRouterRoute(
        address router,
        uint64 destinationChainId,
        uint32 destinationDomain,
        address destinationRouter,
        address destinationToken
    ) external returns (bytes32 routeId, address gateway) {
        bytes32 assetId = openRouterAssetId[router];
        if (assetId == bytes32(0) ||
            openRouterCreator[router] != msg.sender)
            revert UnauthorizedRouterCreator();
        if (openRouterDomainReserved[router][destinationDomain])
            revert RouterDomainReserved();
        OpenRouteRequest memory request = OpenRouteRequest({
            destinationChainId: destinationChainId,
            destinationDomain: destinationDomain,
            destinationRouter: destinationRouter,
            userSalt: bytes32(0)
        });
        _validateOpenRequest(request);
        openRouterDomainReserved[router][destinationDomain] = true;
        (routeId, gateway) = _prepareOpenRoute(
            assetId, IILNXETATokenView(router).token(),
            destinationToken, router, request
        );
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


    /// @notice Deploy an independent collateral router, then record a
    /// pending route. Any ERC20 can be used; repeated assets are allowed.
    /// @dev A previously factory-issued synthetic ERC20 preserves its
    /// ORIGINAL assetId when used as collateral for a second hop through XGR.
    function createERC20CollateralRoute(
        address underlyingToken, OpenRouteRequest calldata request
    ) external returns (bytes32 routeId, address router, address gateway) {
        _validateOpenRequest(request);
        if (underlyingToken.code.length == 0) revert InvalidOpenRoute();
        if (address(registry) == address(0)) revert RegistryNotDeployed();

        bytes32 assetId = representedAssetId[underlyingToken];
        if (assetId == bytes32(0)) {
            assetId = XGRILNProtocol.assetIdV315(
                localChainId, underlyingToken, 1
            );
        }
        bytes32 salt = keccak256(abi.encode(
            "XITA_COLLATERAL_V315", msg.sender, request.userSalt,
            assetId, underlyingToken, request.destinationChainId,
            request.destinationDomain, request.destinationRouter
        ));
        router = address(new XETAGuardedCollateralWarpRouterV315{salt: salt}(
            underlyingToken, address(registry), mailbox,
            merkleTreeHook, destinationIsm, defaultDestinationGasLimit
        ));
        openRouterAssetId[router] = assetId;
        (routeId, gateway) = _prepareOpenRoute(
            assetId, underlyingToken, request.destinationRouter, router, request
        );
    }

    /// @notice Deploy an isolated zero-supply wrapped ERC20 representation.
    /// @dev User-supplied origin metadata is UNVERIFIED until the reciprocal
    /// remote Registry/Router and actual origin ERC20 are safety-attested.
    /// No singleton is reserved by a first caller or metadata claim.
    function createERC20SyntheticRoute(
        uint64 canonicalChainId,
        address canonicalToken,
        uint8 decimals_,
        string calldata name_,
        string calldata symbol_,
        OpenRouteRequest calldata request
    ) external returns (bytes32 routeId, address router, address gateway) {
        _validateOpenRequest(request);
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        if (canonicalToken == address(0) ||
            canonicalChainId == localChainId ||
            decimals_ > 18 || bytes(name_).length == 0 ||
            bytes(symbol_).length == 0)
            revert InvalidOpenRoute();

        bytes32 assetId = XGRILNProtocol.assetIdV315(
            canonicalChainId, canonicalToken, 1
        );
        bytes32 salt = keccak256(abi.encode(
            "XITA_SYNTHETIC_V315", msg.sender, request.userSalt,
            assetId, request.destinationChainId,
            request.destinationDomain, request.destinationRouter,
            decimals_, keccak256(bytes(name_)), keccak256(bytes(symbol_))
        ));
        router = address(new XETAGuardedSyntheticWarpRouter{salt: salt}(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit,
            decimals_, name_, symbol_
        ));
        openRouterAssetId[router] = assetId;
        representedAssetId[router] = assetId;

        address destinationToken = request.destinationChainId == canonicalChainId
            ? canonicalToken : request.destinationRouter;
        (routeId, gateway) = _prepareOpenRoute(
            assetId, router, destinationToken, router, request
        );
    }

    /// @notice Permissionless isolated native XGR escrow for a NEW route.
    /// @dev Does not take over the canonical singleton representation or
    /// make an unverifiable first claim to a unique asset/chain slot.
    function createOpenNativeXGRRoute(OpenRouteRequest calldata request)
        external returns (bytes32 routeId, address router, address gateway)
    {
        if (localChainId != 1643 || localDomain != 1643) revert WrongChain();
        _validateOpenRequest(request);
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        bytes32 assetId = xgrAssetId();
        bytes32 salt = keccak256(abi.encode(
            "XITA_OPEN_NATIVE_XGR_V315", msg.sender, request.userSalt,
            request.destinationChainId, request.destinationDomain,
            request.destinationRouter
        ));
        router = address(new XETAGuardedNativeWarpRouter{salt: salt}(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit
        ));
        openRouterAssetId[router] = assetId;
        (routeId, gateway) = _prepareOpenRoute(
            assetId, address(0), request.destinationRouter, router, request
        );
    }

    /// @notice Independent XGR representation; NEVER occupies the official
    /// wXGR singleton address. It starts with zero supply and cannot receive
    /// before the reciprocal native-collateral adapter is safety-attested.
    function createOpenWrappedXGRRoute(OpenRouteRequest calldata request)
        external returns (bytes32 routeId, address router, address gateway)
    {
        if (localChainId == 1643 || localDomain == 1643) revert WrongChain();
        _validateOpenRequest(request);
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        bytes32 assetId = xgrAssetId();
        bytes32 salt = keccak256(abi.encode(
            "XITA_OPEN_WRAPPED_XGR_V315", msg.sender, request.userSalt,
            request.destinationChainId, request.destinationDomain,
            request.destinationRouter
        ));
        router = address(new XETAGuardedSyntheticWarpRouter{salt: salt}(
            address(registry), mailbox, merkleTreeHook,
            destinationIsm, defaultDestinationGasLimit,
            18, "XITA XGR Route (Unverified)", "xwXGR"
        ));
        openRouterAssetId[router] = assetId;
        // Intentionally NOT representedAssetId: this open XGR clone cannot
        // be silently relabeled as a canonical ERC20-origin token.
        (routeId, gateway) = _prepareOpenRoute(
            assetId, router, address(0), router, request
        );
    }

    /// @notice Anyone can submit the cryptographic counterpart attestation.
    /// This is transfer-safety verification, not voting on route permission.
    /// Prepared but unproven routes remain incapable of dispatching.
    function confirmAndBootstrapOpenRoute(
        XGRILNRegistryV315.RouteSafetyProofV315 calldata proof,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external {
        if (address(registry) == address(0)) revert RegistryNotDeployed();
        registry.confirmRouteInstance(proof, signerBitmap, aggregateSignature);
        (,,,address router,,,,,bool enabled) =
            registry.getRoute(proof.destinationDomain, proof.routeId);
        if (!enabled || openRouterAssetId[router] == bytes32(0))
            revert InvalidOpenRoute();
        IXETAXGRRouterBootstrapV315(router).bootstrapXETARoute(
            proof.destinationDomain, proof.routeId
        );
        emit ERC20RouteActivated(proof.routeId, router);
    }

    function _validateOpenRequest(OpenRouteRequest memory request)
        private view
    {
        if (request.destinationChainId == 0 ||
            request.destinationChainId == localChainId ||
            request.destinationDomain == 0 ||
            request.destinationDomain == localDomain ||
            request.destinationRouter == address(0) ||
            (localDomain != 1643 && request.destinationDomain != 1643))
            revert InvalidOpenRoute();
    }

    function _prepareOpenRoute(
        bytes32 assetId,
        address sourceToken,
        address destinationToken,
        address router,
        OpenRouteRequest memory request
    ) private returns (bytes32 routeId, address gateway) {
        routeId = XGRILNProtocol.routeInstanceIdV315(
            assetId, localChainId, localDomain,
            request.destinationChainId, request.destinationDomain,
            router, request.destinationRouter
        );
        gateway = address(new ILNGateway{
            salt: keccak256(abi.encodePacked("XITA_OPEN_GATEWAY_V315", routeId))
        }(address(registry), routeId, request.destinationDomain, router, false));
        bytes32 registeredRouteId = registry.registerRouteInstance(
            assetId, request.destinationChainId, request.destinationDomain,
            sourceToken, destinationToken, gateway, router,
            mailbox, merkleTreeHook, request.destinationRouter
        );
        if (registeredRouteId != routeId) revert InvalidOpenRoute();
        emit ERC20RoutePrepared(
            assetId, routeId, router, gateway,
            request.destinationDomain, request.destinationRouter
        );
        // Note: NO bootstrap here. Registry.enabled remains false until
        // validators attest the reciprocal deployed and funded-safe route.
    }

}
