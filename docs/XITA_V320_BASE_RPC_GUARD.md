# v3.2.0 Base RPC guard - no node release

This XITA-only service is an optional loopback JSON-RPC guard for the
high-frequency Base RPC requests produced by XGR-Node v3.2.0.
It does not modify XGR consensus, current validator binaries,
contracts, Merkle data or the pending transfer.

## Prerequisites
- CI green and code merged to XITA main, then run ./manage.sh update.
- Node.js 20+ and a known Base RPC upstream (default mainnet.base.org).
- Confirm that the other PoS validators are healthy before restarting
  any one validator.

## Install

    cd ~/repos/xgr-interchain
    node --test services/rpc-guard/server.test.mjs
    sudo install -m 0644 services/rpc-guard/xita-base-rpc-guard.service.example /etc/systemd/system/xita-base-rpc-guard.service
    sudo systemctl daemon-reload
    sudo systemctl enable --now xita-base-rpc-guard.service
    curl -fsS http://127.0.0.1:4093/health | jq .
    curl -fsS http://127.0.0.1:4093/ -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | jq .

After confirming chain ID 0x2105, point only the existing Base
endpoint in /etc/xgrchain/node.conf at the local guard:

    XGR_INTERCHAIN_BASE_RPC=http://127.0.0.1:4093

Restart only the affected validator. To roll back, restore its previous
XGR_INTERCHAIN_BASE_RPC and restart only that validator.

Optionally set XITA_BASE_RPC_UPSTREAM to your dedicated provider
in /etc/xita/base-rpc-guard.env before restarting the guard.

## Safety

The guard binds to 127.0.0.1:4093, serializes outbound requests and
limits to 2 RPC/s by default. It coalesces identical in-flight reads;
caches eth_chainId for 24h, eth_blockNumber for 5s, latest eth_call for
3s, confirmed historical calls and logs for 30 minutes when
the requested block is at least 12 blocks behind observed source head.
It caches neither errors nor unconfirmed logs. Writes using
eth_sendRawTransaction are NEVER retried on timeout or rate limit;
the guard cannot silently double-broadcast a signed transaction.

Check /metrics for rate-limit, error, cache hit, and queue counters.
It does not provide unavailable archive data or repair independent
XGRChain historical execution/header failures. This is an operational
mitigation; a future Node improvement should decouple external RPC
polling from the 2-second internal worker tick.

Following restart, validate xgr_getILNIndexerStatus (base to xgr):
state ok, leaves 1, localLeaves 1, lagLeaves 0.
Do not reset the 0.5 wXGR transfer or repeat Lock/Burn.
