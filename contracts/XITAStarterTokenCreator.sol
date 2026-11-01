// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice One audited ERC-20 implementation with constructor-bound feature settings.
/// @dev No arbitrary project code, upgrades, pausing, forced burns, blacklisting,
///      tax hooks or factory controls. Disabled methods always revert.
///      ERC20Permit is implemented using OpenZeppelin and enabled per-token.
///      The factory is only a temporary constructor deployer, not the owner.
contract XITACreatorERC20 is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    uint8 public constant FIXED = 0;
    uint8 public constant BURNABLE = 1;
    uint8 public constant CONTROLLED_MINT = 2;

    uint8 private _tokenDecimals;
    uint8 public tokenType;
    bool public permitEnabled;
    uint256 public lifetimeCap;
    uint256 public lifetimeMinted;
    address public minter;

    error UnsupportedFeature();
    error InvalidConfiguration();
    error UnauthorizedMinter();
    error LifetimeSupplyExceeded();

    event MinterChanged(address indexed previous, address indexed next);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supplyBaseUnits_,
        address owner_,
        uint8 type_,
        uint8 decimals_,
        uint256 lifetimeCapBaseUnits_,
        bool permit_,
        address minter_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        if (owner_ == address(0) || supplyBaseUnits_ == 0 ||
            type_ > CONTROLLED_MINT ||
            !(decimals_ == 6 || decimals_ == 8 || decimals_ == 18) ||
            lifetimeCapBaseUnits_ < supplyBaseUnits_) revert InvalidConfiguration();
        if (type_ == CONTROLLED_MINT) {
            if (minter_ == address(0)) revert InvalidConfiguration();
            minter = minter_;
            emit MinterChanged(address(0), minter_);
        } else {
            if (minter_ != address(0) ||
                lifetimeCapBaseUnits_ != supplyBaseUnits_) revert InvalidConfiguration();
        }
        tokenType = type_;
        _tokenDecimals = decimals_;
        lifetimeCap = lifetimeCapBaseUnits_;
        lifetimeMinted = supplyBaseUnits_;
        permitEnabled = permit_;
        _transferOwnership(owner_);
        _mint(owner_, supplyBaseUnits_);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    /// @notice Caller burns only own tokens. burnFrom requires ERC20 allowance.
    function burn(uint256 value) public override {
        if (tokenType == FIXED) revert UnsupportedFeature();
        super.burn(value);
    }

    function burnFrom(address from, uint256 value) public override {
        if (tokenType == FIXED) revert UnsupportedFeature();
        super.burnFrom(from, value);
    }

    /// @notice Minter is separate from owner and cannot change its own role.
    /// @dev Burn cannot replenish the lifetime issuance budget.
    function mint(address recipient, uint256 value) external {
        if (tokenType != CONTROLLED_MINT) revert UnsupportedFeature();
        if (msg.sender != minter) revert UnauthorizedMinter();
        if (recipient == address(0) || value == 0) revert InvalidConfiguration();
        if (value > lifetimeCap - lifetimeMinted) revert LifetimeSupplyExceeded();
        lifetimeMinted += value;
        _mint(recipient, value);
    }

    function setMinter(address next) external onlyOwner {
        if (tokenType != CONTROLLED_MINT) revert UnsupportedFeature();
        address previous = minter;
        minter = next; // address(0) disables minting until owner sets another address
        emit MinterChanged(previous, next);
    }

    /// @notice Renunciation also permanently disables further token issuance.
    function renounceOwnership() public override onlyOwner {
        if (tokenType == CONTROLLED_MINT) {
            address previous = minter;
            minter = address(0);
            emit MinterChanged(previous, address(0));
        }
        super.renounceOwnership();
    }

    /// @notice Standard EIP-2612 when enabled; otherwise no permit signatures
    ///         or allowances can be submitted through this method.
    function permit(
        address holder, address spender, uint256 value, uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) public override {
        if (!permitEnabled) revert UnsupportedFeature();
        super.permit(holder, spender, value, deadline, v, r, s);
    }
}

