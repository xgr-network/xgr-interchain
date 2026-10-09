// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRILNRegistry} from "./IXGRILNRegistry.sol";
import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XGRILNProtocol} from "./XGRILNProtocol.sol";

/// @notice Shared source-chain registry for all XGR Interchain v3.1.3 routes.
/// @dev Route governance is authorized by the canonical destination-scoped
///      Interchain validator registry of THIS chain. Any account may submit an
///      already-completed governance quorum; the caller has no authority.
contract XGRILNRegistry is IXGRILNRegistry {
    uint32 private constant XGR_HUB_DOMAIN = 1643;
    uint8 private constant PROPOSAL_FEE_UPDATE = 1;
    uint8 private constant PROPOSAL_ROUTE_ADD = 2;
    uint8 private constant PROPOSAL_ROUTE_ENABLE = 3;
    uint8 private constant PROPOSAL_ROUTE_DISABLE = 4;

    uint64 public immutable sourceChainId;
    uint32 public immutable sourceDomain;
    IXGRInterchainValidatorSetV2 public immutable governanceRegistry;
    /// @notice Exact first block for bounded route-discovery event backfill.
    uint256 public immutable activationBlock;

    mapping(uint32 => mapping(bytes32 => RouteRecord)) private routes;
    mapping(uint32 => mapping(bytes32 => bool)) private routeExists;
    mapping(uint32 => mapping(bytes32 => uint64)) private routeGovernanceNonce;

    error InvalidConfiguration();
    error InvalidProposal();
    error RouteAlreadyExists();
    error RouteNotFound();
    error StaleGovernanceNonce(uint64 expected, uint64 got);
    error GovernanceProposalExpired();
    error InvalidGovernanceQuorum();

    event RouteAdded(
        uint32 indexed destinationDomain,
        bytes32 indexed routeId,
        address indexed gateway,
        address sourceRouter,
        address destinationRouter,
        uint256 validatorFeeWei,
        uint64 nonce
    );
    event RouteFeeUpdated(
        uint32 indexed destinationDomain,
        bytes32 indexed routeId,
        uint256 validatorFeeWei,
        uint64 nonce
    );
    event RouteStateUpdated(
        uint32 indexed destinationDomain,
        bytes32 indexed routeId,
        bool enabled,
        uint64 nonce
    );

    constructor(
        uint64 sourceChainId_,
        uint32 sourceDomain_,
        address governanceRegistry_
    ) {
        if (
            sourceChainId_ == 0 ||
            sourceDomain_ == 0 ||
            governanceRegistry_ == address(0) ||
            block.chainid != uint256(sourceChainId_)
        ) revert InvalidConfiguration();

        IXGRInterchainValidatorSetV2 registry =
            IXGRInterchainValidatorSetV2(governanceRegistry_);

        // Governance is deliberately local to the chain whose route state is
        // being mutated. The same RegistryV2 remains the canonical membership
        // contract used when this chain is an Interchain destination.
        if (
            registry.destinationDomain() != sourceDomain_ ||
            registry.verifier() == address(0)
        ) revert InvalidConfiguration();

        sourceChainId = sourceChainId_;
        sourceDomain = sourceDomain_;
        governanceRegistry = registry;
        activationBlock = block.number;
    }

    function getRoute(uint32 destinationDomain, bytes32 routeId)
        external
        view
        returns (
            uint64 routeSourceChainId,
            uint32 routeSourceDomain,
            address gateway,
            address sourceRouter,
            address mailbox,
            address merkleTreeHook,
            address destinationRouter,
            uint256 validatorFeeWei,
            bool enabled
        )
    {
        RouteRecord storage route = routes[destinationDomain][routeId];
        return (
            route.sourceChainId,
            route.sourceDomain,
            route.gateway,
            route.sourceRouter,
            route.mailbox,
            route.merkleTreeHook,
            route.destinationRouter,
            route.validatorFeeWei,
            route.enabled
        );
    }

    function governanceNonce(uint32 destinationDomain, bytes32 routeId)
        external
        view
        returns (uint64)
    {
        return routeGovernanceNonce[destinationDomain][routeId];
    }

    function exists(uint32 destinationDomain, bytes32 routeId)
        external
        view
        returns (bool)
    {
        return routeExists[destinationDomain][routeId];
    }

    /// @notice Permissionless execution of a completed governance quorum.
    /// @dev Typical flow:
    ///      1. read completed quorum from XGR RPC;
    ///      2. any operator/validator/relayer submits proposal + bitmap + BLS sig;
    ///      3. this contract verifies the quorum against the local RegistryV2;
    ///      4. only then is route state mutated.
    function applyGovernance(
        XGRILNProtocol.GovernanceProposal calldata proposal,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external {
        XGRILNProtocol.GovernanceProposal memory p = proposal;
        bytes memory payload = XGRILNProtocol.encodeGovernanceProposal(p);

        if (
            p.registry != address(this) ||
            p.route.key.sourceChainId != sourceChainId ||
            p.route.key.sourceDomain != sourceDomain
        ) revert InvalidProposal();

        if (block.timestamp > p.validUntil) {
            revert GovernanceProposalExpired();
        }

        uint32 destinationDomain = p.route.key.destinationDomain;
        bytes32 routeId = p.route.key.routeId;
        uint64 currentNonce = routeGovernanceNonce[destinationDomain][routeId];
        if (currentNonce == type(uint64).max) revert InvalidProposal();

        uint64 expectedNonce = currentNonce + 1;
        if (p.nonce != expectedNonce) {
            revert StaleGovernanceNonce(expectedNonce, p.nonce);
        }

        // Governance changes current route state. Historical validator sets
        // remain valid for settlement attestations, but must not control
        // future governance after a membership transition.
        if (
            p.setId != governanceRegistry.setId() ||
            !governanceRegistry.verifyQuorum(
                p.setId,
                payload,
                signerBitmap,
                aggregateSignature
            )
        ) revert InvalidGovernanceQuorum();

        if (p.proposalType == PROPOSAL_ROUTE_ADD) {
            _applyRouteAdd(p.route, p.nonce);
        } else if (p.proposalType == PROPOSAL_FEE_UPDATE) {
            _applyFeeUpdate(
                destinationDomain,
                routeId,
                p.route.validatorFeeWei,
                p.nonce
            );
        } else if (p.proposalType == PROPOSAL_ROUTE_ENABLE) {
            _applyRouteState(destinationDomain, routeId, true, p.nonce);
        } else if (p.proposalType == PROPOSAL_ROUTE_DISABLE) {
            _applyRouteState(destinationDomain, routeId, false, p.nonce);
        } else {
            revert InvalidProposal();
        }

        routeGovernanceNonce[destinationDomain][routeId] = p.nonce;
    }

    function _applyRouteAdd(
        XGRILNProtocol.Route memory route,
        uint64 nonce
    ) private {
        uint32 destinationDomain = route.key.destinationDomain;
        bytes32 routeId = route.key.routeId;
        // The hub invariant is enforced both in the asset router and here.
        // A valid validator signature cannot register a direct spoke-to-spoke
        // or same-domain route in the canonical source registry.
        if (
            destinationDomain == sourceDomain ||
            (sourceDomain != XGR_HUB_DOMAIN && destinationDomain != XGR_HUB_DOMAIN)
        ) revert InvalidProposal();
        if (routeExists[destinationDomain][routeId]) {
            revert RouteAlreadyExists();
        }

        routes[destinationDomain][routeId] = RouteRecord({
            sourceChainId: route.key.sourceChainId,
            sourceDomain: route.key.sourceDomain,
            gateway: route.gateway,
            sourceRouter: route.sourceRouter,
            mailbox: route.mailbox,
            merkleTreeHook: route.merkleTreeHook,
            destinationRouter: route.destinationRouter,
            validatorFeeWei: route.validatorFeeWei,
            enabled: true
        });
        routeExists[destinationDomain][routeId] = true;

        emit RouteAdded(
            destinationDomain,
            routeId,
            route.gateway,
            route.sourceRouter,
            route.destinationRouter,
            route.validatorFeeWei,
            nonce
        );
    }

    function _applyFeeUpdate(
        uint32 destinationDomain,
        bytes32 routeId,
        uint256 validatorFeeWei,
        uint64 nonce
    ) private {
        if (!routeExists[destinationDomain][routeId]) {
            revert RouteNotFound();
        }

        routes[destinationDomain][routeId].validatorFeeWei =
            validatorFeeWei;

        emit RouteFeeUpdated(
            destinationDomain,
            routeId,
            validatorFeeWei,
            nonce
        );
    }

    function _applyRouteState(
        uint32 destinationDomain,
        bytes32 routeId,
        bool enabled,
        uint64 nonce
    ) private {
        if (!routeExists[destinationDomain][routeId]) {
            revert RouteNotFound();
        }

        routes[destinationDomain][routeId].enabled = enabled;
        emit RouteStateUpdated(
            destinationDomain,
            routeId,
            enabled,
            nonce
        );
    }
}
