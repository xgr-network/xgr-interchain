# Mainnet transfer evidence: XGRChain → Base (native XGR → wXGR)

**Evidence recorded:** 2026-10-18. **Classification:** successful source-chain lock/message confirmed by XGRChain RPC plus BaseScan screenshots showing (a) 1 wXGR held by the source wallet and (b) a successful Base transaction with an ERC-20 mint/Transfer from the zero address of 1 wXGR to the same wallet. **Base receipt logs have not been independently retrieved via RPC, nor has the destination mint transaction been cryptographically tied to the specific XGRChain messageId.** This is not a reverse roundtrip or validator-rotation test.

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
| Base mint transaction (BaseScan screenshot) | [`0xabae3fa63e6dc4be09910c8fb00c57b784bd8a1e983cf9ea67bac0bee7b659db`](https://basescan.org/tx/0xabae3fa63e6dc4be09910c8fb00c57b784bd8a1e983cf9ea67bac0bee7b659db) |
| Base mint TX state | **Success**, block `52767651`, displayed timestamp `2026-10-18 11:57:29 UTC` (BaseScan screenshot) |
| Base mint event shown | ERC-20 Transfer **from Null / zero address** to `0x6a6415Aa1c945Ee437336c136c2de9E8baB1F05E` of **1 Wrapped XGR (wXGR)** |
| Base TX externally sent by / interacted with | Sender: original wallet; `To`: MetaMask Delegation Manager `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` according to BaseScan screenshot; this address is **not** asserted to be the Mailbox |
| Base mint TX receipt logs | BaseScan UI reports `Logs (5)`; individual raw event addresses/topics/data **not** decoded in this review |

## Independently confirmed

1. XGRChain mainnet Explorer and live transaction evidence agree that the source transaction succeeded in block `11681316`.
2. The source transaction's calldata encodes domain `8453`, the wallet as recipient and `1e18` native XGR as the requested bridge amount.
3. The successful source receipt contains the message ID in emitted logs (including topics at index 2 and index 6), independently matching the operator's XITA transfer record.
4. The source receipt includes a 1 XGR amount event and interchain validator fee evidence for 0.1 XGR. Distinguish this **interchain** fee from unrelated XGRChain block gas/validator fee accounting fields.

## Base destination token evidence — screenshot supplied by operator (2026-10-18)

The operator supplied a screenshot of the public BaseScan token page showing **Wrapped XGR (wXGR)**, contract `0x2ca97eff807744f81f13c59a75a8eb0add1c715d` with **18 decimals**. The token overview reports **max total supply 1 wXGR**, exactly **one holder**, and the holder table shows the same wallet `0x6a6415Aa1c945Ee437336c136c2de9E8baB1F05E` holding **1.0000 wXGR (100%)**. That matches the source-chain lock amount, the recipient in the source message and the documented XITA Base `syntheticRouter` contract address.

This provides explorer-presented destination state evidence beyond an XITA UI delivery report. The operator additionally supplied the **successful Base Mint transaction screenshot** with its full transaction hash. BaseScan's transaction overview shows an ERC-20 `Transfer` **from the zero address** of **1 wXGR** to the original wallet. The screenshot displays block `52767651`, date/time `2026-10-18 11:57:29 UTC`, and a five-log transaction. These are **externally presented explorer observations**, not independently decoded raw `eth_getTransactionReceipt` data. Direct BaseScan and Blockscout URL fetching and Base RPC access were unavailable during this review. The screenshot alone cannot prove which `Mailbox.process` message triggered the mint, so keep `messageId` attribution at the UI/receipt-correlation level pending raw logs.

## Operator-reported delivery status

The user copied the XITA transfer UI state:

> **XGR · xgrchain → base — Delivered**  
> The target Mailbox confirms that the message was delivered.

The XITA delivered status plus the two BaseScan screenshots demonstrate the user-visible forward lock/mint result, including a success-status destination transaction with a displayed ERC-20 mint. Nevertheless, `Mailbox.delivered(messageId)`, the actual `process()` transaction receipt and the full raw token `Transfer(address(0),wallet,1e18)` topics/data have not been independently extracted from Base RPC by this review.

## Not yet proven by this evidence

- Independent Base-RPC retrieval of the **known destination mint transaction hash** receipt (`0xabae3fa63e6dc4be09910c8fb00c57b784bd8a1e983cf9ea67bac0bee7b659db`), decoding the five logs including token address, zero-address mint Transfer and indexed recipient, and validating successful execution.
- Determination whether the displayed mint receipt or another linked transaction executed `Mailbox.process()`; independent `Mailbox.delivered(messageId)=true` and proof-level correlation with source messageId.
- Historical pre-mint/post-mint `balanceOf` delta. Current token address, **1 wXGR holder balance** and **mint event shown in successful BaseScan TX screenshot** are established.
- Reverse Base → XGRChain `burn/unlock` transaction and complete roundtrip.
- Validator rotation, re-attestation of an in-flight message, recovery after relayer outage or replay protection under live conditions.
- Admission of a fresh interchain validator under Registry V3 (audit A-02).

**Audit disposition:** Forward XGRChain → Base lock/mint is **observed successful** using a verified XGRChain source receipt, operator-provided XITA `Delivered`, and **two BaseScan screenshots including a successful zero-address mint of 1 wXGR in a concrete Base transaction**. Mark **FORWARD_LOCK_MINT_OBSERVED**. Independent Base raw receipt validation and cross-message ID provenance remain **PENDING**; A-01 recovery, A-02 new-validator admission, validator rotation and reverse-direction roundtrip remain **PENDING**. This evidence alone is not comprehensive audit sign-off.
