# XITA Direct-BLS — independent security audit v1.0.0

**Audit ID:** `XITA-DBLS-2026-10-24-v1.0.0`  
**Audit date:** 2026-10-24; frozen snapshot: `2026-10-24T15:27:42Z`  
**Reviewer:** GPT-6, independent AI-assisted source, integration and on-chain security assessment; **not** a human third-party security certification.  
**Architecture:** Direct BLS per message (no Merkle-tree checkpoint mechanism in the active transfer path).  
**Disclosure:** REDACTED_PUBLIC; full original PDF and reproduction evidence remain access-controlled.  
**Outcome:** 0 Critical / 1 High / 6 Medium / 7 Low / 3 Informational. **No unconditional mainnet security sign-off.**

## Immutable source baseline

| Component | In-scope branch | Audited exact commit |
| --- | --- | --- |
| Solidity, relayer, wallet, admin, indexer | [xgr-network/xgr-interchain](https://github.com/xgr-network/xgr-interchain) / `main` | [`ccef5cd429bf8ad8cb63bd5778c1fae7aaf185cc`](https://github.com/xgr-network/xgr-interchain/tree/ccef5cd429bf8ad8cb63bd5778c1fae7aaf185cc) |
| Node interchain, direct BLS, validator RPC, resource isolation | [xgr-network/xgr-node](https://github.com/xgr-network/xgr-node) / `XGR3.0` | [`6f5e36b8147eae6275c2fefaadec7aa8488dc674`](https://github.com/xgr-network/xgr-node/tree/6f5e36b8147eae6275c2fefaadec7aa8488dc674) |
| Published node release | [`v3.3.2`](https://github.com/xgr-network/xgr-node/releases/tag/v3.3.2) | Same audited Node source commit; installed mainnet binary identity **not authenticated** |

`xgr-network/xgrchain` branch `PoS_3` **is explicitly excluded** from code review and findings. XGRChain itself (chain ID 1643) remains an in-scope on-chain network for cross-chain and deployment verification.

The codebase may advance after this freeze. New commits do not retroactively change this audit; follow-up checks must cite their own exact commits.

## Versioned documents

- [report.md](./report.md) — **public, disclosure-safe summary of the one full audit**, not a replacement for the confidential original report.
- [remediation.md](./remediation.md) — all 17 original finding IDs, initial disposition and prospective verification criteria.
- [verification.md](./verification.md) — performed test matrix, chain/runtime provenance, unperformed scenarios and subsequent release gates.
- [evidence/README.md](./evidence/README.md) — original artifact identities, checksums and restricted-evidence custody.

## Original immutable artifacts (held outside public GitHub)

| Original artifact | SHA-256 |
| --- | --- |
| `XITA_Direct_BLS_Security_Audit_2026-10-24.pdf` (29 pages) | `6a1423bd937eb261adf2b0da15085f7cb09dcb8ba82d16e2ea3e48e64d8ebab4` |
| `XITA_Audit_Evidence_2026-10-24.zip` (67 evidence entries) | `66dbc0551b4602686903b650eeda36ab090a2eac22d29de39f8d1b0290d4ded2` |

These SHA-256 commitments identify the **complete original report and its evidence**, which must not be altered to reflect later fixes. A reader of this public repository cannot obtain the private original merely from these hashes. Subsequent finding-state changes go only in the registers.

## Disclosure and maintenance policy

This is a **new full Direct-BLS audit**, not a delta audit or reuse of earlier Merkle-based findings. No mainnet transactions were submitted by the auditor, and no production changes were made as part of the audit. Confirmed code/deployment evidence is distinct from hypotheses, accepted architectural constraints and independent runtime validation.

Use [SECURITY.md](../../SECURITY.md) for confidential vulnerability reporting. Do not merge sensitive PoC material into this public folder before coordinated disclosure.
