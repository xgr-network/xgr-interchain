# XETA v3.1.4 architecture

XGRChain is the mandatory hub between external EVM networks. Each bridge hop uses an on-source canonical ILNGateway bound to one route-specific Warp Router, a source local ILN Registry, and a route FeeVault. The route must be quorum-activated. The outbound Warp Router must refuse direct external transferRemote calls; inbound Hyperlane Mailbox handling remains per upstream security model.

The destination ISM verifies signed message-specific BLS quorum, exact source route and source router, authorized messageId, proof and current destination validator set. Any executor can deliver the original message independently of XGR's optional relayer. Validator changes may require new authorization for the ORIGINAL message, never new lock/burn, and destination Mailbox replay protection remains mandatory.

Validator fees remain positive, source-native, allocated exactly once and claimed by validators. Promotional fee refunds are offchain optional UI/backend operations after verified transfers. User pays chain network gas. Future XGR hub sponsor and automated hop-2 forwarder are separate work, no change to frozen xgr-node v3.1.4 expected.

Only audited token contracts and safe routers are suitable for public onboarding. Never disable an asset route for inactivity. See docs/XETA_SPEC_V314.md and docs/XETA_ONBOARDING.md.
