// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XGRILNProtocol} from "./XGRILNProtocol.sol";
import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {IXGRILNRegistry} from "./IXGRILNRegistry.sol";

/// @notice XITA 3.1.5 source-chain registry prototype.
/// @dev The registrar is a public, immutable-code Factory: it must expose a
/// permissionless deployment flow and enforce canonical token/router ownership.
/// The registry has no administrator, route disable, deletion or fee-by-route.
/// Production activation requires the matching Factory and Router tests.
contract XGRILNRegistryV315 is IXGRILNRegistry {
    uint64 public immutable sourceChainId;
    uint32 public immutable sourceDomain;
    uint256 public immutable activationBlock;
    address public immutable factory;
    IXGRInterchainValidatorSetV2 public immutable governanceRegistry;
    uint256 public validatorFeeWei;
    uint64 public sourceFeeNonce;

    struct AssetRoute {
        bytes32 assetId;
        uint64 destinationChainId;
        address sourceToken;
        address destinationToken;
    }

    /// @notice Objective remote-pair safety attestation; NOT route governance.
    /// @dev Validator software must independently inspect a confirmed remote
    /// Registry/Router/Gateway before signing. A first caller cannot self-attest.
    struct RouteSafetyProofV315 {
        uint32 destinationDomain;
        bytes32 routeId;
        bytes32 reverseRouteId;
        address remoteRegistry;
        address remoteFactory;
        address remoteGateway;
        bytes32 remoteRouterCodeHash;
        bytes32 localRouterCodeHash;
        uint64 setId;
        uint64 validUntil;
    }

    bytes32 private constant PAIR_DOMAIN_V315 =
        keccak256("XITA_ROUTE_SAFETY_V315");

    mapping(uint32 => mapping(bytes32 => RouteRecord)) private routes;
    mapping(uint32 => mapping(bytes32 => bool)) private routeExists;
    mapping(uint32 => mapping(bytes32 => AssetRoute)) private routeAssets;
    mapping(uint32 => mapping(bytes32 => bool)) public isOpenInstance;

    error InvalidConfiguration();
    error InvalidRoute();
    error UnauthorizedRegistrar();
    error RouteAlreadyExists();
    error InvalidFeeQuorum();
    error ExpiredFeeProposal();
    error InvalidFeeNonce();
    error InvalidRouteSafetyProof();

    event RouteAdded(
        uint32 indexed destinationDomain,
        bytes32 indexed routeId,
        address indexed gateway,
        address sourceRouter,
        address destinationRouter,
        uint256 validatorFeeWei,
        uint64 nonce
    );
    event SourceFeeUpdated(uint256 previousFeeWei, uint256 newFeeWei, uint64 indexed nonce, uint64 validatorSetId);
    event RoutePrepared(uint32 indexed destinationDomain, bytes32 indexed routeId, address indexed gateway);
    event RouteSafetyConfirmed(
        uint32 indexed destinationDomain, bytes32 indexed routeId,
        bytes32 indexed reverseRouteId, uint64 validatorSetId
    );

    constructor(uint64 chainId_, uint32 domain_, address validators_, address factory_) {
        if (chainId_ == 0 || domain_ == 0 || factory_ == address(0) ||
            validators_ == address(0) || block.chainid != chainId_) revert InvalidConfiguration();
        IXGRInterchainValidatorSetV2 v = IXGRInterchainValidatorSetV2(validators_);
        if (v.destinationDomain() != domain_ || v.verifier() == address(0)) revert InvalidConfiguration();
        sourceChainId = chainId_;
        sourceDomain = domain_;
        governanceRegistry = v;
        factory = factory_;
        activationBlock = block.number;
    }

    /// @notice Single validator-approved fee for ALL routes on this source chain.
    /// @dev Unset fee (zero) prevents live route enrollment and fee-qualified bridging.
    function applySourceFee(
        XGRILNProtocol.SourceFeeProposalV315 calldata proposal,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external {
        XGRILNProtocol.SourceFeeProposalV315 memory p = proposal;
        bytes memory payload = XGRILNProtocol.encodeSourceFeeProposalV315(p);
        if (p.sourceChainId != sourceChainId || p.sourceDomain != sourceDomain ||
            p.registry != address(this)) revert InvalidFeeQuorum();
        if (block.timestamp > p.validUntil) revert ExpiredFeeProposal();
        if (sourceFeeNonce == type(uint64).max || p.nonce != sourceFeeNonce + 1)
            revert InvalidFeeNonce();
        if (p.setId != governanceRegistry.setId() ||
            !governanceRegistry.verifyQuorum(p.setId, payload, signerBitmap, aggregateSignature))
            revert InvalidFeeQuorum();
        uint256 previous = validatorFeeWei;
        validatorFeeWei = p.validatorFeeWei;
        sourceFeeNonce = p.nonce;
        emit SourceFeeUpdated(previous, p.validatorFeeWei, p.nonce, p.setId);
    }

    /// @notice Canonical XGR profile: one route per asset+chain pair.
    /// @dev Preserves v3.1.5 identity compatibility for XGR/wXGR.
    function registerRoute(
        bytes32 assetId,
        uint64 destinationChainId,
        uint32 destinationDomain,
        address sourceToken,
        address destinationToken,
        address gateway,
        address sourceRouter,
        address mailbox,
        address merkleTreeHook,
        address destinationRouter
    ) external returns (bytes32 routeId) {
        if (msg.sender != factory) revert UnauthorizedRegistrar();
        routeId = XGRILNProtocol.routeIdV315(
            assetId, sourceChainId, sourceDomain, destinationChainId, destinationDomain
        );
        _register(
            routeId, assetId, destinationChainId, destinationDomain,
            sourceToken, destinationToken, gateway, sourceRouter,
            mailbox, merkleTreeHook, destinationRouter, true
        );
    }

    /// @notice Open ERC20 profile: parallel independently secured route instances.
    /// @dev The immutable source/destination router PAIR determines identity.
    /// The permissionless Factory must deploy or authenticate each local router.
    /// This never reserves the canonical asset ID or XGR's singleton route.
    function registerRouteInstance(
        bytes32 assetId,
        uint64 destinationChainId,
        uint32 destinationDomain,
        address sourceToken,
        address destinationToken,
        address gateway,
        address sourceRouter,
        address mailbox,
        address merkleTreeHook,
        address destinationRouter
    ) external returns (bytes32 routeId) {
        if (msg.sender != factory) revert UnauthorizedRegistrar();
        routeId = XGRILNProtocol.routeInstanceIdV315(
            assetId, sourceChainId, sourceDomain, destinationChainId,
            destinationDomain, sourceRouter, destinationRouter
        );
        _register(
            routeId, assetId, destinationChainId, destinationDomain,
            sourceToken, destinationToken, gateway, sourceRouter,
            mailbox, merkleTreeHook, destinationRouter, false
        );
    }

    function _register(
        bytes32 routeId,
        bytes32 assetId,
        uint64 destinationChainId,
        uint32 destinationDomain,
        address sourceToken,
        address destinationToken,
        address gateway,
        address sourceRouter,
        address mailbox,
        address merkleTreeHook,
        address destinationRouter,
        bool isCanonical
    ) private {
        if (validatorFeeWei == 0 || assetId == bytes32(0) ||
            gateway == address(0) || sourceRouter == address(0) ||
            mailbox == address(0) || merkleTreeHook == address(0) ||
            destinationRouter == address(0) || gateway.code.length == 0 ||
            sourceRouter.code.length == 0) revert InvalidRoute();
        if (routeExists[destinationDomain][routeId]) revert RouteAlreadyExists();
        routes[destinationDomain][routeId] = RouteRecord({
            sourceChainId: sourceChainId,
            sourceDomain: sourceDomain,
            gateway: gateway,
            sourceRouter: sourceRouter,
            mailbox: mailbox,
            merkleTreeHook: merkleTreeHook,
            destinationRouter: destinationRouter,
            validatorFeeWei: 0, // Always read from the source-chain singleton.
            enabled: isCanonical // Open instances wait for safety evidence.
        });
        routeAssets[destinationDomain][routeId] = AssetRoute({
            assetId: assetId,
            destinationChainId: destinationChainId,
            sourceToken: sourceToken,
            destinationToken: destinationToken
        });
        routeExists[destinationDomain][routeId] = true;
        if (isCanonical) {
            emit RouteAdded(
                destinationDomain, routeId, gateway, sourceRouter,
                destinationRouter, validatorFeeWei, 0
            );
        } else {
            isOpenInstance[destinationDomain][routeId] = true;
            emit RoutePrepared(destinationDomain, routeId, gateway);
        }
    }

    /// @notice Anyone can verify an objectively attested deployed counterpart.
    /// @dev Requires validator-transfer-security BLS quorum, not governance
    /// authorization to CREATE a route. A signature must certify the remote
    /// live Router code, reciprocal pending Registry entry, custody adapter,
    /// origin token metadata and locked asset identity on the other chain.
    /// The contract checks every local and domain-separated signed field.
    function confirmRouteInstance(
        RouteSafetyProofV315 calldata proof,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external {
        uint32 domain = proof.destinationDomain;
        bytes32 id = proof.routeId;
        if (!isOpenInstance[domain][id] ||
            !routeExists[domain][id] ||
            routes[domain][id].enabled ||
            block.timestamp > proof.validUntil ||
            proof.remoteRegistry == address(0) ||
            proof.remoteFactory == address(0) ||
            proof.remoteGateway == address(0) ||
            proof.remoteRouterCodeHash == bytes32(0) ||
            proof.setId == 0 ||
            proof.validUntil == 0 ||
            proof.setId != governanceRegistry.setId()
        ) revert InvalidRouteSafetyProof();

        RouteRecord storage route = routes[domain][id];
        AssetRoute storage asset = routeAssets[domain][id];
        bytes32 reverse = XGRILNProtocol.routeInstanceIdV315(
            asset.assetId, asset.destinationChainId, domain,
            sourceChainId, sourceDomain,
            route.destinationRouter, route.sourceRouter
        );
        if (reverse != proof.reverseRouteId ||
            route.sourceRouter.codehash != proof.localRouterCodeHash)
            revert InvalidRouteSafetyProof();

        bytes memory payload = _routeSafetyPayload(proof);
        if (!governanceRegistry.verifyQuorum(
            proof.setId, payload, signerBitmap, aggregateSignature
        )) revert InvalidRouteSafetyProof();

        route.enabled = true;
        emit RouteSafetyConfirmed(domain, id, reverse, proof.setId);
        // Legacy node's RouteAdded scanner must see an event ONLY after
        // the new route is usable, so a pending route cannot poison discovery.
        emit RouteAdded(
            domain, id, route.gateway, route.sourceRouter,
            route.destinationRouter, validatorFeeWei, 0
        );
    }

    function encodeRouteSafetyProofV315(RouteSafetyProofV315 calldata proof)
        external view returns (bytes memory)
    {
        return _routeSafetyPayload(proof);
    }

    function _routeSafetyPayload(RouteSafetyProofV315 calldata proof)
        private view returns (bytes memory)
    {
        RouteRecord storage route = routes[proof.destinationDomain][proof.routeId];
        AssetRoute storage asset = routeAssets[proof.destinationDomain][proof.routeId];
        return abi.encode(
            PAIR_DOMAIN_V315,
            sourceChainId, sourceDomain, address(this), proof.routeId,
            asset.assetId, asset.destinationChainId, proof.destinationDomain,
            asset.sourceToken, asset.destinationToken,
            route.sourceRouter, route.destinationRouter, route.gateway,
            proof.reverseRouteId, proof.remoteRegistry, proof.remoteFactory,
            proof.remoteGateway, proof.localRouterCodeHash,
            proof.remoteRouterCodeHash, proof.setId, proof.validUntil
        );
    }

    function getRoute(uint32 destinationDomain, bytes32 routeId)
        external view returns (
            uint64 routeSourceChainId, uint32 routeSourceDomain,
            address gateway, address sourceRouter, address mailbox,
            address merkleTreeHook, address destinationRouter,
            uint256 fee, bool enabled
        )
    {
        RouteRecord storage route = routes[destinationDomain][routeId];
        return (
            route.sourceChainId, route.sourceDomain, route.gateway, route.sourceRouter,
            route.mailbox, route.merkleTreeHook, route.destinationRouter,
            route.enabled ? validatorFeeWei : 0,
            route.enabled
        );
    }

    function assetRoute(uint32 destinationDomain, bytes32 routeId)
        external view returns (AssetRoute memory)
    {
        return routeAssets[destinationDomain][routeId];
    }

    function governanceNonce(uint32, bytes32) external pure returns (uint64) {
        // Compatibility view for older clients; per-route governance is removed.
        return 0;
    }

    function exists(uint32 destinationDomain, bytes32 routeId) external view returns (bool) {
        return routeExists[destinationDomain][routeId];
    }
}
