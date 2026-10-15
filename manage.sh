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
  publish-web   Publish static apps/web and restart the admin
  update        Pull GitHub main, validate, publish web, restart admin
  install-sync  Install one-shot GitHub deployment receipt auto-sync service
  install-transfer-api  Install read-only unsigned destination recovery endpoint and Nginx proxy
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
    node --test apps/web/keccak.test.mjs apps/web/experience.test.mjs apps/web/wallet-transfers.test.mjs apps/web/transfer-actions.test.mjs apps/web/transfer-page.test.mjs apps/web/leaderboard-data.test.mjs services/indexer/server.test.mjs services/indexer/transfer-recovery.test.mjs services/onboarding/manifests.test.mjs
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
    if curl -fsS --max-time 3 "$ADMIN_URL/admin/api/plan" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

restore_web() {
  local previous="$1" next="$2"
  if [[ -n "$previous" && -d "$previous" ]]; then
    privileged ln -s "$previous" "$next"
    privileged mv -Tf "$next" "$SITE_DIR/current"
  else
    privileged rm -f "$SITE_DIR/current"
  fi
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
  local sha release previous next
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
  previous="$(readlink -f "$SITE_DIR/current" 2>/dev/null || true)"
  next="$SITE_DIR/.next-${sha:0:12}-$$"
  privileged ln -s "$release" "$next"
  privileged mv -Tf "$next" "$SITE_DIR/current"

  if ! privileged systemctl restart "$ADMIN_SERVICE" || ! wait_admin; then
    echo "ERROR: admin failed after website publication; restoring previous website." >&2
    restore_web "$previous" "$next"
    privileged systemctl restart "$ADMIN_SERVICE" || true
    privileged systemctl status "$ADMIN_SERVICE" --no-pager --lines=20 || true
    return 1
  fi
  echo "SUCCESS: website ${sha:0:12} published and $ADMIN_SERVICE restarted."
}

status() {
  echo "Git branch: $(git -C "$ROOT" branch --show-current)"
  echo "Git revision: $(git -C "$ROOT" rev-parse --short=12 HEAD)"
  printf "Published web: "
  readlink -f "$SITE_DIR/current" || true
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

install_sync() {
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
  trap 'rm -f "$service_file" "$path_file" "$timer_file" "$timer_service_file"' RETURN
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
}

install_transfer_api() {
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
  trap 'rm -f "$unit"' RETURN
  sed -e "s|^User=.*|User=$user|" \
      -e "s|^WorkingDirectory=.*|WorkingDirectory=$ROOT|" \
      -e "s|^ExecStart=.*|ExecStart=$node_bin $ROOT/services/indexer/server.mjs|" \
      "$ROOT/services/indexer/xita-indexer.service.example" > "$unit"
  privileged install -m 0644 "$unit" /etc/systemd/system/xita-indexer.service
  privileged systemctl daemon-reload
  privileged systemctl enable --now xita-indexer.service
  privileged systemctl restart xita-indexer.service
  privileged systemctl is-active xita-indexer.service
  echo "Installing exact-match nginx proxy for unsigned destination recovery ..."
  if [[ -n "${XITA_NGINX_SITE_CONF:-}" ]]; then
    privileged "$node_bin" "$ROOT/tools/install-transfer-recovery-nginx.mjs" "$XITA_NGINX_SITE_CONF"
  else
    privileged "$node_bin" "$ROOT/tools/install-transfer-recovery-nginx.mjs"
  fi
  curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:4088/health"
  echo
  echo "SUCCESS: unsigned transfer recovery API configured. No wallet/private key was installed."
}

update() {
  require_clean_main
  echo "Updating xgr-interchain from origin/main ..."
  git -C "$ROOT" pull --ff-only origin main
  publish_web
  install_sync
  if systemctl is-active --quiet xita-indexer.service 2>/dev/null; then
    privileged systemctl restart xita-indexer.service
  fi
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
  status) status ;;
  logs) privileged journalctl -u "$ADMIN_SERVICE" -n 100 --no-pager ;;
  follow) privileged journalctl -u "$ADMIN_SERVICE" -n 30 -f ;;
  health) health ;;
  check) check ;;
  publish-web|deploy)
    if [[ "${1:-}" == "deploy" ]]; then
      echo "NOTICE: 'deploy' publishes the static WEBSITE ONLY, not contracts."
    fi
    publish_web
    ;;
  update) update ;;
  install-sync) install_sync ;;
  install-transfer-api) install_transfer_api ;;
  help|-h|--help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac
