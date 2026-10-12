# XITA deployment receipt auto-sync

After a verified blockchain deployment receipt is atomically published to GitHub main, the read-only Admin places its exact commit SHA into the private state directory. A dedicated unprivileged systemd path service fast-forwards the clean main checkout only for append-only receipt publications. Solidity and application changes, dirty trees, deletions, unapproved origins or stale main block automatic sync. Compilation, website publication and restarts are not performed.

Run `./manage.sh update` once after this PR to install `xita-deployment-sync.path` and its one-shot service. Ordinary subsequent receipt-only deployments should need no full update. The Admin remains read-only and loads GitHub-backed inventory afresh with each request.

The service keeps failed requests in `deployment-sync.processing` and writes `deployment-sync.status.json` in `runtime-state/admin`. Use `systemctl status xita-deployment-sync.path xita-deployment-sync.service` and `journalctl -u xita-deployment-sync.service -n 50 --no-pager` for diagnostics. If a sync fails, no blockchain transaction is resent; use `./manage.sh update` after investigating. This design intentionally does not provide an HTTP git-pull endpoint.
