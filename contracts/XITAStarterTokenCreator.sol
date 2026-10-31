// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Immutable supply ERC-20. The owner can only transfer/renounce ownership;
///         no mint, freeze, proxy, blacklist, tax, or upgrade privileges exist.
/// @dev Operator pays for deployment, while the nominated project owner receives everything.
contract XITAFixedSupplyToken is ERC20, Ownable {
    constructor(string memory name_, string memory symbol_, uint256 supply_, address owner_)
        ERC20(name_, symbol_)
    {
        require(owner_ != address(0) && supply_ > 0, "invalid token initialization");
        _transferOwnership(owner_);
        _mint(owner_, supply_);
    }
}

/// @notice Permissionless XGRChain token creation, paid exclusively by the
///         caller's standard wallet gas. No XGR protocol creation fee.
/// @dev Optional starter-gas is delivered BEFORE the call by an independent,
///      limited-budget opt-in service; the factory never controls the sponsor.
contract XITAStarterTokenCreator {
    uint256 public constant MAX_BASE_UNIT_SUPPLY = 1e36;

    error InvalidName();
    error InvalidSymbol();
    error InvalidSupply();
    error InvalidOwner();

    event TokenCreated(address indexed deployer, address indexed token, address indexed owner,
        string name, string symbol, uint256 initialSupply);

    function createToken(string calldata name_, string calldata symbol_, uint256 initialSupplyBaseUnits, address owner_)
        external returns (address token)
    {
        bytes memory n = bytes(name_);
        if (n.length < 2 || n.length > 80) revert InvalidName();
        bytes memory s = bytes(symbol_);
        if (s.length < 2 || s.length > 11) revert InvalidSymbol();
        for (uint256 i; i < s.length; ++i) {
            uint8 c = uint8(s[i]);
            if (!(c >= 65 && c <= 90) && !(i > 0 && c >= 48 && c <= 57))
                revert InvalidSymbol();
        }
        if (initialSupplyBaseUnits == 0 || initialSupplyBaseUnits > MAX_BASE_UNIT_SUPPLY)
            revert InvalidSupply();

        if(owner_ == address(0)) revert InvalidOwner();
        token = address(new XITAFixedSupplyToken(name_, symbol_, initialSupplyBaseUnits, owner_));
        emit TokenCreated(msg.sender, token, owner_, name_, symbol_, initialSupplyBaseUnits);
    }
}
