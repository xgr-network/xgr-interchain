// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRILNRegistry} from "./IXGRILNRegistry.sol";
import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XGRILNFeeVault} from "./XGRILNFeeVault.sol";

// Bound to the existing canonical source ILN Registry getter.
// Do not accept any caller-supplied governance authority for fee claims.
interface IILNSourceGovernanceLookup {
    function governanceRegistry()
        external
        view
        returns (IXGRInterchainValidatorSetV2);
}

struct ILNQuote {
    address token;
    uint256 amount;
}

interface IILNWarpRouter {
    function token() external view returns (address);

    function quoteTransferRemote(
        uint32 destination,
        bytes32 recipient,
        uint256 amount
    ) external view returns (ILNQuote[] memory quotes);

    function transferRemote(
        uint32 destination,
        bytes32 recipient,
        uint256 amount
    ) external payable returns (bytes32 messageId);
}

/// @notice Route-specific source gateway for XGR Interchain v3.1.4.
/// @dev The shared ILN Registry is canonical for mutable route state. The
///      Gateway binds one routeId to one source Warp router and emits exactly
///      one fee-qualified ILNOperation for each successful Hyperlane message.
contract ILNGateway {
    IXGRILNRegistry public immutable ilnRegistry;
    XGRILNFeeVault public immutable feeVault;
    bytes32 public immutable routeId;
    uint32 public immutable destinationDomain;
    address public immutable warpRouter;
    address public immutable warpToken;
    bool public immutable nativeQuoteIncludesPrincipal;
    uint256 public immutable activationBlock;

    // Backwards-compatible cumulative getter. From v3.1.4 onward the fee
    // is held by feeVault, not in the Gateway balance.
    uint256 public totalValidatorFeesEscrowedWei;

    uint256 private unlocked = 1;

    error InvalidConfiguration();
    error InvalidRoute();
    error InvalidAmount();
    error InvalidValue(uint256 expected, uint256 got);
    error UnsupportedWarpFee();
    error TokenTransferFailed();
    error TokenApprovalFailed();
    error InvalidMessageId();
    error ReentrantCall();
    error FeeRecipientsUnavailable();

    event ILNOperation(
        bytes32 indexed routeId,
        bytes32 indexed messageId,
        uint32 indexed destinationDomain,
        uint256 validatorFeeWei
    );

    modifier nonReentrant() {
        if (unlocked != 1) revert ReentrantCall();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(
        address ilnRegistry_,
        bytes32 routeId_,
        uint32 destinationDomain_,
        address warpRouter_,
        bool nativeQuoteIncludesPrincipal_
    ) {
        if (
            ilnRegistry_ == address(0) ||
            routeId_ == bytes32(0) ||
            destinationDomain_ == 0 ||
            warpRouter_ == address(0)
        ) revert InvalidConfiguration();

        address token = IILNWarpRouter(warpRouter_).token();
        if (token != address(0) && nativeQuoteIncludesPrincipal_) {
            revert InvalidConfiguration();
        }

        IXGRInterchainValidatorSetV2 sourceGovernance =
            IILNSourceGovernanceLookup(ilnRegistry_).governanceRegistry();
        if (address(sourceGovernance) == address(0) ||
            address(sourceGovernance).code.length == 0
        ) revert InvalidConfiguration();

        // Deploy a source-native vault with immutable route/gateway binding.
        // Deploying from this constructor avoids any unsafe mutable setter
        // or circular CREATE2 address coordination.
        feeVault = new XGRILNFeeVault(
            address(sourceGovernance),
            address(this),
            routeId_,
            destinationDomain_
        );

        ilnRegistry = IXGRILNRegistry(ilnRegistry_);
        routeId = routeId_;
        destinationDomain = destinationDomain_;
        warpRouter = warpRouter_;
        warpToken = token;
        nativeQuoteIncludesPrincipal = nativeQuoteIncludesPrincipal_;
        activationBlock = block.number;
    }

    /// @notice xgrchain gateway-binding getter.
    function mailbox() external view returns (address) {
        IXGRILNRegistry.RouteRecord memory route = _canonicalRoute();
        return route.mailbox;
    }

    /// @notice xgrchain gateway-binding getter.
    function merkleTreeHook() external view returns (address) {
        IXGRILNRegistry.RouteRecord memory route = _canonicalRoute();
        return route.merkleTreeHook;
    }

    function destinationRouter() external view returns (address) {
        IXGRILNRegistry.RouteRecord memory route = _canonicalRoute();
        return route.destinationRouter;
    }

    function validatorFeeWei() external view returns (uint256) {
        IXGRILNRegistry.RouteRecord memory route = _canonicalRoute();
        return route.validatorFeeWei;
    }

    function quoteILN(
        uint32 requestedDestinationDomain,
        bytes32 recipient,
        uint256 amount
    )
        external
        view
        returns (
            uint256 routeValidatorFeeWei,
            uint256 routerNativeValueWei,
            uint256 totalNativeValueWei,
            uint256 totalTokenAmount
        )
    {
        if (requestedDestinationDomain != destinationDomain) {
            revert InvalidRoute();
        }
        if (amount == 0 || recipient == bytes32(0)) {
            revert InvalidAmount();
        }

        IXGRILNRegistry.RouteRecord memory route = _canonicalRoute();
        _requireFeeRecipients();
        routerNativeValueWei = _quoteRouterNative(recipient, amount);
        routeValidatorFeeWei = route.validatorFeeWei;
        totalNativeValueWei =
            route.validatorFeeWei + routerNativeValueWei;
        totalTokenAmount = warpToken == address(0) ? 0 : amount;
    }

    function bridge(
        uint32 requestedDestinationDomain,
        bytes32 recipient,
        uint256 amount
    ) external payable nonReentrant returns (bytes32 messageId) {
        if (requestedDestinationDomain != destinationDomain) {
            revert InvalidRoute();
        }
        if (amount == 0 || recipient == bytes32(0)) {
            revert InvalidAmount();
        }

        IXGRILNRegistry.RouteRecord memory route = _canonicalRoute();
        // FeeVault.allocate rechecks the validator set atomically; a failure
        // rolls back the preceding Warp Router dispatch and token movement.
        uint256 routerNativeValueWei =
            _quoteRouterNative(recipient, amount);
        uint256 expectedValue =
            route.validatorFeeWei + routerNativeValueWei;

        if (msg.value != expectedValue) {
            revert InvalidValue(expectedValue, msg.value);
        }

        if (warpToken != address(0)) {
            _safeTransferFrom(
                warpToken,
                msg.sender,
                address(this),
                amount
            );

            if (warpToken != warpRouter) {
                _forceApprove(warpToken, warpRouter, amount);
            }
        }

        messageId = IILNWarpRouter(warpRouter).transferRemote{
            value: routerNativeValueWei
        }(destinationDomain, recipient, amount);

        if (warpToken != address(0) && warpToken != warpRouter) {
            _forceApprove(warpToken, warpRouter, 0);
        }

        if (messageId == bytes32(0)) revert InvalidMessageId();

        // Atomic with token lock/burn and Hyperlane dispatch. If the
        // FeeVault rejects a missing snapshot, repeated message ID, or
        // failed accounting, this entire bridge transaction reverts.
        feeVault.allocate{value: route.validatorFeeWei}(messageId);
        totalValidatorFeesEscrowedWei += route.validatorFeeWei;

        emit ILNOperation(
            routeId,
            messageId,
            destinationDomain,
            route.validatorFeeWei
        );
    }

    function _requireFeeRecipients() private view {
        if (feeVault.recipientSetId() == 0 || feeVault.recipientCount() == 0) {
            revert FeeRecipientsUnavailable();
        }
    }

    function _canonicalRoute()
        private
        view
        returns (IXGRILNRegistry.RouteRecord memory route)
    {
        (
            route.sourceChainId,
            route.sourceDomain,
            route.gateway,
            route.sourceRouter,
            route.mailbox,
            route.merkleTreeHook,
            route.destinationRouter,
            route.validatorFeeWei,
            route.enabled
        ) = ilnRegistry.getRoute(destinationDomain, routeId);

        if (
            !route.enabled ||
            route.sourceChainId == 0 ||
            route.sourceChainId != uint64(block.chainid) ||
            route.sourceDomain == 0 ||
            route.gateway != address(this) ||
            route.sourceRouter != warpRouter ||
            route.mailbox == address(0) ||
            route.merkleTreeHook == address(0) ||
            route.destinationRouter == address(0) ||
            route.validatorFeeWei == 0
        ) revert InvalidRoute();
    }

    function _quoteRouterNative(
        bytes32 recipient,
        uint256 amount
    ) private view returns (uint256 nativeValueWei) {
        ILNQuote[] memory quotes =
            IILNWarpRouter(warpRouter).quoteTransferRemote(
                destinationDomain,
                recipient,
                amount
            );

        uint256 tokenQuote;
        for (uint256 i = 0; i < quotes.length; i++) {
            if (quotes[i].token == address(0)) {
                nativeValueWei += quotes[i].amount;
            } else if (
                warpToken != address(0) &&
                quotes[i].token == warpToken
            ) {
                tokenQuote += quotes[i].amount;
            } else {
                revert UnsupportedWarpFee();
            }
        }

        if (warpToken == address(0)) {
            if (!nativeQuoteIncludesPrincipal) {
                nativeValueWei += amount;
            }
            return nativeValueWei;
        }

        if (tokenQuote != 0 && tokenQuote != amount) {
            revert UnsupportedWarpFee();
        }
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) private {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(
                bytes4(keccak256("transferFrom(address,address,uint256)")),
                from,
                to,
                amount
            )
        );
        if (
            !ok ||
            (data.length != 0 && !abi.decode(data, (bool)))
        ) revert TokenTransferFailed();
    }

    function _forceApprove(
        address token,
        address spender,
        uint256 amount
    ) private {
        if (_callApprove(token, spender, amount)) return;
        if (
            !_callApprove(token, spender, 0) ||
            !_callApprove(token, spender, amount)
        ) revert TokenApprovalFailed();
    }

    function _callApprove(
        address token,
        address spender,
        uint256 amount
    ) private returns (bool) {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(
                bytes4(keccak256("approve(address,uint256)")),
                spender,
                amount
            )
        );
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }
}
