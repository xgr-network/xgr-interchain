// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IXGRILNRegistry} from "./IXGRILNRegistry.sol";

interface IXITAExistingGateway {
    function ilnRegistry() external view returns (IXGRILNRegistry);
    function routeId() external view returns (bytes32);
    function destinationDomain() external view returns (uint32);
    function warpToken() external view returns (address);
    function quoteILN(uint32 destination, bytes32 recipient, uint256 amount)
        external view returns (uint256 validatorFeeWei, uint256 routerNativeWei,
            uint256 bridgeNativeWei, uint256 tokenAmount);
    function bridge(uint32 destination, bytes32 recipient, uint256 amount)
        external payable returns (bytes32 messageId);
}

/// @notice Optional source-chain UI/interchain fee adapter. User signs every transfer.
/// @dev ONE instance per source chain, never per route or token. The underlying
///      permissionless ILN Gateway, Validator FeeVault, Mailbox and ISM are unchanged.
///      The pricing signer cannot execute transfers for the user. Fees are owed
///      to a separate immutable GmbH interchain-fee beneficiary. There is no
///      promise of gas sponsorship and no privilege over ILN delivery.
///      All downstream Mailbox.process / Gateway.bridge calls remain user-led.
contract XITAExecutionGateway is EIP712 {
    using SafeERC20 for IERC20;

    struct Quote {
        address payer;
        address gateway;
        bytes32 routeId;
        uint32 destinationDomain;
        bytes32 recipient;
        uint32 finalDestinationDomain;
        bytes32 finalRecipient;
        bytes32 onwardRouteId;
        uint256 amount;
        uint256 bridgeValueWei;
        uint256 interchainFeeWei;
        uint256 nonce;
        uint64 issuedAt;
    }

    struct FeeReceipt {
        address payer;
        address gateway;
        uint256 interchainFeeWei;
        bool exists;
        bool withdrawn;
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "SponsoredQuote(address payer,address gateway,bytes32 routeId,uint32 destinationDomain,bytes32 recipient,uint32 finalDestinationDomain,bytes32 finalRecipient,bytes32 onwardRouteId,uint256 amount,uint256 bridgeValueWei,uint256 interchainFeeWei,uint256 nonce,uint64 issuedAt)"
    );
    uint256 public constant MAX_QUOTE_LIFETIME = 90;

    address public immutable relayerOwner; // EIP-712 PRICING signer only.
    address payable public immutable interchainFeeRecipient; // Fixed GmbH payout.
    IXGRILNRegistry public immutable sourceRegistry;
    // Owner-adjustable policy; absolute expiry never exceeds 90 seconds.
    uint64 public quoteLifetimeSeconds = 90;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;
    mapping(bytes32 => FeeReceipt) public feeReceipt;
    uint256 public pendingInterchainFeesWei;
    uint256 private entered = 1;

    error InvalidConfiguration();
    error UnauthorizedRelayer();
    error InvalidQuote();
    error InvalidSignature();
    error QuoteExpired();
    error InvalidQuoteLifetime();
    error QuoteNonceUsed();
    error InvalidBridgeValue();
    error InvalidRegisteredRoute();
    error InvalidTokenDebit();
    error DuplicateMessageId();
    error NoClaimableFee();
    error NativePayoutFailed();
    error ReentrantCall();

    event InterchainFeeCharged(
        bytes32 indexed messageId,
        address indexed payer,
        address indexed gateway,
        bytes32 routeId,
        uint32 destinationDomain,
        bytes32 recipient,
        uint32 finalDestinationDomain,
        bytes32 finalRecipient,
        bytes32 onwardRouteId,
        uint256 amount,
        uint256 validatorFeeWei,
        uint256 bridgeNativeWei,
        uint256 interchainFeeWei,
        uint256 quoteNonce
    );
    event InterchainFeeWithdrawn(bytes32 indexed messageId, address indexed beneficiary, uint256 amountWei);
    event QuoteLifetimeUpdated(uint64 previousSeconds, uint64 newSeconds);

    modifier nonReentrant() {
        if (entered != 1) revert ReentrantCall();
        entered = 2;
        _;
        entered = 1;
    }

    constructor(address registry_, address relayerOwner_, address payable feeRecipient_) EIP712("XITA Interchain Fee", "1") {
        if (registry_ == address(0) || registry_.code.length == 0 || relayerOwner_ == address(0) || feeRecipient_ == address(0)) {
            revert InvalidConfiguration();
        }
        sourceRegistry = IXGRILNRegistry(registry_);
        relayerOwner = relayerOwner_;
        interchainFeeRecipient = feeRecipient_;
    }

    function quoteDigest(Quote calldata q) external view returns (bytes32) {
        return _hashTypedDataV4(_hashQuote(q));
    }

    /// @notice Owner can shorten or restore the lifetime up to the hard 90s cap.
    /// @dev Changing the policy applies immediately to outstanding signed quotes.
    function setQuoteLifetimeSeconds(uint64 newSeconds) external {
        if (msg.sender != relayerOwner) revert UnauthorizedRelayer();
        if (newSeconds == 0 || newSeconds > MAX_QUOTE_LIFETIME) revert InvalidQuoteLifetime();
        uint64 previousSeconds = quoteLifetimeSeconds;
        quoteLifetimeSeconds = newSeconds;
        emit QuoteLifetimeUpdated(previousSeconds, newSeconds);
    }

    function _hashQuote(Quote calldata q) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            QUOTE_TYPEHASH, q.payer, q.gateway, q.routeId,
            q.destinationDomain, q.recipient, q.finalDestinationDomain,
            q.finalRecipient, q.onwardRouteId, q.amount, q.bridgeValueWei,
            q.interchainFeeWei, q.nonce, q.issuedAt
        ));
    }

    /// @notice ONE USER-signed wallet transaction for source lock/burn and native fees.
    /// @dev An ERC20 token movement may require an earlier user allowance,
    ///      but all validator and relay SERVICE FEES are native currency only.
    function execute(Quote calldata q, bytes calldata signature)
        external payable nonReentrant returns (bytes32 messageId)
    {
        if (q.payer != msg.sender || q.payer == address(0) ||
            q.gateway == address(0) || q.routeId == bytes32(0) ||
            q.destinationDomain == 0 || q.recipient == bytes32(0) ||
            q.finalDestinationDomain == 0 || q.finalRecipient == bytes32(0) ||
            q.interchainFeeWei == 0 || q.amount == 0) revert InvalidQuote();
        // The first hop may go to XGRChain for a separately user-signed
        // second hop; no forwarder, GmbH mandate, or custody is granted.
        if (q.finalDestinationDomain == q.destinationDomain) {
            if (q.onwardRouteId != bytes32(0) || q.finalRecipient != q.recipient)
                revert InvalidQuote();
        } else if (q.destinationDomain != 1643 || q.onwardRouteId == bytes32(0)) {
            revert InvalidQuote();
        }
        // The owner-signed issuance timestamp is the only quote time field.
        // Reject a future issuance or a quote older than the live on-chain policy.
        if (q.issuedAt == 0 || uint256(q.issuedAt) > block.timestamp ||
            block.timestamp - uint256(q.issuedAt) > quoteLifetimeSeconds) revert QuoteExpired();
        if (nonceUsed[q.payer][q.nonce]) revert QuoteNonceUsed();
        if (ECDSA.recover(_hashTypedDataV4(_hashQuote(q)), signature) != relayerOwner) {
            revert InvalidSignature();
        }

        IXITAExistingGateway gateway = IXITAExistingGateway(q.gateway);
        if (address(gateway.ilnRegistry()) != address(sourceRegistry) ||
            gateway.routeId() != q.routeId ||
            gateway.destinationDomain() != q.destinationDomain) revert InvalidRegisteredRoute();

        (uint64 chainId,,address registeredGateway,,,,,,bool enabled) =
            sourceRegistry.getRoute(q.destinationDomain, q.routeId);
        if (!enabled || chainId != uint64(block.chainid) ||
            registeredGateway != q.gateway) revert InvalidRegisteredRoute();

        (uint256 validatorFeeWei,,uint256 bridgeNativeWei,uint256 tokenAmount) =
            gateway.quoteILN(q.destinationDomain, q.recipient, q.amount);
        address token = gateway.warpToken();
        if (validatorFeeWei == 0 || bridgeNativeWei != q.bridgeValueWei ||
            tokenAmount != (token == address(0) ? 0 : q.amount)) revert InvalidBridgeValue();
        if (msg.value != q.bridgeValueWei + q.interchainFeeWei) revert InvalidBridgeValue();

        nonceUsed[q.payer][q.nonce] = true; // Reverts atomically on any subsequent failure.
        if (token != address(0)) {
            IERC20 asset = IERC20(token);
            uint256 beforeBalance = asset.balanceOf(address(this));
            asset.safeTransferFrom(msg.sender, address(this), q.amount);
            if (asset.balanceOf(address(this)) - beforeBalance != q.amount) {
                revert InvalidTokenDebit(); // Disallow fee-on-transfer token underpayment.
            }
            asset.forceApprove(q.gateway, q.amount);
            messageId = gateway.bridge{value:q.bridgeValueWei}(
                q.destinationDomain, q.recipient, q.amount
            );
            asset.forceApprove(q.gateway, 0);
            if (asset.balanceOf(address(this)) != beforeBalance) revert InvalidTokenDebit();
        } else {
            messageId = gateway.bridge{value:q.bridgeValueWei}(
                q.destinationDomain, q.recipient, q.amount
            );
        }
        if (messageId == bytes32(0) || feeReceipt[messageId].exists) revert DuplicateMessageId();

        feeReceipt[messageId] = FeeReceipt({
            payer: msg.sender,
            gateway: q.gateway,
            interchainFeeWei: q.interchainFeeWei,
            exists: true,
            withdrawn: false
        });
        pendingInterchainFeesWei += q.interchainFeeWei;
        emit InterchainFeeCharged(messageId, msg.sender, q.gateway, q.routeId,
            q.destinationDomain, q.recipient, q.finalDestinationDomain,
            q.finalRecipient, q.onwardRouteId, q.amount, validatorFeeWei,
            bridgeNativeWei, q.interchainFeeWei, q.nonce);
    }

    /// @notice Anyone may settle earned fees, exclusively to the fixed payee.
    /// @dev Cannot redirect payouts or interfere with public token delivery.
    /// @notice Batch claim finalized source-native GmbH fees to the immutable payee.
    /// @dev A claim may include at most 32 receipt IDs; already paid IDs are
    ///      ignored (including duplicates). One payout reduces gas per receipt.
    ///      Anyone may call, but NO caller can change the beneficiary.
    function withdrawFees(bytes32[] calldata messageIds) external nonReentrant {
        if (messageIds.length == 0 || messageIds.length > 32) revert InvalidQuote();
        uint256 total;
        for (uint256 i = 0; i < messageIds.length; ++i) {
            FeeReceipt storage receipt = feeReceipt[messageIds[i]];
            if (!receipt.exists || receipt.withdrawn) continue;
            receipt.withdrawn = true;
            total += receipt.interchainFeeWei;
            emit InterchainFeeWithdrawn(messageIds[i], interchainFeeRecipient, receipt.interchainFeeWei);
        }
        if (total == 0) revert NoClaimableFee();
        pendingInterchainFeesWei -= total;
        (bool paid,) = interchainFeeRecipient.call{value:total}("");
        if (!paid) revert NativePayoutFailed();
    }

    function withdrawFee(bytes32 messageId) external nonReentrant {
        FeeReceipt storage receipt = feeReceipt[messageId];
        if (!receipt.exists || receipt.withdrawn || receipt.interchainFeeWei == 0) {
            revert NoClaimableFee();
        }
        receipt.withdrawn = true;
        uint256 amount = receipt.interchainFeeWei;
        pendingInterchainFeesWei -= amount;
        (bool paid,) = interchainFeeRecipient.call{value:amount}("");
        if (!paid) revert NativePayoutFailed();
        emit InterchainFeeWithdrawn(messageId, interchainFeeRecipient, amount);
    }
}
