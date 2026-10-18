# Mainnet transfer evidence: XGRChain → Base (native XGR → wXGR)

**Evidence recorded:** 2026-10-18. **Classification:** forward-direction mainnet cross-chain transfer evidenced on the source chain and by an operator-supplied third-party BaseScan token-holder screenshot. **Destination transfer receipt and on-chain mint logs not yet independently verified.** This is not a full reverse-direction roundtrip or validator-rotation test.

## Canonical identifiers

| Field | Value |
| --- | --- |
| Source chain | XGRChain mainnet, chainId/domain `1643` |
| Destination chain | Base mainnet, chainId/domain `8453` |
| Source transaction | [`0x67ef60330510e845b312553aa3cb7fc31740f12ac986a371cbdbf9f3f9a3e036`](https://explorer.xgr.network/tx/0x67ef60330510e845b312553aa3cb7fc31740f12ac986a371cbdbf9f3f9a3e036) |
| Source block | `11681316` |
| Source receipt status | `1` (successful) |
| Source wallet | `0x6a6415Aa1c945Ee437336c136c2de9E8baB1F05E` |
| Source gateway TX recipient | `0x6C34BB6D69322De6a2a9296B26CF4Fb37a11DBe8` |
| Source requested native XGR lock | `1000000000000000000` Wei = **1 XGR** |
| Interchain validator fee | `100000000000000000` Wei = **0.1 XGR**, consistent with operator UI and source receipt logs |
| Source transaction value | `1100000000000000000` Wei = **1.1 XGR**, before network gas |
| Source gas used | `362255` |
| Source gas effective price | `1000000000000` Wei |
| Source message ID | `0x05744f4d474b1dcd7b3205fc2dee2e10a66d00725cb44485fe9f260e58ff57ab` |
| Base mailbox listed in repo | `0xd3389684b69f80f7a281569b64a2e47872f74add` (repository inventory, not receipt evidence) |
| Base wrapped-token contract | [`0x2ca97eff807744f81f13c59a75a8eb0add1c715d`](https://basescan.org/token/0x2ca97eff807744f81f13c59a75a8eb0add1c715d) — exactly matches the `syntheticRouter` address documented in `apps/web/catalog.json` and the address encoded in the source Mailbox message |
| BaseScan token page shown by operator | `Wrapped XGR (wXGR)`, ERC-20, 18 decimals; total supply **1 wXGR**, **1 holder** |
| BaseScan reported token holder | `0x6a6415Aa1c945Ee437336c136c2de9E8baB1F05E`, balance **1.0000 wXGR** (100% of screenshot supply), matches source sender and target recipient |

## Independently confirmed

1. XGRChain mainnet Explorer and live transaction evidence agree that the source transaction succeeded in block `11681316`.
2. The source transaction's calldata encodes domain `8453`, the wallet as recipient and `1e18` native XGR as the requested bridge amount.
3. The successful source receipt contains the message ID in emitted logs (including topics at index 2 and index 6), independently matching the operator's XITA transfer record.
4. The source receipt includes a 1 XGR amount event and interchain validator fee evidence for 0.1 XGR. Distinguish this **interchain** fee from unrelated XGRChain block gas/validator fee accounting fields.

## Base destination token evidence — screenshot supplied by operator (2026-10-18)

The operator supplied a screenshot of the public BaseScan token page showing **Wrapped XGR (wXGR)**, contract `0x2ca97eff807744f81f13c59a75a8eb0add1c715d` with **18 decimals**. The token overview reports **max total supply 1 wXGR**, exactly **one holder**, and the holder table shows the same wallet `0x6a6415Aa1c945Ee437336c136c2de9E8baB1F05E` holding **1.0000 wXGR (100%)**. That matches the source-chain lock amount, the recipient in the source message and the documented XITA Base `syntheticRouter` contract address.

This adds *explorer-presented destination state evidence*, beyond an XITA UI delivery report. The underlying BaseScan page could not be queried live by the review tool and no Base mint transaction hash was supplied: preserve the distinction between **user-provided external explorer screenshot** and **independently decoded destination transaction receipt**. The screenshot is not a cryptographic proof linking a specific `Mailbox.process` call to the mint.

## Operator-reported delivery status

The user copied the XITA transfer UI state:

> **XGR · xgrchain → base — Delivered**  
> The target Mailbox confirms that the message was delivered.

The delivery status plus the independent-explorer screenshot are consistent with a successful forward lock/mint; nevertheless, the Base `Mailbox.delivered(messageId)` value, successful destination `process()` receipt and token `Transfer(address(0), wallet, 1e18)` mint event have not been extracted from Base chain data during this review.

## Not yet proven by this evidence

- Base destination transaction hash, successful `Mailbox.process` transaction receipt, and independently queried `delivered(messageId)=true`.
- ERC-20 `Transfer(address(0), recipient, 1e18)` mint event in a confirmed Base receipt; exact balance change from pre-mint to post-mint. Current token address and a **1 wXGR holder balance in BaseScan screenshot are established**.
- Reverse Base → XGRChain `burn/unlock` transaction and complete roundtrip.
- Validator rotation, re-attestation of an in-flight message, recovery after relayer outage or replay protection under live conditions.
- Admission of a fresh interchain validator under Registry V3 (audit A-02).

**Audit disposition:** Forward XGRChain → Base lock/mint is **supported by source receipt + BaseScan token-holder screenshot + operator's Delivered report**. Mark forward-direction user-visible result **OBSERVED**; do not mark transaction-level destination `process()/mint` proof **VERIFIED** until a Base receipt and Mint Transfer log are independently checked. A-01 recovery, validator rotation and reverse-direction roundtrip remain **PENDING**. No full audit sign-off.
