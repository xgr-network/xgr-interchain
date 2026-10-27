# Verification and provenance - r1

Application baselines: Interchain 26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3; node 51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671. Public configuration: XGR 70af62db9fe9c197e2e755dae7919baf313a13ca.

Correction work: read canonical genesis through the GitHub connector; recover and hash-check the original protected Phase A; recompute 19-block parity from retained observations; read current Mainnet head through MCP; generate/render the correction PDF; verify ZIP integrity and artifact hashes. No production mutation occurred.

The ZIP retains exact original native commands/timestamps/counts and service totals. These are original delta executions, not fresh r1 runs. Counts include nested tests; passing negative checks can demonstrate defects. Original failures are disclosed, not silently reclassified. Reproduction harnesses remain access-controlled.

Direct RPC renewal failed at DNS resolution. Recoverable successful observations are rpc and rpc1, not rpc2. Published genesis is not every host's effective configuration. No complete fresh Mainnet replay, installed-validator disk hashes, production DB audit or live wallet transfer is claimed.

Evidence references E1-E7 in report.md are paths inside evidence-public.zip. Its MANIFEST is also published separately. Run python verify_artifacts.py from this directory after checkout to verify actual bytes and ZIP integrity. Retained baseline files and Phase A freeze are identified by Git object SHA where local SHA-256 was not recovered.

Publication verification must distinguish Git object metadata from exact downloaded-byte verification. The documentation PR records the merge result and the readback actually performed; an upload response or filename alone is not asserted to be an exact-byte comparison.
