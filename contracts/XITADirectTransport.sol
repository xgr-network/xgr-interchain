// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Mailbox} from "@hyperlane-xyz/core/contracts/Mailbox.sol";
import {ProtocolFee} from "@hyperlane-xyz/core/contracts/hooks/ProtocolFee.sol";

interface IXITADirectISM {
    function destinationDomain() external view returns (uint32);
}

/// @notice Fresh, immutable Hyperlane transport without Merkle/Root state.
/// A zero-fee ProtocolFee hook is used as the dispatch interface. It stores
/// no message leaves; the source Gateway still enforces validator fees.
contract XITADirectTransport {
    Mailbox public immutable mailbox;
    ProtocolFee public immutable dispatchHook;
    address public immutable destinationIsm;
    uint32 public immutable localDomain;

    error InvalidTransportConfiguration();

    event TransportDeployed(address indexed mailbox, address indexed dispatchHook);

    constructor(uint32 domain_, address ism_) {
        if (domain_ == 0 || block.chainid != domain_ ||
            ism_.code.length == 0 ||
            IXITADirectISM(ism_).destinationDomain() != domain_)
            revert InvalidTransportConfiguration();

        Mailbox m = new Mailbox(domain_);
        ProtocolFee hook = new ProtocolFee(0, 0, address(this), address(this));
        m.initialize(address(this), ism_, address(hook), address(hook));
        if (address(m.defaultIsm()) != ism_ ||
            address(m.defaultHook()) != address(hook) ||
            address(m.requiredHook()) != address(hook) ||
            m.owner() != address(this))
            revert InvalidTransportConfiguration();

        mailbox = m;
        dispatchHook = hook;
        destinationIsm = ism_;
        localDomain = domain_;
        emit TransportDeployed(address(m), address(hook));
    }
}
