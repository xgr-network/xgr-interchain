# XITA Join production integration

This is an independent XITA application service. It never changes node consensus, validators, ILN contracts or the parallel v3.2.2 light release.

## Security prerequisites

* Rotate any SMTP password previously committed to XGR_Web history before using it.
* Provision /etc/xita/join.env as root-owned mode 0600. Never commit SMTP_PASS or GitHub credentials. Reuse XITA_GITHUB_TOKEN already installed for XITA Admin; XITA_JOIN_WRITER_TOKEN is an optional override only.
* The configuration must provide a working HTTPS or TLS SMTP transport, private contact storage and access to the existing XITA_GITHUB_TOKEN with Contents: write and Pull requests: write. The running Join service must receive this environment variable. Do not create another token if the existing one has these permissions.
* Ensure the Nginx global http context has exactly one rate-limit zone: `limit_req_zone $binary_remote_addr zone=xita_join_submit:10m rate=2r/m;`
* The existing XITA privacy policy must be served before collecting addresses.

## Operator-only installation

From the trusted XITA host after reviewing this PR and with a clean checkout:

```sh
sudo install -d -m 0700 -o xgradmin -g xgradmin /var/lib/xita/join
sudo chmod 0600 /etc/xita/join.env
npm install --prefix services/onboarding --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false
node --test services/onboarding/*.test.mjs tools/join-nginx.test.mjs
node --check services/onboarding/server.mjs
node --check services/onboarding/status-notifier.mjs
```

Render the three templates in deploy/systemd/ by replacing @SERVICE_USER@ and @SERVICE_GROUP@ with the service user and group, @ROOT@ with the absolute checkout path and @NODE_BIN@ with the verified absolute Node executable path. Install as root-owned 0644 /etc/systemd/system/xita-join.service, xita-join-notifier.service and xita-join-notifier.timer.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now xita-join.service
curl -fsS http://127.0.0.1:4090/api/xita/join/status
sudo node tools/install-join-nginx.mjs
sudo systemctl enable --now xita-join-notifier.timer
sudo systemctl list-timers xita-join-notifier.timer
curl -fsS https://xita.xgr.network/api/xita/join/status
```

Do not submit a live application unless available=true. The notifier polls every 15 minutes; SMTP delivery can be retried but is not guaranteed exactly once.

## ARB holder acceptance test

Use chain arbitrum, symbol ARB, CoinGecko ID arbitrum, original token 0x912CE59144191C1204E64559FE8253a0e49E6548 and decimals 18. Select applicant role holder and an inbox controlled by the applicant. Confirm the email link, then verify that exactly one Draft PR was created, no contact address entered GitHub, only the hub-and-spoke route proposals were generated, and required CI passes. Do not merge or deploy contracts as part of the acceptance test.
