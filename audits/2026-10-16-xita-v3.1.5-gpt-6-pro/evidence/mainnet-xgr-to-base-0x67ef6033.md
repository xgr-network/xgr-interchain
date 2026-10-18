# Mainnet transfer evidence: XGRChain → Base (native XGR → wXGR)

**Evidence recorded:** 2026-10-18. **Classification:** mainnet forward-direction smoke-test evidence, **partial end-to-end verification**. This is an observed on-chain source transaction and an operator-provided destination UI statement, *not* a fully independently verified Base mint/roundtrip.

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

## Independently confirmed

1. XGRChain mainnet Explorer and live transaction evidence agree that the source transaction succeeded in block `11681316`.
2. The source transaction's calldata encodes domain `8453`, the wallet as recipient and `1e18` native XGR as the requested bridge amount.
3. The successful source receipt contains the message ID in emitted logs (including topics at index 2 and index 6), independently matching the operator's XITA transfer record.
4. The source receipt includes a 1 XGR amount event and interchain validator fee evidence for 0.1 XGR. Distinguish this **interchain** fee from unrelated XGRChain block gas/validator fee accounting fields.

## Operator-reported destination result

The user copied the XITA transfer UI state:

> **XGR · xgrchain → base — Delivered**  
> The target Mailbox confirms that the message was delivered.

That UI observation is meaningful for delivery progress, but it is **not** equivalent to independently retrieving the Base `Mailbox.delivered(messageId)` value, a successful destination `process()` receipt, a wXGR `Transfer(0x0, wallet, 1e18)` mint log and the resulting `balanceOf`.

## Not yet proven by this evidence

- Base destination transaction hash, successful `Mailbox.process` transaction receipt, and independently queried `delivered(messageId)=true`.
- Base wrapped-XGR ERC-20 contract address, actual mint log and wallet balance delta.
- Reverse Base → XGRChain `burn/unlock` transaction and complete roundtrip.
- Validator rotation, re-attestation of an in-flight message, recovery after relayer outage or replay protection under live conditions.
- Admission of a fresh interchain validator under Registry V3 (audit A-02).

**Audit disposition:** Keep A-01 recovery and cross-chain rotation gate **PENDING**. This real source-chain lock/message is useful independent smoke-test evidence for the forward path, and the operator's delivered state should be recorded separately as **REPORTED_DELIVERED** pending a Base receipt. No assertion of full end-to-end mint, complete roundtrip or audit sign-off.
