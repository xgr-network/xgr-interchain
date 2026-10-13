# XITA deployment receipt auto-sync

After a verified blockchain deployment receipt is atomically published to GitHub main, the read-only Admin places its exact commit SHA into the private state directory. A dedicated unprivileged systemd path service fast-forwards the clean main checkout only for append-only receipt publications. Solidity and application changes, dirty trees, deletions, unapproved origins or stale main block automatic sync. Compilation, website publication and restarts are not performed.

Run `./manage.sh update` once after this PR to install `xita-deployment-sync.path` and its one-shot service. Ordinary subsequent receipt-only deployments should need no full update. The Admin remains read-only and loads GitHub-backed inventory afresh with each request.

The service keeps failed requests in `deployment-sync.processing` and writes `deployment-sync.status.json` in `runtime-state/admin`. Use `systemctl status xita-deployment-sync.path xita-deployment-sync.service` and `journalctl -u xita-deployment-sync.service -n 50 --no-pager` for diagnostics. If a sync fails, no blockchain transaction is resent; use `./manage.sh update` after investigating. This design intentionally does not provide an HTTP git-pull endpoint.

For current v3.1.5 publishing, allowed indices are deployments/chains/*.json,
deployments/assets/<hex-shard>/<SYMBOL>/representations.json and
deployments/assets/<hex-shard>/<SYMBOL>/routes/<64-hex-id>.json.
Every intervening GitHub commit is independently checked, so later
reversions cannot conceal changes to source code or configuration.

First rollout: run ./manage.sh update as the repository owner, not root.
This provisions /var/www/xita/data/catalog.json with operator-only write
access and links the website release catalog to it. Receipt-only updates
atomically refresh that JSON; scripts, Solidity, the Admin process,
validator nodes and relayers are never restarted by automatic sync.
Unexpected main changes, Git or artifact failures still require full update.

The XGRChain Factory form preloads 0.1 XGR (100000000000000000 Wei)
for the initial source-validator fee; other chains use their own currency.
The suggested 500000 destination gas parameter is only immutable Hyperlane
metadata, not a cap on Mailbox.process. The runtime relayer estimates the
actual gas for every destination message separately.
