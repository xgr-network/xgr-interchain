// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";

/// @notice Pull-based native source-chain validator fees, accrued in O(1) per transfer.
/// @dev Each immutable validator-set snapshot earns a cumulative pool.
///      No per-validator storage writes happen during bridging. The local V3
///      Registry resolves immutable historical membership when a validator claims.
///      Withdrawals are paginated, so arbitrary numbers of rotations cannot
///      permanently block a validator from receiving older earned fees.
contract XGRILNFeeVault {
    IXGRInterchainValidatorSetV2 public immutable validatorRegistry;
    address public immutable gateway;
    bytes32 public immutable routeId;
    uint32 public immutable destinationDomain;

    struct FeeEpoch {
        uint256 totalWei;
        uint256 recipients;
    }
    mapping(uint64 => FeeEpoch) public epochs;
    mapping(bytes32 => bool) public allocatedOperation;
    mapping(bytes32 => uint64) public allocatedSetId;

    /// @dev Cursor is the earliest not-fully-settled validator set.
    ///      0 denotes 1 before the first claim.
    mapping(address => uint64) public claimCursor;
    /// @dev Already paid in the cursor's CURRENT (still accruing) epoch.
    mapping(address => uint256) public paidAtCursor;

    uint256 public totalAllocatedWei;
    uint256 public totalClaimedWei;
    uint256 private entered = 1;

    error InvalidConfiguration();
    error InvalidValidatorSet();
    error InvalidOperation();
    error InvalidClaimWindow();
    error UnauthorizedGateway();
    error NothingToClaim();
    error TransferFailed();
    error Reentrancy();

    event FeeAllocated(bytes32 indexed messageId, uint64 indexed validatorSetId, uint256 amountWei);
    event Claimed(address indexed validator, uint256 amountWei);
    event ClaimAdvanced(address indexed validator, uint64 nextSetId, bool caughtUp);

    constructor(address validatorRegistry_, address gateway_, bytes32 routeId_,
                uint32 destinationDomain_) {
        if (validatorRegistry_ == address(0) ||
            validatorRegistry_.code.length == 0 ||
            gateway_ == address(0) || routeId_ == bytes32(0) ||
            destinationDomain_ == 0) revert InvalidConfiguration();
        validatorRegistry = IXGRInterchainValidatorSetV2(validatorRegistry_);
        gateway = gateway_;
        routeId = routeId_;
        destinationDomain = destinationDomain_;
    }

    function recipientCount() external view returns (uint256) {
        (uint256 count,) = validatorRegistry.getFeeRecipientCountAndSetId();
        return count;
    }

    function recipientSetId() external view returns (uint64) {
        (,uint64 epoch) = validatorRegistry.getFeeRecipientCountAndSetId();
        return epoch;
    }

    /// @notice Called once for each valid, fee-qualified Hyperlane message.
    /// @dev Writes ONE epoch counter instead of writing each validator balance.
    ///      On first write, recipient count is fixed to its immutable set epoch.
    function allocate(bytes32 messageId) external payable {
        if (msg.sender != gateway) revert UnauthorizedGateway();
        if (messageId == bytes32(0) || allocatedOperation[messageId] || msg.value == 0)
            revert InvalidOperation();
        (uint256 count, uint64 setId) = validatorRegistry.getFeeRecipientCountAndSetId();
        if (setId == 0 || count == 0) revert InvalidValidatorSet();
        FeeEpoch storage epoch = epochs[setId];
        if (epoch.recipients == 0) epoch.recipients = count;
        else if (epoch.recipients != count) revert InvalidValidatorSet();

        allocatedOperation[messageId] = true;
        allocatedSetId[messageId] = setId;
        epoch.totalWei += msg.value;
        totalAllocatedWei += msg.value;
        emit FeeAllocated(messageId, setId, msg.value);
    }

    /// @dev Same per-transfer round-robin as splitting into whole wei:
    ///      distribute successive wei over indices 0..n-1 of that set.
    ///      Rotations start their own independent, immutable recipient order.
    function _earned(address validator, uint64 setId) private view returns (uint256) {
        FeeEpoch storage e = epochs[setId];
        if (e.recipients == 0 || e.totalWei == 0) return 0;
        (uint256 indexPlusOne, uint256 count) =
            validatorRegistry.getFeeRecipientIndexForSet(setId, validator);
        if (count != e.recipients) revert InvalidValidatorSet();
        if (indexPlusOne == 0) return 0;
        if (indexPlusOne > count) revert InvalidValidatorSet();
        uint256 earned = e.totalWei / count;
        if (indexPlusOne <= e.totalWei % count) ++earned;
        return earned;
    }

    /// @notice Full outstanding validator balance in native wei.
    /// @dev For very long histories, use claimablePage() for bounded RPC reads.
    function claimable(address validator) external view returns (uint256) {
        uint64 first = claimCursor[validator];
        if (first == 0) first = 1;
        uint64 last = validatorRegistry.setId();
        if (first > last) return 0;
        uint256 paid = paidAtCursor[validator];
        uint256 balance;
        for (uint256 i = first; i <= uint256(last); ++i) {
            uint256 amount = _earned(validator, uint64(i));
            if (i == first) {
                if (paid > amount) revert InvalidValidatorSet();
                amount -= paid;
            }
            balance += amount;
        }
        return balance;
    }

    /// @notice Bounded getter with the cursor/next page for large epoch histories.
    function claimablePage(address validator, uint64 from, uint64 maxEpochs)
        external view returns (uint256 amountWei, uint64 nextSetId, bool hasMore)
    {
        if (maxEpochs == 0) revert InvalidClaimWindow();
        uint64 cursor = claimCursor[validator];
        if (cursor == 0) cursor = 1;
        if (from < cursor) revert InvalidClaimWindow();
        uint64 latest = validatorRegistry.setId();
        if (from > latest) return (0, latest, false);
        uint256 end = uint256(from) + uint256(maxEpochs) - 1;
        if (end > latest) end = latest;
        for (uint256 i = from; i <= end; ++i) {
            uint256 earned = _earned(validator,uint64(i));
            if (i == cursor) {
                uint256 paid = paidAtCursor[validator];
                if (paid > earned) revert InvalidValidatorSet();
                earned -= paid;
            }
            amountWei += earned;
        }
        hasMore = end < latest;
        nextSetId = hasMore ? uint64(end + 1) : latest;
    }

    /// @notice Pay outstanding fees across up to 32 validator-set epochs.
    function claim() external { _claim(32); }

    /// @notice Continue claiming in bounded pages after many membership changes.
    function claim(uint64 maxEpochs) external { _claim(maxEpochs); }

    function _claim(uint64 maxEpochs) private {
        if (maxEpochs == 0) revert InvalidClaimWindow();
        if (entered != 1) revert Reentrancy();
        entered = 2;
        uint64 first = claimCursor[msg.sender];
        if (first == 0) first = 1;
        uint64 latest = validatorRegistry.setId();
        if (latest == 0 || first > latest) revert InvalidValidatorSet();

        uint256 end = uint256(first) + uint256(maxEpochs) - 1;
        if (end > latest) end = latest;
        uint256 amount;
        uint256 paid = paidAtCursor[msg.sender];
        uint256 lastEarned;
        for (uint256 i = first; i <= end; ++i) {
            uint256 earned = _earned(msg.sender,uint64(i));
            if (i == first) {
                if (paid > earned) revert InvalidValidatorSet();
                amount += earned - paid;
            } else amount += earned;
            if (i == end) lastEarned = earned;
        }

        bool caughtUp = end == latest;
        uint64 next = caughtUp ? latest : uint64(end + 1);
        bool advanced = next != first;
        if (amount == 0 && !advanced) revert NothingToClaim();
        claimCursor[msg.sender] = next;
        paidAtCursor[msg.sender] = caughtUp ? lastEarned : 0;

        if (amount != 0) {
            totalClaimedWei += amount;
            (bool ok,) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert TransferFailed();
            emit Claimed(msg.sender, amount);
        }
        entered = 1;
        emit ClaimAdvanced(msg.sender, next, caughtUp);
    }
}
