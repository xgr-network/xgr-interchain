# Interchain operator admin (read-only MVP)

This is a local-only HTTP application for `/admin/`, initially targeting XGRChain (1643) and Base (8453). It reads the current desired manifest and the deterministic 20-step deployment plan. The RPC preflight checks chain identity and bytecode existence of the observed Mailbox and MerkleTreeHook. These are **not** cryptographic verification, completed deployment, or mainnet readiness.

Run from the repository root with `node services/admin/server.mjs` (Node.js 20+). Defaults: `127.0.0.1:4087`; optionally set `XGR_ADMIN_PORT`.

Expose **only via a separately configured nginx reverse proxy** at `/admin/` with Basic Authentication, TLS, and access restrictions. Do not expose the local port on the public interface. Configure nginx so that **all** `/admin/` paths (including API and static assets) require authentication. Set `Cache-Control: no-store`. Basic Auth is an additional access layer, not an authorization system for spending funds.

No POST API, deployment executor, key management, transaction broadcast, governance override, editable inventory or durable job persistence exists in this MVP. The displayed `forge script` commands are **templates**, not safe to execute without supplying verified contract-specific environment variables, unlocked hardware/server wallet authentication, valid receipt verification and step-specific review. The actual automated deployment orchestrator and all signing remain to be implemented.

The existing XGR Explorer is unaffected. Do not start route governance or deploy contracts from this read-only console.
