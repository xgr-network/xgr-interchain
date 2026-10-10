#!/usr/bin/env bash
# XITA admin + website management; NEVER controls XGRChain or ILN relayers.
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ADMIN_SERVICE="xita-admin.service"
SITE_DIR="/var/www/xita"
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
    node --test apps/web/keccak.test.mjs apps/web/experience.test.mjs apps/web/leaderboard-data.test.mjs services/indexer/server.test.mjs services/onboarding/manifests.test.mjs
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
  # Pinned by vendor/package.json. Install only on missing package files;
  # never use Solidity imports from a browser, user-supplied path or PR.
  local vendor="$ROOT/vendor/node_modules"
  if [[ ! -f "$vendor/@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol" ||
        ! -f "$vendor/@openzeppelin/contracts/token/ERC20/ERC20.sol" ||
        ! -f "$vendor/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol" ]]; then
    echo "Preparing pinned Hyperlane/OpenZeppelin Solidity sources for UI deployment..."
    command -v npm >/dev/null || {
      echo "ERROR: npm unavailable for pinned Solidity dependencies" >&2
      return 1
    }
    npm install --prefix "$ROOT/vendor" --ignore-scripts --no-audit --no-fund --package-lock=false
  fi
  [[ -f "$vendor/@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol" &&
     -f "$vendor/@openzeppelin/contracts/token/ERC20/ERC20.sol" &&
     -f "$vendor/@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol" ]] || {
    echo "ERROR: Pinned Solidity source installation incomplete" >&2
    return 1
  }
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

update() {
  require_clean_main
  echo "Updating xgr-interchain from origin/main ..."
  git -C "$ROOT" pull --ff-only origin main
  publish_web
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
  help|-h|--help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac
