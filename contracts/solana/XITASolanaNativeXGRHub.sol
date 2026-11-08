// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainValidatorSetV2} from "../IXGRInterchainValidatorSetV2.sol";
import {XGRILNProtocol} from "../XGRILNProtocol.sol";
import {XGRILNFeeVault} from "../XGRILNFeeVault.sol";
import {XITASolanaCodec} from "./XITASolanaCodec.sol";

/// @notice A permissionlessly deployable XGR-native collateral route to one
/// immutable Solana router. This is NEW infrastructure; no existing V315
/// EVM router, Gateway, FeeVault or validator contract is modified.
/// @dev Destination Solana keys stay full bytes32. No owner, pause, mint,
/// whitelist, administrative upgrade, fee recipient or custody operator.
/// Release requires the current XGR destination validator set BLS quorum.
contract XITASolanaNativeXGRHub {
    uint32 public constant XGR_DOMAIN = 1643;
    uint32 public constant SOLANA_DOMAIN = 1399811149;
    bytes32 public immutable assetId;
    bytes32 public immutable outboundRouteId;
    bytes32 public immutable inboundRouteId;
    bytes32 public immutable solanaRouter;
    bytes32 public immutable solanaProgram;
    bytes32 public immutable solanaSourceRegistry;
    bytes32 public immutable solanaDestinationISM;
    bytes32 public immutable solanaDestinationRegistry;
    IXGRInterchainValidatorSetV2 public immutable validatorRegistry;
    XGRILNFeeVault public immutable feeVault;
    uint256 public sourceFeeWei;
    uint64 public feeNonce;
    uint64 public nextNonce;
    uint256 public lockedPrincipalWei;

    mapping(bytes32 => bool) public consumedInbound;
    uint256 private nonReentrant = 1;

    error InvalidConfiguration();
    error InvalidFee();
    error InvalidTransfer();
    error Replay();
    error InsufficientBacking();
    error BLSQuorumFailed();
    error ReentrantCall();

    event SolanaOutbound(
        bytes32 indexed messageId,
        bytes32 indexed routeId,
        address indexed sender,
        bytes32 recipient,
        uint256 amountWei,
        uint64 nonce,
        uint64 sourceBlockNumber,
        uint64 validatorSetId,
        uint256 validatorFeeWei
    );
    event SolanaInbound(
        bytes32 indexed messageId,
        bytes32 indexed routeId,
        address indexed receiver,
        uint256 amountWei,
        uint64 sourceSlot,
        uint64 validatorSetId
    );
    event SourceFeeChanged(uint256 oldFeeWei,uint256 newFeeWei,uint64 nonce,uint64 setId);

    modifier guarded() {
        if (nonReentrant != 1) revert ReentrantCall();
        nonReentrant = 2;
        _;
        nonReentrant = 1;
    }

    constructor(
        address validatorRegistry_,
        bytes32 solanaProgram_,
        bytes32 solanaRouter_,
        bytes32 solanaSourceRegistry_,
        bytes32 solanaDestinationISM_,
        bytes32 solanaDestinationRegistry_,
        uint256 initialSourceFeeWei_
    ) {
        if (block.chainid != XGR_DOMAIN ||
            validatorRegistry_.code.length == 0 ||
            solanaProgram_ == bytes32(0) || solanaRouter_ == bytes32(0) ||
            solanaSourceRegistry_ == bytes32(0) ||
            solanaDestinationISM_ == bytes32(0) ||
            solanaDestinationRegistry_ == bytes32(0) ||
            initialSourceFeeWei_ == 0)
            revert InvalidConfiguration();
        IXGRInterchainValidatorSetV2 registry =
            IXGRInterchainValidatorSetV2(validatorRegistry_);
        if (registry.destinationDomain() != XGR_DOMAIN ||
            registry.originChainId() != XGR_DOMAIN ||
            registry.verifier() == address(0) ||
            registry.setId() == 0)
            revert InvalidConfiguration();

        validatorRegistry = registry;
        solanaProgram = solanaProgram_;
        solanaRouter = solanaRouter_;
        solanaSourceRegistry = solanaSourceRegistry_;
        solanaDestinationISM = solanaDestinationISM_;
        solanaDestinationRegistry = solanaDestinationRegistry_;
        sourceFeeWei = initialSourceFeeWei_;

        assetId = XGRILNProtocol.assetIdV315(1643, address(0), 0);
        bytes32 localRouter = XITASolanaCodec.evmAddress32(address(this));
        outboundRouteId = XITASolanaCodec.solanaRouteId(
            assetId,XGR_DOMAIN,SOLANA_DOMAIN,localRouter,solanaRouter_
        );
        inboundRouteId = XITASolanaCodec.solanaRouteId(
            assetId,SOLANA_DOMAIN,XGR_DOMAIN,solanaRouter_,localRouter
        );
        feeVault = new XGRILNFeeVault(
            validatorRegistry_,address(this),outboundRouteId,SOLANA_DOMAIN
        );
    }

    /// @dev User-signed native XGR lock. Token and validator fee are part of
    /// the SAME transaction; an allocation failure undoes the principal lock.
    /// Asset precision is prechecked for the 18->9 Solana SPL representation.
    function lockToSolana(bytes32 recipient,uint256 amountWei)
        external payable guarded returns(bytes32 messageId)
    {
        if (recipient == bytes32(0) || amountWei == 0 || nextNonce == type(uint64).max)
            revert InvalidTransfer();
        uint256 fee = sourceFeeWei;
        if (fee == 0 || amountWei > type(uint256).max-fee ||
            msg.value != amountWei + fee) revert InvalidFee();
        XITASolanaCodec.exactScaleAmount(amountWei,18,9,true);
        uint64 nonce = nextNonce + 1;
        nextNonce = nonce;
        // Source evidence is this contract's finalized event, escrow balance
        // and feeVault allocation, all independently checked by validators.
        messageId = keccak256(abi.encode(
            keccak256("XITA_SOLANA_NATIVE_LOCK_V1"),
            block.chainid,address(this),nonce,msg.sender,recipient,
            amountWei,fee,outboundRouteId,solanaProgram,solanaRouter
        ));
        lockedPrincipalWei += amountWei;
        feeVault.allocate{value:fee}(messageId);
        emit SolanaOutbound(
            messageId,outboundRouteId,msg.sender,recipient,amountWei,
            nonce,uint64(block.number),validatorRegistry.setId(),fee
        );
    }

    /// @notice Native XGR released only for a proved Solana burn
    /// authenticated by the current XGR validator set.
    /// @dev The Solana program must independently enforce burn, source fee,
    /// replay and canonical route. These semantics are then signed by XGR
    /// validators. A caller cannot provide its own verifier or registry.
    function releaseFromSolana(
        XITASolanaCodec.Authorization calldata auth,
        bytes calldata bitmap,bytes calldata aggregateSignature
    ) external guarded {
        XITASolanaCodec.Authorization memory a=auth;
        if (a.assetId != assetId || a.routeId != inboundRouteId ||
            a.sourceDomain != SOLANA_DOMAIN ||
            a.destinationDomain != XGR_DOMAIN ||
            a.sourceRegistry != solanaSourceRegistry ||
            a.gateway != solanaProgram ||
            a.sourceRouter != solanaRouter ||
            a.sourceMailbox != solanaProgram ||
            a.destinationRouter != XITASolanaCodec.evmAddress32(address(this)) ||
            a.destinationIsm != XITASolanaCodec.evmAddress32(address(this)) ||
            a.destinationRegistry !=
                XITASolanaCodec.evmAddress32(address(validatorRegistry)) ||
            a.setId == 0 || // Historical sets are valid for settled transfers.
            a.sourceHeight == 0 || a.validatorFeeAtomic == 0 ||
            a.messageId == bytes32(0) || a.recipient == bytes32(0) ||
            bitmap.length == 0 || aggregateSignature.length == 0)
            revert InvalidTransfer();

        if (consumedInbound[a.messageId]) revert Replay();
        uint256 principal = a.amountCanonical;
        if (principal == 0 || principal > lockedPrincipalWei ||
            address(this).balance < principal) revert InsufficientBacking();
        XITASolanaCodec.exactScaleAmount(principal,18,9,true);

        bytes memory payload = XITASolanaCodec.directSigningBytes(a);
        if (!validatorRegistry.verifyQuorum(
            a.setId,payload,bitmap,aggregateSignature
        )) revert BLSQuorumFailed();

        consumedInbound[a.messageId] = true;
        lockedPrincipalWei -= principal;
        address receiver = address(uint160(uint256(a.recipient)));
        (bool ok,) = payable(receiver).call{value:principal}("");
        if (!ok) revert InvalidTransfer();
        emit SolanaInbound(
            a.messageId,inboundRouteId,receiver,principal,a.sourceHeight,a.setId
        );
    }

    /// @notice Same governance as XGRILNRegistryV315.applySourceFee.
    /// Absolutely no unilateral deployer or GmbH fee changes.
    function applySourceFee(
        XGRILNProtocol.SourceFeeProposalV315 calldata proposal,
        bytes calldata bitmap,bytes calldata aggregateSignature
    ) external {
        XGRILNProtocol.SourceFeeProposalV315 memory p=proposal;
        if (p.sourceChainId != XGR_DOMAIN ||
            p.sourceDomain != XGR_DOMAIN ||
            p.registry != address(this) ||
            p.setId != validatorRegistry.setId() ||
            p.validatorFeeWei == 0 ||
            p.validUntil < block.timestamp ||
            feeNonce == type(uint64).max ||
            p.nonce != feeNonce + 1)
            revert InvalidFee();
        if (!validatorRegistry.verifyQuorum(
            p.setId,XGRILNProtocol.encodeSourceFeeProposalV315(p),
            bitmap,aggregateSignature
        )) revert BLSQuorumFailed();
        uint256 previous=sourceFeeWei;
        sourceFeeWei=p.validatorFeeWei;
        feeNonce=p.nonce;
        emit SourceFeeChanged(previous,p.validatorFeeWei,p.nonce,p.setId);
    }

    /// @dev Direct transfers cannot bypass message/fee accounting.
    receive() external payable { revert InvalidTransfer(); }
}

/// @notice Anyone can deploy their own immutable, separately funded XGR to
/// Solana router. Not a singleton or allowlisted canonical asset issuer.
contract XITASolanaNativeXGRHubFactory {
    event RouteDeployed(address indexed creator,address indexed hub,
        bytes32 indexed outboundRouteId,bytes32 inboundRouteId);
    function deploy(
        address registry,
        bytes32 solanaProgram,bytes32 solanaRouter,
        bytes32 solanaSourceRegistry,bytes32 solanaDestinationISM,
        bytes32 solanaDestinationRegistry,uint256 sourceFeeWei
    ) external returns(address hub){
        XITASolanaNativeXGRHub h=new XITASolanaNativeXGRHub(
            registry,solanaProgram,solanaRouter,solanaSourceRegistry,
            solanaDestinationISM,solanaDestinationRegistry,sourceFeeWei
        );
        hub=address(h);
        emit RouteDeployed(msg.sender,hub,h.outboundRouteId(),h.inboundRouteId());
    }
}
