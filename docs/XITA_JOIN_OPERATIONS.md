# XITA Join — secure operator deployment and contact privacy

## Eligibility and review
Only new ERC-20 token proposals with a CoinGecko **coin profile identifying the same original-chain token contract** may be submitted. Validate the CoinGecko ID, platform, address, token symbol and decimals at preview, email confirmation, and in the GitHub PR CI. Supported CoinGecko asset-platform identities: Base `base`, Polygon `polygon-pos`, Arbitrum `arbitrum-one`. An original XGRChain token cannot pass yet because its CoinGecko platform is not independently established; do not bypass this gate.

A verified applicant email does **not** verify ownership, founding status or authority. A holder/community applicant is a proposer, not an authorized project representative. XGR manually reviews the GitHub **draft** PR before approving any funding or deployment. A PR is **not** a deployed route or a public token listing.

## Privacy and retention
The contact email and self-declared role are stored in a separate, owner-only JSON directory on the operator host, outside Git and the static webroot. The public PR contains the nonpersonal applicant-role category, but never an email or verification token. Public project descriptions containing email addresses are refused. Neither the address nor confirmation token is included in the URL query string; confirmation links place their one-time 256-bit token in the URL fragment. Only its hash is persisted.

Unconfirmed applications expire after 24 hours. Active contact records are limited to 366 days by default; rejected/listed records are retained for 180 days following the last recorded close/listing event. The read-only notification poller prunes expired records. Run it on a regular interval. Existing legal retention requirements might necessitate a documented exception, not blanket indefinite storage.

Email is used only for confirmation and changes directly relevant to the application (GitHub acceptance/rejection, deployed contracts, independently verified collateral and TVL-based listing). No newsletter, promotional campaign or arbitrary email forwarding. The transaction mail provider must have a valid GDPR-processing arrangement.

**Before enabling public email collection**: update `https://xgr.network/privacy-policy.html` to expressly cover the XITA application flow, purposes and Article 6 GDPR legal basis, service providers, retention, security and contact rights. The generic existing policy covers websites/subdomains and Zoho-based inquiries but does not yet detail this XITA process. The site-wide Imprint and Privacy Policy links are already live.

## Production configuration — not in the repo
Set these values only in a root-protected service environment file such as `/etc/xita/join.env` (0600), never in Git or browser assets:

```ini
XITA_JOIN_PORT=4090
XITA_JOIN_PRIVATE_DIR=/var/lib/xita/join
XITA_JOIN_PUBLIC_URL=https://xita.xgr.network
XITA_JOIN_WRITER_TOKEN=<FINE_GRAINED_GITHUB_TOKEN_WITH_CONTENTS_AND_PRS_WRITE>
XITA_JOIN_MAIL_API_URL=https://<PRIVATE_TRUSTED_TRANSACTIONAL_MAIL_GATEWAY>/send
XITA_JOIN_MAIL_API_TOKEN=<SECRET>
XITA_JOIN_MAIL_FROM=contact@xgr.network
XITA_COINGECKO_API_KEY=<OPTIONAL_COINGECKO_DEMO_KEY>
```

The mail adapter is an operator-provisioned **HTTPS** endpoint. It must authenticate `Authorization: Bearer <token>`, accept JSON `{from,to,subject,text}`, honor the `Idempotency-Key` header, deliver an email and return a 2xx response **only when delivery is accepted**. For Zoho Mail, provide an operator-side adapter with Zoho credentials, not client-side keys. The project does not automatically install or configure Zoho and does not claim mail delivery without this adapter. If any required configuration is absent, `GET /api/xita/join/status` returns `available:false` and public `POST /submit` remains HTTP 503.

Create the data directory owned by the same unprivileged service user and enforce 0700:

```sh
sudo install -d -m 0700 -o xgradmin -g xgradmin /var/lib/xita/join
sudo install -d -m 0700 /etc/xita
sudo chmod 0600 /etc/xita/join.env
```

Run `node services/onboarding/server.mjs` as that unprivileged user, with `EnvironmentFile=/etc/xita/join.env`, `WorkingDirectory=<repository>`, and restart-on-failure, bound to **127.0.0.1:4090 only**.

## Restricted Nginx forwarding
Allow only these paths from the public HTTPS vhost, leaving the server inaccessible directly. Configure the client-IP rate-limit zone in Nginx's global `http` context:

```nginx
limit_req_zone $binary_remote_addr zone=xita_join_submit:10m rate=2r/m;
```

Inside the dedicated `xita.xgr.network` server block (do not expose other onboarding URLs), configure:

```nginx
location = /api/xita/join/status  { proxy_pass http://127.0.0.1:4090; proxy_set_header Host $host; add_header Cache-Control "no-store" always; }
location = /api/xita/join/preview { proxy_pass http://127.0.0.1:4090; proxy_set_header Host $host; client_max_body_size 512k; add_header Cache-Control "no-store" always; }
location = /api/xita/join/submit  { limit_req zone=xita_join_submit burst=3 nodelay; proxy_pass http://127.0.0.1:4090; proxy_set_header Host $host; client_max_body_size 512k; add_header Cache-Control "no-store" always; }
location = /api/xita/join/confirm { limit_req zone=xita_join_submit burst=3 nodelay; proxy_pass http://127.0.0.1:4090; proxy_set_header Host $host; client_max_body_size 1k; add_header Cache-Control "no-store" always; }
```

Confirm the site already has its standard TLS and CSP settings. Never put GitHub or mail bearer tokens in Nginx, website JS or public status results. The service itself also limits repeated requests per applicant email (in-memory). Consider WAF challenge/anti-abuse protection before accepting unrestricted public submissions.

## Notifications
Run `node services/onboarding/status-notifier.mjs --run` on a local systemd timer, for example every 15 minutes, with the same restricted environment and storage permissions as the Join API. It checks the source GitHub PR state and reads `http://127.0.0.1:4088/api/xeta/v1/visibility`. It does **not** use CoinGecko price or market cap as collateral or as an automatic listing signal. Unavailable GitHub/indexer evidence is treated as unknown, not a positive change; failed emails remain pending for retry.

The independent read-only indexer must have finalized verified collateral and an explicitly approved `publication.minimumLockedUsd` for automatic public-listing transitions. Today the minimum remains `null`: no automatic listing will occur until an operator deliberately chooses the threshold and deploys the trusted evidence verifier.

## Review and verification
```sh
node --test services/onboarding/*.test.mjs tools/validate-join-pr.test.mjs
node tools/validate-manifests.mjs
node --check apps/web/app.js
node --check services/onboarding/server.mjs
node --check services/onboarding/status-notifier.mjs
```
GitHub workflows: `.github/workflows/validate.yml` and `.github/workflows/verify-join.yml`. Never merge applicant PRs solely because an identity check passes; human review and asset policy still apply.
