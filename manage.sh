#!/usr/bin/env bash
# XITA admin + website management; NEVER controls XGRChain or ILN relayers.
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ADMIN_SERVICE="xita-admin.service"
SITE_DIR="/var/www/xita"
CATALOG_DIR="$SITE_DIR/data"
ADMIN_URL="http://127.0.0.1:${XGR_ADMIN_PORT:-4087}"

usage() {
  cat <<'HELP'
XITA Admin / website management
Usage: ./manage.sh <command>

  status        Admin service, Git revision and website publication
  start         Start xita-admin.service
  stop          Stop xita-admin.service
  restart       Restart ONLY xita-admin.service
  logs          Show last 100 admin service log lines
  follow        Follow admin service logs (Ctrl+C to exit)
  health        Check the GitHub-main workqueue API
  check         Validate current local manifests, UI and admin code
  check-routes  Read-only live contract/fee/router audit for catalog routes (optional --asset --source --destination)
  publish-web   Publish static apps/web and restart the admin
  update        Pull GitHub main, validate, publish web, restart admin
  install-sync  Install one-shot GitHub deployment receipt auto-sync service
  install-transfer-api  Install read-only unsigned destination recovery endpoint and Nginx proxy
  init-merkle   Bootstrap and verify an XGR v3.2.0 validator Merkle replica (requires --chain and --data-dir)
  install-transfer-intake  Install restricted staging service for unverified broadcast TX hashes
  install-tvl  Install read-only generic escrow TVL and gross 24h evidence worker (preconfigured credentials required)
  install-fee-preview  Install read-only unsigned transfer fee preview (no keys, no sponsor timers)
  install-interchain-fee  Install verified quote service, five-minute claim/sponsor timers, and HTTPS API routes
  deploy        Backward-compatible alias for publish-web (WEB ONLY)
  help          Show this help

No command deploys blockchain contracts, restarts validators or changes relayers.
Contract deployments happen only through the verified Admin UI workflow.
HELP
}

privileged() {
  if (( EUID == 0 )); then "$@"; else sudo "$@"; fi
}

require_clean_main() {
  local branch state
  branch="$(git -C "$ROOT" symbolic-ref --quiet --short HEAD)" || {
    echo "ERROR: repository is in detached HEAD state." >&2
    return 1
  }
  if [[ "$branch" != "main" ]]; then
    echo "ERROR: checkout main before publishing; current branch: $branch" >&2
    return 1
  fi
  state="$(git -C "$ROOT" status --porcelain --untracked-files=no)"
  if [[ -n "$state" ]]; then
    echo "ERROR: tracked files have local changes; refusing to publish/update." >&2
    printf '%s\n' "$state" >&2
    return 1
  fi
}

