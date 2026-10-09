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
    event SourceFeeUpdated(uint256 previousFeeWei, uint256 newFeeWei, uint64 indexed nonce, uint64 validatorSetId);

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

    /// @notice Append-only, permissionless through the standard public XITA Factory.
    /// @dev No token/router/gateway address is part of routeId; all are bound once.
    /// Factory MUST verify both token identities and route-to-router authorization.
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
        if (validatorFeeWei == 0 || assetId == bytes32(0) ||
            gateway == address(0) || sourceRouter == address(0) ||
            mailbox == address(0) || merkleTreeHook == address(0) ||
            destinationRouter == address(0) || gateway.code.length == 0 ||
            sourceRouter.code.length == 0) revert InvalidRoute();
        routeId = XGRILNProtocol.routeIdV315(
            assetId, sourceChainId, sourceDomain, destinationChainId, destinationDomain
        );
        if (routeExists[destinationDomain][routeId]) revert RouteAlreadyExists();
        routes[destinationDomain][routeId] = RouteRecord({
            sourceChainId: sourceChainId,
            sourceDomain: sourceDomain,
            gateway: gateway,
            sourceRouter: sourceRouter,
            mailbox: mailbox,
            merkleTreeHook: merkleTreeHook,
            destinationRouter: destinationRouter,
            validatorFeeWei: 0, // Fee is ALWAYS read from source-chain singleton.
            enabled: true // Never disabled after append-only registration.
        });
        routeAssets[destinationDomain][routeId] = AssetRoute({
            assetId: assetId,
            destinationChainId: destinationChainId,
            sourceToken: sourceToken,
            destinationToken: destinationToken
        });
        routeExists[destinationDomain][routeId] = true;
        emit RouteAdded(destinationDomain, routeId, gateway, sourceRouter, destinationRouter, validatorFeeWei, 0);
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
            routeExists[destinationDomain][routeId] ? validatorFeeWei : 0,
            routeExists[destinationDomain][routeId]
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
