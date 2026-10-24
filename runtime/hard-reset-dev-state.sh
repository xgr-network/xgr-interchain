#!/usr/bin/env bash
# Explicit irreversible XITA development reset. Never touches chain DB or keys.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [[ "${1:-}" != "--apply-hard-reset" || "$#" != 1 ||
      "${XITA_HARD_RESET_CONFIRM:-}" != "DELETE-XITA-DEVELOPMENT-DATA" ]]; then
 echo "Usage: XITA_HARD_RESET_CONFIRM=DELETE-XITA-DEVELOPMENT-DATA ./manage.sh hard-reset-dev" >&2
 exit 2
fi
[[ "$(id -un)" != root ]] || { echo "Run as checkout owner." >&2; exit 2; }
[[ "$(git -C "$ROOT" branch --show-current)" == main ]] || { echo "Checkout main before reset." >&2; exit 2; }
[[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]] || { echo "Tracked checkout dirty." >&2; exit 2; }
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "$(git -C "$ROOT" rev-parse origin/main)" ]] || {
 echo "Local main differs from origin/main." >&2; exit 2;
}
command -v psql >/dev/null || { echo "PostgreSQL psql required" >&2; exit 2; }
for svc in xita-admin xita-indexer xita-tvl xita-transfer-indexer xita-transfer-intake \
 xita-transfer-proof-observer xita-deployment-sync xita-deployment-sync-poll \
 xita-interchain-fee-quote xita-fee-preview xita-interchain-fee-claim xita-gas-sponsor; do
 if systemctl is-active --quiet "$svc.service" 2>/dev/null; then
  echo "ERROR: $svc.service still active; stop XITA services before reset." >&2
  exit 1
 fi
done
if [[ "${XITA_RELAYER_PROCESSES_STOPPED:-}" != "yes" ]]; then
 echo "ERROR: stop all native XITA relayers, then set XITA_RELAYER_PROCESSES_STOPPED=yes." >&2; exit 2
fi
DB="${XITA_TRANSFER_DB_NAME:-xita}"
[[ "$DB" =~ ^[a-z][a-z0-9_]*$ && "$DB" == xita ]] || { echo "Refusing non-XITA DB" >&2; exit 2; }
# An exact allowlist, not DROP SCHEMA or database-wide TRUNCATE.
SQL="BEGIN;
DO \$\$
DECLARE actual text[]; expected text[]:=ARRAY[
'xita_sponsor_grants','xita_sponsor_monitor_state',
'xita_transfer_announcements','xita_transfer_index_cursors',
'xita_transfer_operations','xita_transfer_proof_observations',
'xita_verified_asset_liquidity']::text[];
BEGIN
 SELECT COALESCE(array_agg(tablename ORDER BY tablename),ARRAY[]::text[])
 INTO actual FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'xita_%';
 IF actual <> (SELECT array_agg(x ORDER BY x) FROM unnest(expected) AS x
   WHERE to_regclass('public.'||x) IS NOT NULL) THEN
  RAISE EXCEPTION 'Unexpected XITA tables; inspect manually: %',actual;
 END IF;
END \$\$;
DO \$\$
DECLARE tables text;
BEGIN
 SELECT string_agg(format('public.%I',tablename),', ' ORDER BY tablename)
 INTO tables FROM pg_tables WHERE schemaname='public' AND tablename IN
 ('xita_sponsor_grants','xita_sponsor_monitor_state','xita_transfer_announcements',
  'xita_transfer_index_cursors','xita_transfer_operations',
  'xita_transfer_proof_observations','xita_verified_asset_liquidity');
 IF tables IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE '||tables||' RESTART IDENTITY RESTRICT'; END IF;
END \$\$;
COMMIT;"
echo "Clearing development rows in PostgreSQL database $DB ..."
printf '%s\n' "$SQL" | sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB"
ADMIN="${XGR_ADMIN_STATE_DIR:-$ROOT/runtime-state/admin}"
ADMIN="$(realpath -m -- "$ADMIN")"
[[ "$ADMIN" != / && "$ADMIN" != "$ROOT" && "$ADMIN" == /* ]] || exit 2
for dir in "$ADMIN/wallet-intents" "$ADMIN/deployments"; do
 [[ ! -L "$dir" ]] || { echo "Unsafe journal symlink $dir" >&2; exit 2; }
 [[ ! -d "$dir" ]] || rm -rf -- "$dir"
done
for file in deployment-sync.request deployment-sync.processing deployment-sync.status.json; do
 [[ ! -L "$ADMIN/$file" ]] || exit 2
 rm -f -- "$ADMIN/$file"
done
for file in /var/lib/xita/verified-tvl.json /var/lib/xita/verified-tvl-history.json; do
 if sudo test -L "$file"; then echo "Refusing metrics symlink $file" >&2; exit 2; fi
 sudo rm -f -- "$file"
done
relay="$ROOT/runtime/runtime-state"
if [[ -d "$relay" && ! -L "$relay" ]]; then
 find "$relay" -maxdepth 1 -type f \\( -name 'direct-*.json' -o -name 'xita-direct-relayer.json' -o -name '*iln*state*.json' \\) -delete
fi
echo "XITA development DB rows, journal and TVL history cleared. Publish fresh catalog via ./manage.sh update."
