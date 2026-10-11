// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XGRILNProtocol} from "./XGRILNProtocol.sol";
import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {IXGRILNRegistry} from "./IXGRILNRegistry.sol";

/// @notice Permissionless source-chain route registry with append-only registration.
/// @dev Public Factory checks local router ownership and atomically bootstraps
/// each route. BLS signatures authorize message delivery and fee changes,
/// not project or route admission. No administrator can veto a registration.
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

    mapping(uint32 => mapping(bytes32 => RouteRecord)) private routes;
    mapping(uint32 => mapping(bytes32 => bool)) private routeExists;
    mapping(uint32 => mapping(bytes32 => AssetRoute)) private routeAssets;

    error InvalidConfiguration();
    error InvalidRoute();
    error UnauthorizedRegistrar();
    error RouteAlreadyExists();
    error InvalidFeeQuorum();
    error ExpiredFeeProposal();
    error InvalidFeeNonce();

    event RouteAdded(
        uint32 indexed destinationDomain,
        bytes32 indexed routeId,
        address indexed gateway,
        address sourceRouter,
        address destinationRouter,
        uint256 validatorFeeWei,
        uint64 nonce
    );
    event SourceFeeInitialized(uint256 validatorFeeWei, uint64 validatorSetId);
    event SourceFeeUpdated(uint256 previousFeeWei, uint256 newFeeWei, uint64 indexed nonce, uint64 validatorSetId);
    constructor(uint64 chainId_, uint32 domain_, address validators_, address factory_, uint256 initialValidatorFeeWei_) {
        if (chainId_ == 0 || domain_ == 0 || factory_ == address(0) ||
            validators_ == address(0) || initialValidatorFeeWei_ == 0 || block.chainid != chainId_) revert InvalidConfiguration();
        IXGRInterchainValidatorSetV2 v = IXGRInterchainValidatorSetV2(validators_);
        if (v.destinationDomain() != domain_ || v.verifier() == address(0)) revert InvalidConfiguration();
        sourceChainId = chainId_;
        sourceDomain = domain_;
        governanceRegistry = v;
        factory = factory_;
        activationBlock = block.number;
        validatorFeeWei = initialValidatorFeeWei_;
        // Initial fee is committed once as immutable Factory constructor input.
        // Nonce 0 is the bootstrap epoch; only later changes require BLS quorum.
        emit SourceFeeInitialized(initialValidatorFeeWei_, v.setId());
    }

    /// @notice Quorum-controlled CHANGES to the bootstrap source-native fee for ALL routes.
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

    /// @notice A caller-created Router pair identifies each prepared route.
    /// @dev There is no singleton canonical route registry or route vote.
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
            mailbox, merkleTreeHook, destinationRouter
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
        address destinationRouter
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
            enabled: true // No separate signature-gated route activation.
        });
        routeAssets[destinationDomain][routeId] = AssetRoute({
            assetId: assetId,
            destinationChainId: destinationChainId,
            sourceToken: sourceToken,
            destinationToken: destinationToken
        });
        routeExists[destinationDomain][routeId] = true;
        emit RouteAdded(destinationDomain, routeId, gateway, sourceRouter,
            destinationRouter, validatorFeeWei, sourceFeeNonce);
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

    function exists(uint32 destinationDomain, bytes32 routeId) external view returns (bool) {
        return routeExists[destinationDomain][routeId];
    }
}
