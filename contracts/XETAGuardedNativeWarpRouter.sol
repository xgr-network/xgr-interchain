// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TokenRouter} from "@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol";
import {NativeCollateral} from "@hyperlane-xyz/core/contracts/token/libs/TokenCollateral.sol";
import {XETARouterCore} from "./XETARouterCore.sol";

/// @notice Native XGR adapter for the shared, multi-spoke XETA Router core.
/// @dev Exactly ONE native XGR router on XGRChain serves every XGR spoke.
///      No owner, public initializer, LP-vault or alternate dispatch path.
contract XETAGuardedNativeWarpRouter is XETARouterCore {
    mapping(address => uint256) public pendingNativeXGR;
    uint256 public totalPendingNativeXGR;
    uint256 private claimLock = 1;

    error NoPendingNativeXGR();
    error InvalidPayoutRecipient();
    error NativeClaimReentrancy();
    error NativePayoutFailed();
    error InsufficientUnreservedNativeXGR(uint256 requiredWei, uint256 availableWei);

    event NativeDeliveryDeferred(address indexed recipient, uint256 amount);
    event PendingNativeXGRWithdrawn(address indexed beneficiary, address indexed payoutRecipient, uint256 amount);

    /// @notice Only the original recipient can authorize an alternative payout.
    function withdrawPendingNativeXGR(address payable payoutRecipient) external {
        if (claimLock != 1) revert NativeClaimReentrancy();
        if (payoutRecipient == address(0)) revert InvalidPayoutRecipient();
        uint256 amount = pendingNativeXGR[msg.sender];
        if (amount == 0) revert NoPendingNativeXGR();
        claimLock = 2;
        pendingNativeXGR[msg.sender] = 0;
        totalPendingNativeXGR -= amount;
        (bool paid,) = payoutRecipient.call{value: amount}("");
        if (!paid) revert NativePayoutFailed();
        emit PendingNativeXGRWithdrawn(msg.sender, payoutRecipient, amount);
        claimLock = 1;
    }

    constructor(
        address registry_,
        address mailbox_,
        address dispatchHook_,
        address destinationIsm_,
        uint256 defaultDestinationGasLimit_
    )
        TokenRouter(1, 1, mailbox_)
        XETARouterCore(registry_, defaultDestinationGasLimit_)
    {
        if (dispatchHook_ == address(0) || destinationIsm_ == address(0)) {
            revert XETAInvalidConfiguration();
        }
        _initializeXETA(dispatchHook_, destinationIsm_);
    }

    function _initializeXETA(address hook_, address ism_) private initializer {
        _MailboxClient_initialize(hook_, ism_, address(0));
    }

    function token() public pure override returns (address) {
        return address(0);
    }

    function _transferFromSender(uint256 amount) internal override {
        NativeCollateral._transferFromSender(amount);
    }

    function _transferTo(address recipient, uint256 amount) internal override {
        // Preserve all pending claims BEFORE attempting another native payout.
        // Insufficient escrow must revert the authenticated message rather
        // than silently recording an unbacked IOU as a successful delivery.
        uint256 balance = address(this).balance;
        uint256 reserved = totalPendingNativeXGR;
        uint256 available = balance >= reserved ? balance - reserved : 0;
        if (balance < reserved || available < amount) {
            revert InsufficientUnreservedNativeXGR(amount, available);
        }
        // A rejecting recipient cannot block later, unrelated messages.
        // Recipient code receives bounded gas; unsuccessful sends retain funds.
        (bool paid,) = payable(recipient).call{value: amount, gas: 30_000}("");
        if (!paid) {
            pendingNativeXGR[recipient] += amount;
            totalPendingNativeXGR += amount;
            emit NativeDeliveryDeferred(recipient, amount);
        }
    }

    receive() external payable {}
}
