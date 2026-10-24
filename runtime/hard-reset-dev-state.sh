#!/usr/bin/env bash
# Explicit destructive PREDEPLOY reset. Only XITA runtime journals and relayer state.
# Never removes source files, GitHub receipts, chain databases or validator keys.
set -euo pipefail
if [[ $# -ne 1 || "$1" != "--apply-hard-reset" ]]; then
  echo "Usage: XITA_SERVICES_STOPPED=yes ./runtime/hard-reset-dev-state.sh --apply-hard-reset" >&2
  exit 2
fi
[[ "${XITA_SERVICES_STOPPED:-}" == "yes" ]] || {
  echo "Stop xita-admin and optional relayers first, then confirm XITA_SERVICES_STOPPED=yes." >&2
  exit 2
}
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
admin="${XGR_ADMIN_STATE_DIR:-$root/runtime-state/admin}"
admin="$(realpath -m -- "$admin")"
[[ "$admin" = /* && "$admin" != "/" && "$admin" != "$root" ]] || exit 2
for dir in "$admin/wallet-intents" "$admin/deployments"; do
  if [[ -L "$dir" ]]; then echo "Refusing symlink: $dir" >&2; exit 2; fi
  if [[ -d "$dir" ]]; then rm -rf -- "$dir"; echo "Reset: $dir"; fi
done
for name in deployment-sync.request deployment-sync.processing deployment-sync.status.json; do
  f="$admin/$name"
  [[ ! -L "$f" ]] || { echo "Refusing symlink: $f" >&2; exit 2; }
  rm -f -- "$f"
done
# Only private ILN relayer data, not configuration / env files / binaries.
relay="$root/runtime/runtime-state"
if [[ ! -L "$relay" && -d "$relay" ]]; then
  find "$relay" -maxdepth 1 -type f \( -name 'direct-*.json' -o -name 'xita-direct-relayer.json' -o -name '*iln*state*.json' \) -delete
fi
echo "Development-only XITA deployment WAL and Direct-BLS relayer state reset."
