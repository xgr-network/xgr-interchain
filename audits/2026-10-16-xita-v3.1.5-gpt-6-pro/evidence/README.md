# Audit evidence handling

The original 2026-10-16 audit includes reproducible interface checks, logs and selected source snapshots. Those materials are not committed to this public directory while remediations are unfinished.

After fix verification and coordinated disclosure, store **sanitized, non-secret** evidence here with its creation date, command, input commit(s), output, and checksum. Prefer concise text logs and redacted JSON over arbitrary binary artifacts. Do not include node private keys, wallet keys, environment secrets, authentication headers, private RPC credentials or personally identifying operational data.

Until publication, use an access-controlled original report/evidence bundle and track changes in `../remediation.md`. Never silently overwrite either the original report or captured test output.
