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

/// @notice Optional source-chain financing adapter for XITA GmbH managed delivery.
/// @dev ONE instance per source chain, never per route or token. The underlying
///      permissionless ILN Gateway, Validator FeeVault, Mailbox and ISM are unchanged.
///      Only the immutable RELAYER can sign fee quotes and withdraw service fees.
///      This is a paid UI/operator service, NOT protocol permission or custody.
///      Relayer fee is paid in native source coin, independent of bridged token.
///      Owner may withdraw before destination delivery: do not present it as
///      escrow guaranteeing delivery or a cryptographic refund obligation.
contract XITAExecutionGateway is EIP712 {
    using SafeERC20 for IERC20;

    struct Quote {
        address payer;
        address gateway;
        bytes32 routeId;
        uint32 destinationDomain;
        bytes32 recipient;
        uint256 amount;
        uint256 bridgeValueWei;
        uint256 relayerFeeWei;
        uint256 nonce;
        uint64 issuedAt;
    }

    struct FeeReceipt {
        address payer;
        address gateway;
        uint256 relayerFeeWei;
        bool exists;
        bool withdrawn;
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "SponsoredQuote(address payer,address gateway,bytes32 routeId,uint32 destinationDomain,bytes32 recipient,uint256 amount,uint256 bridgeValueWei,uint256 relayerFeeWei,uint256 nonce,uint64 issuedAt)"
    );
    uint256 public constant MAX_QUOTE_LIFETIME = 90;

    address public immutable relayerOwner;
    IXGRILNRegistry public immutable sourceRegistry;
    // Owner-adjustable policy; absolute expiry never exceeds 90 seconds.
    uint64 public quoteLifetimeSeconds = 90;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;
    mapping(bytes32 => FeeReceipt) public feeReceipt;
    uint256 public pendingServiceFeesWei;
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

    event ManagedDispatch(
        bytes32 indexed messageId,
        address indexed payer,
        address indexed gateway,
        bytes32 routeId,
        uint32 destinationDomain,
        bytes32 recipient,
        uint256 amount,
        uint256 validatorFeeWei,
        uint256 bridgeNativeWei,
        uint256 relayerFeeWei,
        uint256 quoteNonce
    );
    event ServiceFeeWithdrawn(bytes32 indexed messageId, address indexed owner, uint256 amountWei);
    event QuoteLifetimeUpdated(uint64 previousSeconds, uint64 newSeconds);

    modifier nonReentrant() {
        if (entered != 1) revert ReentrantCall();
        entered = 2;
        _;
        entered = 1;
    }

    constructor(address registry_, address relayerOwner_) EIP712("XITA Managed Relay", "1") {
        if (registry_ == address(0) || registry_.code.length == 0 || relayerOwner_ == address(0)) {
            revert InvalidConfiguration();
        }
        sourceRegistry = IXGRILNRegistry(registry_);
        relayerOwner = relayerOwner_;
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
            q.destinationDomain, q.recipient, q.amount, q.bridgeValueWei,
            q.relayerFeeWei, q.nonce, q.issuedAt
        ));
    }

    /// @notice ONE wallet transaction for source lock/burn and native fees.
    /// @dev An ERC20 token movement may require an earlier user allowance,
    ///      but all validator and relay SERVICE FEES are native currency only.
    function execute(Quote calldata q, bytes calldata signature)
        external payable nonReentrant returns (bytes32 messageId)
    {
        if (q.payer != msg.sender || q.payer == address(0) ||
            q.gateway == address(0) || q.routeId == bytes32(0) ||
            q.destinationDomain == 0 || q.recipient == bytes32(0) ||
            q.amount == 0) revert InvalidQuote();
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
        if (msg.value != q.bridgeValueWei + q.relayerFeeWei) revert InvalidBridgeValue();

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
            relayerFeeWei: q.relayerFeeWei,
            exists: true,
            withdrawn: false
        });
        pendingServiceFeesWei += q.relayerFeeWei;
        emit ManagedDispatch(messageId, msg.sender, q.gateway, q.routeId,
            q.destinationDomain, q.recipient, q.amount, validatorFeeWei,
            bridgeNativeWei, q.relayerFeeWei, q.nonce);
    }

    /// @dev Service-fee trust boundary: the GmbH owner may withdraw its fee
    ///      even if it did not deliver. Never confers ILN mint/validator rights.
    function withdrawFee(bytes32 messageId) external nonReentrant {
        if (msg.sender != relayerOwner) revert UnauthorizedRelayer();
        FeeReceipt storage receipt = feeReceipt[messageId];
        if (!receipt.exists || receipt.withdrawn || receipt.relayerFeeWei == 0) {
            revert NoClaimableFee();
        }
        receipt.withdrawn = true;
        uint256 amount = receipt.relayerFeeWei;
        pendingServiceFeesWei -= amount;
        (bool paid,) = payable(relayerOwner).call{value:amount}("");
        if (!paid) revert NativePayoutFailed();
        emit ServiceFeeWithdrawn(messageId, relayerOwner, amount);
    }
}
