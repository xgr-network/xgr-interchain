// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";

/// @notice Native source-chain validator fee accounting with pull withdrawals.
/// @dev ValidatorRegistryV2 and this FeeVault are on the SAME source chain.
///      An original Gateway bridge reads the source-chain RegistryV2's active
///      validators and atomically accrues the native-asset fee. A validator's
///      already accrued claimable balance survives membership changes.
///      NO relayer-supplied list, mirrored snapshot, or secondary quorum exists.
contract XGRILNFeeVault {
    uint256 internal constant MAX_VALIDATORS = 128;

    IXGRInterchainValidatorSetV2 public immutable validatorRegistry;
    address public immutable gateway;
    bytes32 public immutable routeId;
    uint32 public immutable destinationDomain;

    mapping(address => uint256) public claimable;
    mapping(bytes32 => bool) public allocatedOperation;
    mapping(bytes32 => uint64) public allocatedSetId;

    uint256 public totalAllocatedWei;
    uint256 public totalClaimedWei;
    uint256 public remainderCursor;
    uint256 private entered = 1;

    error InvalidConfiguration();
    error InvalidValidatorSet();
    error InvalidOperation();
    error UnauthorizedGateway();
    error NothingToClaim();
    error TransferFailed();
    error Reentrancy();

    event FeeAllocated(bytes32 indexed messageId, uint64 indexed validatorSetId, uint256 amountWei);
    event Claimed(address indexed validator, uint256 amountWei);

    constructor(
        address validatorRegistry_,
        address gateway_,
        bytes32 routeId_,
        uint32 destinationDomain_
    ) {
        if (
            validatorRegistry_ == address(0) ||
            validatorRegistry_.code.length == 0 ||
            gateway_ == address(0) ||
            routeId_ == bytes32(0) ||
            destinationDomain_ == 0
        ) revert InvalidConfiguration();

        validatorRegistry = IXGRInterchainValidatorSetV2(validatorRegistry_);
        gateway = gateway_;
        routeId = routeId_;
        destinationDomain = destinationDomain_;
    }

    function recipientCount() external view returns (uint256) {
        (address[] memory validators,) = _feeRecipients();
        return validators.length;
    }

    function recipientSetId() external view returns (uint64) {
        (,uint64 setId) = _feeRecipients();
        return setId;
    }

    /// @dev Fresh XETA deployments require the V2 address-only getter.
    ///      Missing or invalid RegistryV2 interfaces must fail closed.
    function _feeRecipients() private view returns (address[] memory validators, uint64 setId) {
        return validatorRegistry.getFeeRecipients();
    }

    /// @notice Original source Gateway only; no settlement / retry double pay.
    /// @dev An invalid registry set or duplicate message ID reverts the entire
    ///      source Gateway transaction (including prior lock/burn).
    function allocate(bytes32 messageId) external payable {
        if (msg.sender != gateway) revert UnauthorizedGateway();
        if (messageId == bytes32(0) || allocatedOperation[messageId] || msg.value == 0) {
            revert InvalidOperation();
        }

        (address[] memory validators,uint64 setId) = _feeRecipients();
        uint256 n = validators.length;
        if (setId == 0 || n == 0 || n > MAX_VALIDATORS) revert InvalidValidatorSet();

        // Every address comes directly from the local on-chain validator
        // registry. Never accept a list from the user or optional relayer.
        for (uint256 i; i < n; ++i) {
            if (validators[i] == address(0)) revert InvalidValidatorSet();
        }

        allocatedOperation[messageId] = true;
        allocatedSetId[messageId] = setId;

        uint256 share = msg.value / n;
        uint256 remainder = msg.value % n;
        uint256 cursor = remainderCursor % n;

        // Whole-wei rounding rotates between validators, avoiding a systematic
        // advantage for index zero when small route fees are used.
        // Sparse micro-fees: don't write storage slots for zero-payout validators.
        // Equal split and rotating remainder are unchanged for all fee amounts.
        if (share == 0) {
            for (uint256 i; i < remainder; ++i) {
                uint256 index = (cursor + i) % n;
                claimable[validators[index]] += 1;
            }
        } else {
            for (uint256 i; i < n; ++i) {
                uint256 index = (cursor + i) % n;
                claimable[validators[index]] += share + (i < remainder ? 1 : 0);
            }
        }
        remainderCursor = (cursor + remainder) % n;
        totalAllocatedWei += msg.value;

        emit FeeAllocated(messageId, setId, msg.value);
    }

    /// @notice Claim earned native-asset fees, even after leaving the validator set.
    function claim() external {
        if (entered != 1) revert Reentrancy();
        entered = 2;

        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        totalClaimedWei += amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        entered = 1;
        emit Claimed(msg.sender, amount);
    }
}
