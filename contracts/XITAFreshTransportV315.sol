// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Mailbox} from "@hyperlane-xyz/core/contracts/Mailbox.sol";
import {MerkleTreeHook} from "@hyperlane-xyz/core/contracts/hooks/MerkleTreeHook.sol";
import {ProtocolFee} from "@hyperlane-xyz/core/contracts/hooks/ProtocolFee.sol";

interface IXITATransportISM {
    function destinationDomain() external view returns (uint32);
}

/// @notice Fresh, atomically initialized XITA transport for one EVM chain.
/// @dev The bundle is permanent Mailbox owner. It exposes no mutation methods:
/// the Mailbox default ISM and both Hooks cannot be retargeted by any EOA.
/// Destination message verification uses the deployed BLS-backed XITA ISM.
contract XITAFreshTransportV315 {
    Mailbox public immutable mailbox;
    MerkleTreeHook public immutable merkleTreeHook;
    ProtocolFee public immutable requiredHook;
    address public immutable destinationIsm;
    uint32 public immutable localDomain;

    error InvalidTransportConfiguration();

    constructor(uint32 domain_, address ism_) {
        if (domain_ == 0 || block.chainid != domain_ || ism_.code.length == 0 ||
            IXITATransportISM(ism_).destinationDomain() != domain_)
            revert InvalidTransportConfiguration();
        Mailbox m = new Mailbox(domain_);
        MerkleTreeHook h = new MerkleTreeHook(address(m));
        // A zero-fee required hook keeps dispatching operational without an
        // upgradeable administrative owner or any additional protocol charges.
        ProtocolFee p = new ProtocolFee(0, 0, address(this), address(this));
        m.initialize(address(this), ism_, address(h), address(p));
        if (address(m.defaultIsm()) != ism_ ||
            address(m.defaultHook()) != address(h) ||
            address(m.requiredHook()) != address(p) ||
            m.owner() != address(this))
            revert InvalidTransportConfiguration();
        mailbox = m;
        merkleTreeHook = h;
        requiredHook = p;
        destinationIsm = ism_;
        localDomain = domain_;
    }
}
