# XITA SEO implementation and production verification — 16 November 2026

## Scope and safeguards

The previous source-only assessment is retained at `docs/XITA_SEARCH_DISCOVERABILITY_REVIEW_2026-11-16.md`.
This patch adds independently readable static HTML shells for `/`, `/faq`, `/join`,
`/markets` and `/contact`. The **same public content is served to visitors and crawlers**.
JavaScript continues to enhance those routes, using the original application modules, API,
wallet and signing workflow. These are stable public intent pages, not promises of
per-token route readiness, listing eligibility, or sponsorship payment.

`/transfer`, `/my-transfers`, all token-detail URLs and account/application
confirmation flows remain client-side and start from a `noindex,follow` shell.
No personal, wallet, quote, callback or transaction IDs appear in the sitemap.
Dynamic token detail URLs are intentionally not indexed until a separate
evidence-backed per-token publishing design is reviewed. Existing legal static
pages remain accessible without the SPA.

`robots.txt` declares the canonical sitemap and explicitly excludes `/admin/`
and `/api/`; it is **not** a security boundary. HTTP access control remains
unchanged. For public pages only, initial HTML includes a unique title, a
targeted description, canonical HTTPS URL, Open Graph title/description/URL and
a summary Twitter card. No fabricated rich-result schema or preview image.

## Installation — requires production operator

1. Review and merge the tested PR. The checked-in Nginx example is not
   automatically the active production vhost. Before changing it, compare
   `/etc/nginx` config to the expected safe legacy SPA fallback.
2. Run `./manage.sh update` as the checkout owner to publish a complete
   atomic web release. CSS and JS hashes are stamped across **all** new HTML
   entrypoints. Confirm `/var/www/xita/current/{faq,join,markets,contact,noindex}.html`,
   `robots.txt` and `sitemap.xml` exist.
3. On the XITA web host only, run
   `sudo node tools/install-xita-seo-nginx.mjs`.
   The installer accepts only the known exact `location / { try_files $uri
   $uri/ /index.html; }` fallback, retains the other Nginx locations, tests
   the new configuration, reloads and restores the old config on an
   unsuccessful test/reload. On an unfamiliar vhost it fails without changes:
   reconcile manually; do **not** force the replacement.
4. Verify HTTPS status, initial HTML and content types:

```sh
for path in / /faq /join /markets /contact /robots.txt /sitemap.xml /transfer /my-transfers /not-a-real-page; do
  echo "== $path"
  curl -sS -L --max-time 10 -o /dev/null -w '%{http_code} %{content_type}\n' "https://xita.xgr.network$path"
done
curl -fsS https://xita.xgr.network/faq | grep -E '<title>|rel="canonical"|<h1>'
curl -fsS https://xita.xgr.network/transfer | grep 'name="robots" content="noindex,follow"'
curl -fsS https://xita.xgr.network/sitemap.xml
```

Expected: public paths and assets 200; unknown path HTTP **404**;
private workflow HTML 200 with **noindex**; robots `text/plain`, sitemap
XML, separate non-generic initial titles and meaningful headings. Confirm the
old browser transfer/Join routes still initialize and static JS/CSS assets
retain correct MIME and source-version cache keys.

5. Run Google Search Console URL Inspection on `/`, `/faq`, `/join`,
   `/markets` and `/contact`, submit `/sitemap.xml`, and monitor indexed
   coverage and impressions after deployment. Repository changes alone do not
   establish public indexation or an observed Google ranking improvement.

## Release gate

CI: `node --test tools/xita-seo-nginx.test.mjs
tools/stamp-xita-web-style.test.mjs tools/stamp-xita-web-modules.test.mjs`
plus unchanged XITA UI, WebGL, security and browser smoke checks.
No chain contracts, node release, persisted wallet state or managed-relay
finance policy changes are included in this SEO patch.