/// @notice Permissionless deployment of tightly specified standard templates.
/// @dev The XGR operator alone pays for deployments initiated by XITA's
///      separate, budget-capped creator worker. The on-chain factory never
///      receives token ownership, supply or a factory administrator role.
contract XITAStarterTokenCreator {
    uint256 public constant MAX_BASE_UNIT_SUPPLY = 1e36;
    uint8 public constant FIXED = 0;
    uint8 public constant BURNABLE = 1;
    uint8 public constant CONTROLLED_MINT = 2;

    error InvalidName();
    error InvalidSymbol();
    error InvalidSupply();
    error InvalidOwner();
    error InvalidTokenConfiguration();

    event TokenCreated(
        address indexed deployer, address indexed token, address indexed owner,
        string name, string symbol, uint256 initialSupply
    );
    event TokenConfigured(
        address indexed token, uint8 indexed tokenType, uint8 decimals,
        uint256 lifetimeCap, bool permitEnabled, address minter, bytes32 runtimeCodeHash
    );

    /// @notice Deprecated API maintained for the existing fixed-supply preview.
    function createToken(
        string calldata name_, string calldata symbol_,
        uint256 initialSupplyBaseUnits, address owner_
    ) external returns (address token) {
        return _create(name_, symbol_, initialSupplyBaseUnits, owner_, FIXED, 18,
            initialSupplyBaseUnits, false, address(0));
    }

    /// @notice Token settings are unchangeable after constructor deployment,
    ///         except that the project Owner may rotate the minter role.
    function createTokenConfigured(
        string calldata name_, string calldata symbol_,
        uint256 initialSupplyBaseUnits, address owner_, uint8 type_,
        uint8 decimals_, uint256 lifetimeCapBaseUnits,
        bool permitEnabled_, address minter_
    ) external returns (address token) {
        return _create(name_, symbol_, initialSupplyBaseUnits, owner_, type_,
            decimals_, lifetimeCapBaseUnits, permitEnabled_, minter_);
    }

    function _create(
        string memory name_, string memory symbol_,
        uint256 initialSupplyBaseUnits, address owner_, uint8 type_,
        uint8 decimals_, uint256 lifetimeCapBaseUnits,
        bool permitEnabled_, address minter_
    ) internal returns (address token) {
        bytes memory n = bytes(name_);
        if (n.length < 2 || n.length > 80) revert InvalidName();
        bytes memory s = bytes(symbol_);
        if (s.length < 2 || s.length > 11) revert InvalidSymbol();
        for (uint256 i; i < s.length; ++i) {
            uint8 c = uint8(s[i]);
            if (!(c >= 65 && c <= 90) &&
                !(i > 0 && c >= 48 && c <= 57)) revert InvalidSymbol();
        }
        if (owner_ == address(0)) revert InvalidOwner();
        if (initialSupplyBaseUnits == 0 ||
            initialSupplyBaseUnits > MAX_BASE_UNIT_SUPPLY ||
            lifetimeCapBaseUnits < initialSupplyBaseUnits ||
            lifetimeCapBaseUnits > MAX_BASE_UNIT_SUPPLY) revert InvalidSupply();
        if (type_ > CONTROLLED_MINT ||
            !(decimals_ == 6 || decimals_ == 8 || decimals_ == 18) ||
            (type_ != CONTROLLED_MINT &&
             (minter_ != address(0) || lifetimeCapBaseUnits != initialSupplyBaseUnits)) ||
            (type_ == CONTROLLED_MINT && minter_ == address(0)))
            revert InvalidTokenConfiguration();

        token = address(new XITACreatorERC20(
            name_, symbol_, initialSupplyBaseUnits, owner_, type_, decimals_,
            lifetimeCapBaseUnits, permitEnabled_, minter_
        ));
        emit TokenCreated(msg.sender, token, owner_, name_, symbol_, initialSupplyBaseUnits);
        emit TokenConfigured(
            token, type_, decimals_, lifetimeCapBaseUnits,
            permitEnabled_, minter_, token.codehash
        );
    }
}
