// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Plain, permanently fixed-supply ERC-20. No owner, mint, freeze,
///         proxy, blacklist, transfer tax, confiscation or upgrade authority.
/// @dev The deployer's chosen wallet receives all tokens in the constructor.
contract XITAFixedSupplyToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 supply_, address creator_)
        ERC20(name_, symbol_)
    {
        require(creator_ != address(0) && supply_ > 0, "invalid token initialization");
        _mint(creator_, supply_);
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

    event TokenCreated(address indexed creator, address indexed token, bytes32 indexed symbolHash,
        string name, string symbol, uint256 initialSupply);

    function createToken(string calldata name_, string calldata symbol_, uint256 initialSupplyBaseUnits)
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

        token = address(new XITAFixedSupplyToken(name_, symbol_, initialSupplyBaseUnits, msg.sender));
        emit TokenCreated(msg.sender, token, keccak256(s), name_, symbol_, initialSupplyBaseUnits);
    }
}
