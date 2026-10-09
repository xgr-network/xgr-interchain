#!/usr/bin/env bash
# XITA web/admin maintenance. Does not touch XGR Node, Explorer or any relayer.
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "$0")" && pwd -P)"
SITE_DIR="/var/www/xita"
ADMIN_SERVICE="xita-admin"
ACTION="help"
if [[ $# -gt 0 ]]; then ACTION="$1"; fi

check() {
  cd "$ROOT"
  node tools/validate-manifests.mjs
  node tools/build-xeta-web-catalog.mjs --check
  node --test apps/web/keccak.test.mjs
  node --test services/admin/plan.test.mjs
  node --check apps/web/app.mjs
  node --check apps/web/ui-data.mjs
  node --check services/admin/server.mjs
  node --check services/admin/admin.js
  if ! git diff --quiet -- apps/web config deployments; then
    echo "ERROR: uncommitted manifest/UI changes; refusing deployment" >&2
    return 1
  fi
}

publish() {
  local sha release next previous
  sha="$(git -C "$ROOT" rev-parse --short=12 HEAD)"
  [[ "$sha" =~ ^[0-9a-f]{12}$ ]] || { echo "Unsafe release revision" >&2; return 1; }
  release="$SITE_DIR/releases/$sha"
  sudo install -d -m 755 "$SITE_DIR/releases" "$release"
  sudo cp -a "$ROOT/apps/web/." "$release/"
  sudo chmod -R a+rX "$release"
  previous="$(readlink -f "$SITE_DIR/current" 2>/dev/null || true)"
  next="$SITE_DIR/.next-$sha-$$"
  sudo ln -s "$release" "$next"
  sudo mv -Tf "$next" "$SITE_DIR/current"
  if ! sudo systemctl restart "$ADMIN_SERVICE"; then
    echo "Admin failed to restart; reverting web symlink" >&2
    if [[ -n "$previous" && -d "$previous" ]]; then
      sudo ln -s "$previous" "$next"
      sudo mv -Tf "$next" "$SITE_DIR/current"
    fi
    sudo systemctl status "$ADMIN_SERVICE" --no-pager || true
    return 1
  fi
  if ! sudo systemctl is-active --quiet "$ADMIN_SERVICE"; then
    echo "Admin service inactive" >&2
    return 1
  fi
  curl -fsS --max-time 8 http://127.0.0.1:4087/admin/api/plan > /dev/null
  echo "SUCCESS: XITA static site $sha deployed; admin restarted."
}

status() {
  echo "Git: $(git -C "$ROOT" rev-parse --short=12 HEAD)"
  printf 'Published UI: '
  readlink -f "$SITE_DIR/current" || true
  sudo systemctl is-active "$ADMIN_SERVICE" || true
  curl -sS --max-time 5 -o /dev/null -w 'Admin HTTP: %{http_code}\n' \
    http://127.0.0.1:4087/admin/api/plan || true
}

case "$ACTION" in
  check) check ;;
  restart|deploy) check; publish ;;
  update) cd "$ROOT"; git pull --ff-only; check; publish ;;
  status) status ;;
  *) echo 'Usage: ./manage.sh {check|restart|deploy|update|status}' ;;
esac
