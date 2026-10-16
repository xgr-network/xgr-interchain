# Independent on-chain XITA roundtrip reconstruction

Read-only tool to independently verify source receipts, Gateway operations,
Mailbox Dispatch messages and destination Mailbox.delivered status.
No relayer DB or operator wallet/private key is used.

Forward receipt audit:

    node tools/verify-xita-roundtrip.mjs xgrchain <SOURCE_TX>

Full roundtrip audit:

    node tools/verify-xita-roundtrip.mjs xgrchain <SOURCE_TX> base <RETURN_SOURCE_TX>

Both source receipts and destination deliveries must be independently
confirmed to report ROUNDTRIP_DELIVERED. Unknown means unknown, never success.
Repeat after a service restart to verify reconstruction works.

Base chain RPCs are declared in config/chains/base/chain.json with a qualified
primary and same-provider backup. Private server-only credentials may be set
with XITA_BASE_ARCHIVE_RPC_URLS but must never go into public catalog or Git.