check() {
  (
    cd "$ROOT"
    echo "Checking XITA manifests, web and admin ..."
    node tools/validate-manifests.mjs
    node tools/build-xeta-web-catalog.mjs --check
    node --test services/indexer/tvl-verifier.test.mjs services/indexer/escrow-flow-24h.test.mjs services/indexer/transfer-intake.test.mjs services/indexer/transfer-announcements.test.mjs apps/web/legal.test.mjs apps/web/keccak.test.mjs apps/web/experience.test.mjs apps/web/wallet-transfers.test.mjs apps/web/wallet-pending.test.mjs apps/web/transfer-actions.test.mjs apps/web/wallet-nonce.test.mjs apps/web/transfer-page.test.mjs apps/web/leaderboard-data.test.mjs services/indexer/server.test.mjs services/indexer/route-readiness.test.mjs services/indexer/transfer-recovery.test.mjs services/indexer/transfer-index.test.mjs services/indexer/transfer-index-store.test.mjs services/onboarding/manifests.test.mjs services/onboarding/coingecko-identity.test.mjs services/onboarding/private-store.test.mjs services/onboarding/status-notifier.test.mjs services/onboarding/server.test.mjs tools/validate-join-pr.test.mjs
    node --test tools/transfer-intake-nginx.test.mjs tools/manage-web-release.test.mjs tools/transfer-recovery-nginx.test.mjs tools/interchain-fee-nginx.test.mjs
    node --test services/admin/*.test.mjs
    node --check apps/web/app.js
    node --check apps/web/ui-data.js
    node --check services/admin/server.mjs
    node --check services/admin/admin.js
    node --check services/admin/wallet.js
    bash -n manage.sh
    echo "PASS: XITA validation."
  )
}

wait_admin() {
  local i
  for i in 1 2 3 4 5 6; do
    if curl -fsS --max-time 3 "$ADMIN_URL/admin/api/deployment-sync/status" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# systemd Type=simple confirms only that exec was started, not that Node has
# finished importing modules and bound its socket. Check real HTTP readiness;
# NEVER repeatedly restart a healthy service merely to win this race.
wait_xita_indexer() {
  local i
  for ((i=1; i<=20; i++)); do
    if curl --fail --silent --show-error --connect-timeout 1 --max-time 2 \
        http://127.0.0.1:4088/health >/dev/null 2>&1; then
      return 0
    fi
    if systemctl is-failed --quiet xita-indexer.service 2>/dev/null; then
      break
    fi
    sleep 1
  done
  echo "ERROR: XITA indexer did not become HTTP-ready on 127.0.0.1:4088." >&2
  echo "Indexer status and recent startup errors:" >&2
  privileged systemctl status xita-indexer.service --no-pager --lines=18 >&2 || true
  privileged journalctl -u xita-indexer.service -n 45 --no-pager >&2 || true
  return 1
}

prepare_solidity_runtime() {
  local forge_bin
  echo "Verifying complete pinned Solidity dependency tree ..."
  if ! node "$ROOT/services/admin/verify-solidity-runtime.mjs" "$ROOT"; then
    echo "Reinstalling incomplete pinned Solidity dependency tree ..."
    command -v npm >/dev/null || {
      echo "ERROR: npm is required to repair Solidity sources" >&2
      return 1
    }
    npm install --prefix "$ROOT/vendor" --ignore-scripts --no-audit --no-fund --package-lock=false --force
    node "$ROOT/services/admin/verify-solidity-runtime.mjs" "$ROOT" || {
      echo "ERROR: Solidity dependencies remain incomplete after repair" >&2
      return 1
    }
  fi
  echo "Building deployment artifacts before activating the Admin ..."
  forge_bin="$(node "$ROOT/services/admin/resolve-forge-cli.mjs")"
  (cd "$ROOT" && "$forge_bin" build --force --skip test script)
  node "$ROOT/services/admin/seal-build-cli.mjs" "$ROOT" "$("$forge_bin" --version)"
}


prepare_catalog_store() {
 local user group
 user="$(id -un)"; group="$(id -gn)"
 [[ "$user" != "root" ]] || { echo "Run manage.sh as checkout owner" >&2; return 1; }
 privileged install -d -m 0755 -o "$user" -g "$group" "$CATALOG_DIR"
 node "$ROOT/services/admin/deployment-auto-sync-cli.mjs" --publish-catalog
}

publish_web() {
  local sha release next
  require_clean_main
  check
  prepare_solidity_runtime
  sha="$(git -C "$ROOT" rev-parse --verify HEAD)"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || {
    echo "ERROR: invalid Git revision." >&2
    return 1
  }
  release="$SITE_DIR/releases/$sha"
  echo "Publishing XITA website from main: ${sha:0:12}"
  privileged install -d -m 755 "$SITE_DIR/releases" "$release"
  privileged cp -a "$ROOT/apps/web/." "$release/"
  privileged chmod -R a+rX "$release"
  prepare_catalog_store
  privileged rm -f "$release/catalog.json"
  privileged ln -s "$CATALOG_DIR/catalog.json" "$release/catalog.json"
  next="$SITE_DIR/.next-${sha:0:12}-$$"
  privileged ln -s "$release" "$next"
  privileged mv -Tf "$next" "$SITE_DIR/current"

  # The public website is static and independent from the operator Admin.
  # Never revert a successfully published release because a separate service
  # failed to restart or its optional health probe was temporarily unavailable.
  if ! privileged systemctl restart "$ADMIN_SERVICE"; then
    echo "WARNING: $ADMIN_SERVICE failed to restart; the new website remains published." >&2
    echo "Check: sudo journalctl -u $ADMIN_SERVICE -n 80 --no-pager" >&2
    privileged systemctl status "$ADMIN_SERVICE" --no-pager --lines=20 || true
  elif ! wait_admin; then
    echo "WARNING: $ADMIN_SERVICE did not answer its lightweight local health probe." >&2
    echo "The new website remains published; inspect the Admin service separately." >&2
    echo "Check: sudo journalctl -u $ADMIN_SERVICE -n 80 --no-pager" >&2
    privileged systemctl status "$ADMIN_SERVICE" --no-pager --lines=20 || true
  else
    echo "OK: $ADMIN_SERVICE restarted and answered its local health probe."
  fi
  echo "SUCCESS: website ${sha:0:12} published; release will not be rolled back for unrelated Admin failures."
}

status() {
  echo "Git branch: $(git -C "$ROOT" branch --show-current)"
  echo "Git revision: $(git -C "$ROOT" rev-parse --short=12 HEAD)"
  printf "Published web: "
  readlink -f "$SITE_DIR/current" || true
  if [[ -f "$SITE_DIR/current/index.html" ]]; then
    if grep -q 'href="/transfer" data-nav>Transfer Tokens' "$SITE_DIR/current/index.html"; then
      echo "Published navigation: Transfer Tokens (new UI)"
    else
      echo "WARNING: published static website is OLD (Plan a Route); run ./manage.sh update" >&2
    fi
  else
    echo "WARNING: published index.html is missing" >&2
  fi
  local live_html
  live_html="$(curl -fsS --max-time 8 -H 'Cache-Control: no-cache' \
    'https://xita.xgr.network/?xita-status=1' 2>/dev/null || true)"
  if [[ "$live_html" == *'href="/transfer" data-nav>Transfer Tokens'* ]]; then
    echo "HTTPS navigation: Transfer Tokens (new UI)"
  elif [[ -n "$live_html" ]]; then
    echo "WARNING: HTTPS website serves OLD or unexpected index.html; check active nginx root and caching" >&2
  else
    echo "WARNING: HTTPS website unavailable for navigation check" >&2
  fi
  echo "Admin service:"
  privileged systemctl status "$ADMIN_SERVICE" --no-pager --lines=12 || true
  printf "Admin API (/admin/api/plan): "
  curl -sS --max-time 5 -o /dev/null -w '%{http_code}\n' "$ADMIN_URL/admin/api/plan" || true
}

health() {
  echo "Checking $ADMIN_URL/admin/api/workqueue ..."
  if curl -fsS --max-time 10 "$ADMIN_URL/admin/api/workqueue" >/dev/null; then
    echo "OK: admin online and current GitHub main workqueue verified."
  else
    echo "ERROR: workqueue unavailable (service, GitHub or outdated checkout)." >&2
    return 1
  fi
}

install_sync() (
  local user group node_bin state_dir service_file path_file timer_service_file timer_file
  user="$(id -un)"
  group="$(id -gn)"
  node_bin="$(command -v node)"
  state_dir="${XGR_ADMIN_STATE_DIR:-$ROOT/runtime-state/admin}"
  [[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$group" =~ ^[a-z_][a-z0-9_-]*$ ]] || {
    echo "ERROR: unsupported service user/group" >&2
    return 1
  }
  [[ "$node_bin" == /* && "$ROOT" == /* && "$state_dir" == /* ]] || {
    echo "ERROR: only absolute sync paths supported" >&2
    return 1
  }
  [[ "$node_bin$ROOT$state_dir" != *'@'* && "$node_bin$ROOT$state_dir" != *'%'* ]] || {
    echo "ERROR: unsafe systemd path placeholder" >&2
    return 1
  }
  service_file="$(mktemp)"
  path_file="$(mktemp)"
  timer_file="$(mktemp)"
  timer_service_file="$(mktemp)"
  # EXIT cleanup is scoped to this subshell, not the parent update() call.
  trap 'rm -f "${service_file:-}" "${path_file:-}" "${timer_file:-}" "${timer_service_file:-}"' EXIT
  sed -e "s|@SYNC_USER@|$user|g" -e "s|@SYNC_GROUP@|$group|g" \
      -e "s|@ROOT@|$ROOT|g" -e "s|@STATE_DIR@|$state_dir|g" \
      -e "s|@NODE_BIN@|$node_bin|g" -e "s|@CATALOG_DIR@|$CATALOG_DIR|g" \
      "$ROOT/deploy/systemd/xita-deployment-sync.service.in" > "$service_file"
  sed -e "s|@STATE_DIR@|$state_dir|g" \
      "$ROOT/deploy/systemd/xita-deployment-sync.path.in" > "$path_file"
  sed -e "s|@SYNC_USER@|$user|g" -e "s|@SYNC_GROUP@|$group|g" \
      -e "s|@ROOT@|$ROOT|g" -e "s|@STATE_DIR@|$state_dir|g" \
      -e "s|@NODE_BIN@|$node_bin|g" -e "s|@CATALOG_DIR@|$CATALOG_DIR|g" \
      "$ROOT/deploy/systemd/xita-deployment-sync-poll.service.in" > "$timer_service_file"
  cp "$ROOT/deploy/systemd/xita-deployment-sync-poll.timer.in" "$timer_file"
  [[ "$(id -un)" != "root" ]] || { echo "Run as checkout owner" >&2; return 1; }
  mkdir -p "$state_dir"
  privileged install -m 0644 "$service_file" /etc/systemd/system/xita-deployment-sync.service
  privileged install -m 0644 "$path_file" /etc/systemd/system/xita-deployment-sync.path
  privileged install -m 0644 "$timer_service_file" /etc/systemd/system/xita-deployment-sync-poll.service
  privileged install -m 0644 "$timer_file" /etc/systemd/system/xita-deployment-sync-poll.timer
  privileged systemctl daemon-reload
  privileged systemctl enable --now xita-deployment-sync.path xita-deployment-sync-poll.timer
  echo "SUCCESS: receipt watcher and periodic recovery poll installed."
)

install_transfer_api() (
  require_clean_main
  [[ "$(id -un)" != "root" ]] || { echo "Run as repository checkout owner." >&2; return 1; }
  local user node_bin unit
  user="$(id -un)"
  node_bin="$(command -v node)"
  [[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$ROOT" == /* && "$node_bin" == /* ]] || {
    echo "Unsafe indexer service username, node path or checkout path" >&2
    return 1
  }
  echo "Installing read-only proof-builder dependencies (no private keys) ..."
  npm install --prefix "$ROOT/runtime/native-relayer" --ignore-scripts --no-audit --no-fund --package-lock=false
  npm install --prefix "$ROOT/services/indexer" --ignore-scripts --no-audit --no-fund --package-lock=false
  echo "Installing XITA public read-only indexer service ..."
  unit="$(mktemp)"
  trap 'rm -f "${unit:-}"' EXIT
  sed -e "s|^User=.*|User=$user|" \
      -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" \
      -e "s|^ExecStart=.*|ExecStart=$node_bin $ROOT/services/indexer/server.mjs|" \
      "$ROOT/services/indexer/xita-indexer.service.example" > "$unit"
  privileged install -m 0644 "$unit" /etc/systemd/system/xita-indexer.service
  privileged systemctl daemon-reload
  privileged systemctl enable --now xita-indexer.service
  privileged systemctl restart xita-indexer.service
  # A green 'systemctl is-active' does not mean the Node HTTP socket is ready.
  wait_xita_indexer || return 1
  echo "Installing exact-match nginx proxy for unsigned destination recovery ..."
  if [[ -n "${XITA_NGINX_SITE_CONF:-}" ]]; then
    privileged "$node_bin" "$ROOT/tools/install-transfer-recovery-nginx.mjs" "$XITA_NGINX_SITE_CONF"
  else
    privileged "$node_bin" "$ROOT/tools/install-transfer-recovery-nginx.mjs"
  fi
  echo "Verifying local proof builder (not just generic indexer health) ..."
  local local_health public_health
  if ! local_health="$(curl --fail --silent --show-error --max-time 10 \
      "http://127.0.0.1:4088/api/xeta/v1/transfer/health")"; then
    echo "ERROR: local transfer proof builder is not ready (port 4088)." >&2
    curl --silent --show-error --max-time 5 \
      "http://127.0.0.1:4088/api/xeta/v1/transfer/health" || true
    echo >&2
    return 1
  fi
  echo "$local_health"
  echo "Verifying the HTTPS Nginx transfer health route ..."
  if ! public_health="$(curl --fail --silent --show-error --max-time 10 \
      --resolve xita.xgr.network:443:127.0.0.1 \
      "https://xita.xgr.network/api/xeta/v1/transfer/health")"; then
    echo "ERROR: XITA HTTPS /transfer/health is not routed to the installed proof builder." >&2
    echo "Check the active xita.xgr.network vhost and its exact-match location." >&2
    return 1
  fi
  echo "$public_health"
  echo "SUCCESS: local proof builder and public HTTPS transfer health are ready. No wallet/private key was installed."
)


# Optional untrusted, unprivileged TX-hash intake service. This does NOT
# modify derived operation tables, source block cursors, or protocol execution.
# SQL 005 and three distinct DB-role grants are an operator prerequisite.
install_transfer_intake() (
  require_clean_main
  [[ "$(id -un)" != "root" ]] || { echo "Run as repository checkout owner." >&2; return 1; }
  local user node_bin unit
  user="$(id -un)"
  node_bin="$(command -v node)"
  [[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$ROOT" == /* && "$node_bin" == /* ]] || {
    echo "Unsafe XITA intake deployment context" >&2
    return 1
  }
  if ! privileged test -f /etc/xita/transfer-intake.env; then
    echo "ERROR: Provision restricted /etc/xita/transfer-intake.env AFTER SQL 005." >&2
    return 1
  fi
  npm install --prefix "$ROOT/services/indexer" --ignore-scripts --no-audit --no-fund --package-lock=false
  unit="$(mktemp)"
  trap 'rm -f "${unit:-}"' EXIT
  sed -e "s|^User=.*|User=$user|" \
      -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" \
      -e "s|^ExecStart=.*|ExecStart=$node_bin $ROOT/services/indexer/transfer-intake.mjs|" \
      "$ROOT/services/indexer/xita-transfer-intake.service.example" > "$unit"
  privileged install -m 0644 "$unit" /etc/systemd/system/xita-transfer-intake.service
  privileged systemctl daemon-reload
  privileged systemctl enable --now xita-transfer-intake.service
  privileged systemctl restart xita-transfer-intake.service
  privileged systemctl is-active xita-transfer-intake.service
  privileged env XITA_TRANSFER_INTAKE_NGINX=1 "$node_bin" \
    "$ROOT/tools/install-transfer-recovery-nginx.mjs" "${XITA_NGINX_SITE_CONF:-}"
  curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4089/health
  echo
  echo "SUCCESS: isolated, rate-limited untrusted TX intake installed. No wallet key or on-chain action."
)

# Enabled only after operator configures /etc/xita/interchain-fee.env
# and deploys the distinct per-chain ExecutionGateway contracts via Admin UI.
# A separate keyless read-only worker. Does not load interchain-fee.env,
# enable claim/sponsor timers or expose the signed quote RPC.
install_fee_preview() (
  require_clean_main
  [[ "$(id -un)" != "root" ]] || { echo "Run as checkout owner." >&2; return 1; }
  local user node_bin unit
  user="$(id -un)"
  node_bin="$(command -v node)"
  [[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$ROOT" == /* && "$node_bin" == /* ]] || {
    echo "Unsafe fee preview service path or user" >&2
    return 1
  }
  install_price_cache
  echo "Installing unsigned fee preview dependencies ..."
  npm install --prefix "$ROOT/services/managed-relay" --ignore-scripts --no-audit --no-fund --package-lock=false
  unit="$(mktemp)"
  trap 'rm -f "${unit:-}"' EXIT
  sed -e "s|^User=.*|User=$user|" \
      -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" \
      -e "s|^ExecStart=.*|ExecStart=$node_bin $ROOT/services/managed-relay/server.mjs|" \
      "$ROOT/services/managed-relay/xita-fee-preview.service.example" > "$unit"
  privileged install -m 0644 "$unit" /etc/systemd/system/xita-fee-preview.service
  privileged systemctl daemon-reload
  privileged systemctl enable --now xita-fee-preview.service
  privileged systemctl restart xita-fee-preview.service
  privileged systemctl is-active xita-fee-preview.service
  curl --fail --silent --show-error --max-time 6 \
    http://127.0.0.1:4093/api/xita/v1/managed/health
  echo
  # Validate that the running keyless instance CANNOT issue signed quotes.
  local signed_status
  signed_status="$(curl --silent --show-error --max-time 6 -o /dev/null -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' --data '{}' \
    http://127.0.0.1:4093/api/xita/v1/managed/quote)"
  [[ "$signed_status" == "403" ]] || {
    echo "ERROR: preview-only service did not reject signed quote endpoint (HTTP $signed_status)" >&2
    return 1
  }
  if [[ -n "${XITA_NGINX_SITE_CONF:-}" ]]; then
    privileged env XITA_INTERCHAIN_FEE_PREVIEW_NGINX=1 "$node_bin" \
      "$ROOT/tools/install-transfer-recovery-nginx.mjs" "$XITA_NGINX_SITE_CONF"
  else
    privileged env XITA_INTERCHAIN_FEE_PREVIEW_NGINX=1 "$node_bin" \
      "$ROOT/tools/install-transfer-recovery-nginx.mjs"
  fi
  echo "SUCCESS: unsigned public cost preview available on loopback 4093 and HTTPS. No fee wallet key, Claim worker, Sponsor worker or on-chain TX."
)

# Price data is refreshed by a keyless timer independently of requests/UI renders.
install_price_cache() (
  local user node_bin unit
  user="$(id -un)"; node_bin="$(command -v node)"
  [[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$ROOT" == /* && "$node_bin" == /* ]] || return 1
  privileged install -d -m 0700 -o "$user" -g "$(id -gn)" /var/lib/xita
  unit="$(mktemp)"
  trap 'rm -f "${unit:-}"' EXIT
  sed -e "s|^User=.*|User=$user|" -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" \
      -e "s|^ExecStart=.*|ExecStart=$node_bin $ROOT/services/managed-relay/price-refresh.mjs|" \
      "$ROOT/services/managed-relay/xita-price-refresh.service.example" > "$unit"
  privileged install -m 0644 "$unit" /etc/systemd/system/xita-price-refresh.service
  privileged install -m 0644 "$ROOT/services/managed-relay/xita-price-refresh.timer.example" \
      /etc/systemd/system/xita-price-refresh.timer
  privileged systemctl daemon-reload
  privileged systemctl enable --now xita-price-refresh.timer
  # Best effort initial refresh: cached quotes remain usable through outages.
  privileged systemctl start xita-price-refresh.service || \
    echo "WARNING: CoinGecko temporarily unavailable. Cached rates remain usable until their verified expiry." >&2
)

install_interchain_fee() (
  require_clean_main
  [[ "$(id -un)" != "root" ]] || { echo "Run as repository checkout owner." >&2; return 1; }
  local user node_bin unit service target
  user="$(id -un)"
  node_bin="$(command -v node)"
  [[ "$user" =~ ^[a-z_][a-z0-9_-]*$ && "$ROOT" == /* && "$node_bin" == /* ]] || {
    echo "Unsafe Interchain Fee service checkout path or operator account" >&2
    return 1
  }
  for service in /etc/xita/interchain-fee.env; do
    if ! privileged test -f "$service"; then
      echo "ERROR: Missing $service. Copy restricted example and enter keys ONLY on the server." >&2
      return 1
    fi
  done
  install_price_cache
  echo "Installing pinned Interchain Fee signer and sponsor dependencies ..."
  npm install --prefix "$ROOT/services/managed-relay" --ignore-scripts --no-audit --no-fund --package-lock=false

  unit="$(mktemp)"
  trap 'rm -f "${unit:-}"' EXIT
  for service in xita-interchain-fee-quote xita-interchain-fee-claim xita-gas-sponsor; do
    case "$service" in
      xita-interchain-fee-quote) target="xita-managed-quote" ;;
      *) target="$service" ;;
    esac
    sed -e "s|^User=.*|User=$user|" \
        -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" \
        -e "s|^ExecStart=.*|ExecStart=$node_bin $ROOT/services/managed-relay/server.mjs|" \
        "$ROOT/services/managed-relay/$target.service.example" > "$unit"
    if [[ "$service" != "xita-interchain-fee-quote" ]]; then
      # Same cross-service wallet flock guards native NONCE reservation.
      sed -e "s|^ExecStart=.*|ExecStart=/usr/bin/flock -n /run/lock/xita-fee-wallet.lock $node_bin $ROOT/services/managed-relay/$([[ "$service" == "xita-gas-sponsor" ]] && echo gas-sponsor || echo fee-claim).mjs|" \
          "$ROOT/services/managed-relay/$target.service.example" > "$unit"
      sed -i -e "s|^User=.*|User=$user|" \
        -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" "$unit"
    fi
    privileged install -m 0644 "$unit" "/etc/systemd/system/$service.service"
  done
  for service in xita-interchain-fee-claim xita-gas-sponsor; do
    privileged install -m 0644 "$ROOT/services/managed-relay/$service.timer.example" \
      "/etc/systemd/system/$service.timer"
  done
  privileged systemctl daemon-reload
  privileged systemctl enable --now xita-interchain-fee-quote.service
  privileged systemctl restart xita-interchain-fee-quote.service
  privileged systemctl is-active xita-interchain-fee-quote.service
  privileged systemctl enable --now xita-interchain-fee-claim.timer xita-gas-sponsor.timer
  if [[ -n "${XITA_NGINX_SITE_CONF:-}" ]]; then
    privileged env XITA_INTERCHAIN_FEE_NGINX=1 "$node_bin" \
      "$ROOT/tools/install-transfer-recovery-nginx.mjs" "$XITA_NGINX_SITE_CONF"
  else
    privileged env XITA_INTERCHAIN_FEE_NGINX=1 "$node_bin" \
      "$ROOT/tools/install-transfer-recovery-nginx.mjs"
  fi
  echo "Verifying read-only private Interchain Fee quote service health ..."
  curl --fail --silent --show-error --max-time 6 \
    "http://127.0.0.1:4092/api/xita/v1/managed/health"
  echo
  echo "SUCCESS: fee quote HTTP service, aggregate claim and verified sponsor timers installed. No blockchain TX sent."
)

install_tvl() (
  require_clean_main
  [[ "$(id -un)" != "root" ]] || { echo "Run as checkout owner." >&2; return 1; }
  local user group node_bin unit
  user="$(id -un)"; group="$(id -gn)"; node_bin="$(command -v node)"
  # Reuse the already configured SELECT-only metrics/indexer environment.
  # Do not demand a second manually provisioned /etc/xita/tvl.env.
  # /etc/xita/ is root:root mode 0750 and the .env is root:root mode 0600.
  # xgradmin cannot traverse the directory; a shell [[ -f ]] check reports
  # falsely missing even though the root-owned systemd manager loads it.
  if ! privileged test -f /etc/xita/indexer.env; then
    echo "ERROR: /etc/xita/indexer.env unavailable to the system manager" >&2
    return 1
  fi
  if ! privileged grep -q '^XITA_INDEXER_DATABASE_URL=postgresql' /etc/xita/indexer.env; then
    echo "ERROR: existing indexer read-only PostgreSQL connection missing" >&2
    return 1
  fi
  privileged install -d -m 0700 -o "$user" -g "$group" /var/lib/xita
  unit="$(mktemp)"
  trap 'rm -f "${unit:-}"' EXIT
  sed -e "s|^User=.*|User=$user|" \
      -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" \
      -e "s|^ExecStart=.*|ExecStart=$node_bin $ROOT/services/indexer/tvl-worker.mjs|" \
      "$ROOT/services/indexer/xita-tvl.service.example" > "$unit"
  privileged install -m 0644 "$unit" /etc/systemd/system/xita-tvl.service
  privileged systemctl daemon-reload
  privileged systemctl enable --now xita-tvl.service
  privileged systemctl restart xita-tvl.service
  privileged systemctl is-active xita-tvl.service
  if systemctl is-active --quiet xita-indexer.service 2>/dev/null; then
    privileged systemctl restart xita-indexer.service
  fi
  echo "XITA TVL worker installed using existing indexer read-only configuration. Unverified amounts remain unavailable."
)

complete_update() {
  require_clean_main
  publish_web
  install_sync
  if systemctl is-active --quiet xita-fee-preview.service 2>/dev/null || \
     systemctl is-active --quiet xita-interchain-fee-quote.service 2>/dev/null; then
    install_price_cache
  fi
  # Deploy new read-only API routes alongside the browser release.
  # Restart the indexer FIRST, then wait for its actual HTTP listener.
  if systemctl is-active --quiet xita-indexer.service 2>/dev/null; then
    privileged systemctl restart xita-indexer.service
    wait_xita_indexer || return 1
    if [[ -n "${XITA_NGINX_SITE_CONF:-}" ]]; then
      privileged "$(command -v node)" "$ROOT/tools/install-transfer-recovery-nginx.mjs" "$XITA_NGINX_SITE_CONF"
    else
      privileged "$(command -v node)" "$ROOT/tools/install-transfer-recovery-nginx.mjs"
    fi
    # A deliberately rejected UNSAFE RPC method must return HTTP 400 from the
    # current Node handler. This verifies Nginx routing WITHOUT depending on
    # any external chain RPC: 503 would indicate the old catch-all location.
    local status
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      --resolve xita.xgr.network:443:127.0.0.1 \
      -H 'Content-Type: application/json' \
      -d '{"rpcUrl":"https://rpc.xgr.network","method":"eth_sendRawTransaction","params":[]}' \
      https://xita.xgr.network/api/xeta/v1/rpc/read)" || status="000"
    if [[ "$status" != "400" ]]; then
      echo "ERROR: XITA read-only RPC Nginx routing check failed (HTTP $status; expected safe rejection 400)." >&2
      return 1
    fi
  fi
  if systemctl is-active --quiet xita-tvl.service 2>/dev/null; then
    privileged systemctl restart xita-tvl.service
  fi
  # Archive-RPC selection and canonical catalog updates must reach the live
  # history worker too; leaving its prior Node process running keeps stale RPCs.
  if systemctl is-active --quiet xita-transfer-indexer.service 2>/dev/null; then
    privileged systemctl restart xita-transfer-indexer.service
  fi
  if systemctl is-active --quiet xita-transfer-intake.service 2>/dev/null; then
    privileged systemctl restart xita-transfer-intake.service
  fi
  if systemctl is-active --quiet xita-interchain-fee-quote.service 2>/dev/null; then
    privileged systemctl restart xita-interchain-fee-quote.service
  fi
  if systemctl is-active --quiet xita-fee-preview.service 2>/dev/null; then
    privileged systemctl restart xita-fee-preview.service
  fi
}

update() {
  require_clean_main
  echo "Updating xgr-interchain from origin/main ..."
  git -C "$ROOT" pull --ff-only origin main
  local checked_out
  checked_out="$(git -C "$ROOT" rev-parse --verify HEAD)"
  [[ "$checked_out" =~ ^[0-9a-f]{40}$ ]] || {
    echo "ERROR: invalid updated Git revision" >&2
    return 1
  }
  # The running Bash process still holds OLD function and trap definitions
  # when git pull changes manage.sh. Always execute the freshly checked-out
  # script, even for a no-op pull, before publishing or restarting services.
  echo "Loading updated manage.sh from ${checked_out:0:12} ..."
  exec env XITA_UPDATE_MAIN_SHA="$checked_out" bash "$ROOT/manage.sh" _complete-update
}

case "${1:-help}" in
  start)
    privileged systemctl start "$ADMIN_SERVICE"
    privileged systemctl is-active "$ADMIN_SERVICE"
    ;;
  stop)
    privileged systemctl stop "$ADMIN_SERVICE"
    echo "$ADMIN_SERVICE stopped."
    ;;
  restart)
    privileged systemctl restart "$ADMIN_SERVICE"
    privileged systemctl is-active "$ADMIN_SERVICE"
    ;;
  _complete-update)
    # Private handoff from update(): no second pull and no execution of stale
    # traps or function bodies. Refuse use with a different or dirty checkout.
    [[ "${XITA_UPDATE_MAIN_SHA:-}" =~ ^[0-9a-f]{40}$ ]] &&
    [[ "$XITA_UPDATE_MAIN_SHA" == "$(git -C "$ROOT" rev-parse --verify HEAD)" ]] || {
      echo "ERROR: update re-entry does not match current main." >&2
      exit 1
    }
    complete_update
    ;;
  status) status ;;
  logs) privileged journalctl -u "$ADMIN_SERVICE" -n 100 --no-pager ;;
  follow) privileged journalctl -u "$ADMIN_SERVICE" -n 30 -f ;;
  health) health ;;
  check) check ;;
  check-routes)
    shift
    exec node "$ROOT/tools/check-route-readiness.mjs" "$@"
    ;;
  publish-web|deploy)
    if [[ "${1:-}" == "deploy" ]]; then
      echo "NOTICE: 'deploy' publishes the static WEBSITE ONLY, not contracts."
    fi
    publish_web
    ;;
  update) update ;;
  install-sync) install_sync ;;
  install-transfer-intake)
    install_transfer_intake
    ;;
  install-transfer-api) install_transfer_api ;;
  init-merkle)
    shift
    if [[ ! -d "$ROOT/runtime/native-relayer/node_modules/ethers" ]]; then
      echo "Installing read-only Merkle initializer dependency (ethers) ..."
      npm install --prefix "$ROOT/runtime/native-relayer" --ignore-scripts --no-audit --no-fund --package-lock=false
    fi
    exec node "$ROOT/runtime/native-relayer/init-iln-merkle.mjs" "$@"
    ;;
  install-tvl) install_tvl ;;
  install-fee-preview) install_fee_preview ;;
  install-price-cache) install_price_cache ;;
  install-interchain-fee) install_interchain_fee ;;
  help|-h|--help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac
