// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
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
///      to a single GmbH fee/sponsorship beneficiary, controlled by an
///      independent offline recovery administrator. There is no
///      promise of gas sponsorship and no privilege over ILN delivery.
///      All downstream Mailbox.process / Gateway.bridge calls remain user-led.
contract XITAExecutionGateway is EIP712, Ownable2Step {
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
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "SponsoredQuote(address payer,address gateway,bytes32 routeId,uint32 destinationDomain,bytes32 recipient,uint32 finalDestinationDomain,bytes32 finalRecipient,bytes32 onwardRouteId,uint256 amount,uint256 bridgeValueWei,uint256 interchainFeeWei,uint256 nonce,uint64 issuedAt)"
    );
    uint256 public constant MAX_QUOTE_LIFETIME = 90;

    address public relayerOwner; // EIP-712 pricing signer only, no payout authority.
    address payable public interchainFeeRecipient; // SAME EVM wallet that sponsors gas.
    // owner(): independent recovery Admin (preferably hardware multisig).
    // Never use the fee wallet's private key for owner() or the quote signer.
    IXGRILNRegistry public immutable sourceRegistry;
    // Owner-adjustable policy; absolute expiry never exceeds 90 seconds.
    uint64 public quoteLifetimeSeconds = 90;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;
    // Hub: exact wallet-initiated continuation of a confirmed first-hop message.
    mapping(address => mapping(bytes32 => bool)) public onwardParentUsed;
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
    event InterchainFeeClaimed(address indexed beneficiary, uint256 amountWei);
    event OnwardJourneyDispatched(
        bytes32 indexed parentMessageId,
        bytes32 indexed messageId,
        address indexed payer,
        bytes32 routeId,
        uint32 destinationDomain,
        bytes32 recipient,
        uint256 amount,
        uint256 validatorFeeWei,
        uint256 bridgeNativeWei
    );
    event QuoteLifetimeUpdated(uint64 previousSeconds, uint64 newSeconds);
    event InterchainFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event QuoteSignerUpdated(address indexed oldSigner, address indexed newSigner);

    modifier nonReentrant() {
        if (entered != 1) revert ReentrantCall();
        entered = 2;
        _;
        entered = 1;
    }

    constructor(
        address registry_,
        address relayerOwner_,
        address payable feeRecipient_,
        address recoveryAdmin_
    ) EIP712("XITA Interchain Fee", "1") Ownable(recoveryAdmin_) {
        if (
            registry_ == address(0) || registry_.code.length == 0 ||
            relayerOwner_ == address(0) || feeRecipient_ == address(0) ||
            recoveryAdmin_ == address(0) ||
            recoveryAdmin_ == relayerOwner_ || recoveryAdmin_ == feeRecipient_
        ) revert InvalidConfiguration();
        sourceRegistry = IXGRILNRegistry(registry_);
        relayerOwner = relayerOwner_;
        interchainFeeRecipient = feeRecipient_;
    }

    /// @notice Rotate the fee recipient AND native-gas sponsor address together.
    /// @dev This does not withdraw funds, reset the aggregate balance, affect
    ///      user nonces or change canonical validator fees. Already accrued
    ///      unclaimed fees are transferred to the CURRENT recipient by claimFees().
    ///      The compromised fee wallet has NO permission to call this function.
    function setInterchainFeeRecipient(address payable nextRecipient) external onlyOwner {
        if (
            nextRecipient == address(0) || nextRecipient == address(this) ||
            nextRecipient == interchainFeeRecipient || nextRecipient == owner()
        ) revert InvalidConfiguration();
        address previous = interchainFeeRecipient;
        interchainFeeRecipient = nextRecipient;
        emit InterchainFeeRecipientUpdated(previous, nextRecipient);
    }

    /// @notice Independently replace a compromised EIP-712 quote signer.
    /// @dev The old signer becomes invalid immediately; the new signer must
    ///      use fresh typed quotes. No change to the fee/sponsor wallet.
    function setQuoteSigner(address nextSigner) external onlyOwner {
        if (
            nextSigner == address(0) || nextSigner == relayerOwner ||
            nextSigner == owner()
        ) revert InvalidConfiguration();
        address previous = relayerOwner;
        relayerOwner = nextSigner;
        emit QuoteSignerUpdated(previous, nextSigner);
    }

    /// @notice Avoid permanently orphaning the fee recipient recovery role.
    function renounceOwnership() public override onlyOwner {
        revert InvalidConfiguration();
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

        nonceUsed[q.payer][q.nonce] = true; // Reverts with any subsequent failure.
        messageId = _bridgeExistingGateway(gateway, q.gateway, q.destinationDomain,
            q.recipient, q.amount, q.bridgeValueWei);
        if (messageId == bytes32(0) || feeReceipt[messageId].exists) revert DuplicateMessageId();

        feeReceipt[messageId] = FeeReceipt({
            payer: msg.sender,
            gateway: q.gateway,
            interchainFeeWei: q.interchainFeeWei,
            exists: true
        });
        pendingInterchainFeesWei += q.interchainFeeWei;
        emit InterchainFeeCharged(messageId, msg.sender, q.gateway, q.routeId,
            q.destinationDomain, q.recipient, q.finalDestinationDomain,
            q.finalRecipient, q.onwardRouteId, q.amount, validatorFeeWei,
            bridgeNativeWei, q.interchainFeeWei, q.nonce);
    }

    /// @notice Wallet-signed HUB second hop, linked to one original message.
    /// @dev Exactly one user transaction. No extra GmbH fee and no signer
    ///      permission. Validators still collect the canonical XGR native fee.
    ///      The read-only indexer independently checks parent source receipt,
    ///      wallet, route, amount and confirmed Mailbox delivery. Fungible
    ///      balances do not imply on-chain provenance of individual coins.
    function continueJourney(
        bytes32 parentMessageId,
        address gatewayAddress,
        bytes32 expectedRouteId,
        uint32 destination,
        bytes32 recipient,
        uint256 amount
    ) external payable nonReentrant returns (bytes32 messageId) {
        if (block.chainid != 1643 || parentMessageId == bytes32(0) ||
            gatewayAddress == address(0) || expectedRouteId == bytes32(0) ||
            destination == 0 || destination == 1643 || recipient == bytes32(0) ||
            amount == 0 || onwardParentUsed[msg.sender][parentMessageId]) {
            revert InvalidQuote();
        }
        IXITAExistingGateway gateway = IXITAExistingGateway(gatewayAddress);
        if (address(gateway.ilnRegistry()) != address(sourceRegistry) ||
            gateway.routeId() != expectedRouteId ||
            gateway.destinationDomain() != destination) revert InvalidRegisteredRoute();
        (uint64 chainId,,address registeredGateway,,,,,,bool enabled) =
            sourceRegistry.getRoute(destination,expectedRouteId);
        if (!enabled || chainId != uint64(block.chainid) ||
            registeredGateway != gatewayAddress) revert InvalidRegisteredRoute();
        (uint256 validatorFeeWei,,uint256 bridgeNativeWei,uint256 tokenAmount) =
            gateway.quoteILN(destination,recipient,amount);
        if (validatorFeeWei == 0 ||
            tokenAmount != (gateway.warpToken() == address(0) ? 0 : amount) ||
            msg.value != bridgeNativeWei) revert InvalidBridgeValue();
        onwardParentUsed[msg.sender][parentMessageId] = true;
        messageId = _bridgeExistingGateway(gateway,gatewayAddress,destination,
            recipient,amount,bridgeNativeWei);
        if (messageId == bytes32(0)) revert DuplicateMessageId();
        emit OnwardJourneyDispatched(parentMessageId,messageId,msg.sender,
            expectedRouteId,destination,recipient,amount,validatorFeeWei,bridgeNativeWei);
    }

    /// @dev Reuse the SAME verified Gateway/token-handling path for both
    ///      paid first-hop and fee-free onward transactions.
    function _bridgeExistingGateway(
        IXITAExistingGateway gateway,address gatewayAddress,uint32 destination,
        bytes32 recipient,uint256 amount,uint256 bridgeNativeWei
    ) internal returns (bytes32 messageId) {
        address token = gateway.warpToken();
        if (token != address(0)) {
            IERC20 asset = IERC20(token);
            uint256 beforeBalance = asset.balanceOf(address(this));
            asset.safeTransferFrom(msg.sender,address(this),amount);
            if (asset.balanceOf(address(this)) - beforeBalance != amount)
                revert InvalidTokenDebit();
            asset.forceApprove(gatewayAddress,amount);
            messageId = gateway.bridge{value:bridgeNativeWei}(
                destination,recipient,amount);
            asset.forceApprove(gatewayAddress,0);
            if (asset.balanceOf(address(this)) != beforeBalance)
                revert InvalidTokenDebit();
        } else {
            messageId = gateway.bridge{value:bridgeNativeWei}(
                destination,recipient,amount);
        }
    }

    /// @notice Claim the ENTIRE accrued Interchain Fee balance in one operation.
    /// @dev No message IDs, no per-transfer claims, no caller-selectable payee.
    ///      The entire accrued balance goes only to the CURRENT GmbH
    ///      recipient, even when it was accrued before a key rotation.
    function claimFees() external nonReentrant {
        uint256 amount = pendingInterchainFeesWei;
        if (amount == 0) revert NoClaimableFee();
        pendingInterchainFeesWei = 0; // Checked-effects-interactions.
        (bool paid,) = interchainFeeRecipient.call{value:amount}("");
        if (!paid) revert NativePayoutFailed();
        emit InterchainFeeClaimed(interchainFeeRecipient, amount);
    }
}
