// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stateless secp256k1 quorum verifier for XITA ECDSA destinations.
/// @dev Signatures are 65-byte (r,s,v) entries in selected validator order.
///      Bits are little-endian within bitmap bytes, as in the BLS registry.
contract XGRInterchainECDSAVerifier {
    uint256 public constant MAX_VALIDATORS = 64;
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    function recover(bytes32 digest, bytes calldata signature)
        external pure returns (address)
    {
        return _recover(digest, signature);
    }

    function verify(
        bytes calldata payload,
        address[] calldata validators,
        bytes calldata signerBitmap,
        bytes calldata signatures
    ) external pure returns (bool) {
        uint256 n = validators.length;
        if (n == 0 || n > MAX_VALIDATORS || signerBitmap.length != (n + 7) / 8)
            return false;
        uint256 selected;
        for (uint256 i; i < signerBitmap.length * 8; ++i) {
            if (!_selected(signerBitmap, i)) continue;
            if (i >= n) return false; // noncanonical high bits
            ++selected;
        }
        if (selected < (2 * n + 2) / 3 || signatures.length != selected * 65)
            return false;
        bytes32 digest = keccak256(payload);
        uint256 offset;
        for (uint256 i; i < n; ++i) {
            if (!_selected(signerBitmap, i)) continue;
            if (validators[i] == address(0) ||
                _recover(digest, signatures[offset:offset + 65]) != validators[i])
                return false;
            offset += 65;
        }
        return offset == signatures.length;
    }

    function _selected(bytes calldata bitmap, uint256 index)
        internal pure returns (bool)
    {
        return (uint8(bitmap[index >> 3]) & (uint8(1) << uint8(index & 7))) != 0;
    }

    /// @dev No eth_sign prefix: the *payload* supplies a strict domain separator.
    ///      Do not expose this as a generic signing endpoint on validator nodes.
    function _recover(bytes32 digest, bytes calldata signature)
        internal pure returns (address)
    {
        if (signature.length != 65) return address(0);
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (r == bytes32(0) || s == bytes32(0) ||
            uint256(s) > SECP256K1_HALF_ORDER || (v != 27 && v != 28))
            return address(0);
        return ecrecover(digest, v, r, s);
    }
}
