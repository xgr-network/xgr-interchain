# XITA GitHub-controlled listing state machine

GitHub is the source of truth for **directory publication**. No RPC indexer,
database, UI job, CoinGecko response or app operator may change listing state
outside a reviewed GitHub state transition.

| Phase | Authoritative evidence | Token detail | Tokens/Search/Universe |
|---|---|---|---|
| pending_review | Open Alliance onboarding PR | No public page | Hidden |
| rejected | Closed, unmerged onboarding PR | No public page | Hidden |
| accepted | Merged onboarding PR + config/assets/<TOKEN>/listing.json | Direct-link | Hidden |
| public | Approved GitHub state commit, validated finalized transfer and pricing proof | Direct-link | Visible |

XGRChain is always visible as the configured network hub, but native XGR is **not** exempt from token publication gates. Its listing remains `accepted` / direct-link-only until independent proof of a finalized, successful XITA v3.1.5 bridge transfer is verified through the normal reviewed GitHub publication process. Planned wrapped representations on spokes are not public tokens.

**Submission:** A valid onboarding PR adds the asset config, route intentions,
unactivated deployment inventory, listing.json with status=accepted, and
generated catalog.json. PR authors do not get approval to deploy contracts;
deployment is the separate wallet-controlled permissionless service.

**Publication:** Once at least one directed route has valid deployment
receipts, on-chain security activation and a finalized successful transfer
to its destination, and an independently fetched valid CoinGecko mapping, a
future verification worker can propose a GitHub PR changing ONLY listing
state and evidence. It cannot publish directly by writing a database row.
CI must verify the signed finality/receipt evidence, journey correlation,
route activation and proof chain IDs, and the new main commit must
atomically carry public status. Search and Universe must read this status.

**Current fail-closed boundary:** The receipt verifier and authenticated
GitHub transition bot do not yet exist. The manifest validator therefore
rejects *all new external public status values*; only accepted remains
permitted until those gates are built. A hex-looking transaction hash is
not a sufficient proof. Do not relax this without end-to-end tests.

**Practical distinction:** GitHub is canonical for publication, but the
blockchain is canonical for factual transfers and security activation.
A successful chain event alone does not modify the directory state.
