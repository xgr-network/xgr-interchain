# XITA website — source-level search discoverability review (16 November 2026)

**Site:** https://xita.xgr.network/  
**Source scope:** `apps/web/index.html`, SPA route rendering in `apps/web/app.js`, `apps/web/.headers`, `deploy/nginx/xita.xgr.network.conf.example`, and the public deployed-root file inventory.  
**Nature of review:** source-code inspection only. The external reader could not retrieve the live site, `/robots.txt`, or `/sitemap.xml`; this is an access limitation, **not** a verified live 404, search-engine block, outage or finding that no pages are indexed. No Google Search Console property, indexed-URL list, search impression/CTR data, crawl logs or live rendered-page inspection was available.

## Evidence in the tracked web source

| Concern | Observed source state | Practical impact |
| --- | --- | --- |
| Search title | One generic `<title>XITA \| Interchain Universe</title>` in `apps/web/index.html`; no source match for `document.title` updates | Dashboard, FAQ, join, token and transfer SPA paths are not supplied their own distinct initial server-side titles |
| Meta description | Generic global `meta name=description` on the SPA shell | No targeted descriptions for specific intent-based search landing pages |
| Canonical URL | No `rel=canonical` in the shell | Parameterized transfer/resume/token URLs and SPA aliases may present duplicate or ambiguous canonical signals |
| Social previews | No Open Graph or Twitter Card fields in the SPA shell | Less effective previews when shared in social posts; not itself proof of Google ranking loss |
| Sitemap and robots | No `apps/web/robots.txt` or `apps/web/sitemap.xml` in tracked deployed-root source; no tracked source mentioning those filenames | Canonical crawl inventory is not explicitly provided by this deployment tree. Deployed host might have independently installed files; verify them read-only |
| Meaningful HTML | Initial HTML has brand/navigation, a loading-state dashboard heading and a loading placeholder. FAQ, market, chain, token and join content is assembled client-side by JavaScript | Crawlers that execute JavaScript may see more, but indexability and relevance become less dependable than explicit HTML response bodies |
| Route handling | Nginx example uses `location / { try_files $uri $uri/ /index.html; }` | Many SPA paths initially return the same HTML and metadata. Unknown paths may look like soft 404s unless explicitly handled |
| Sensitive routes | Personalized wallet transfer history and resume/status URLs exist in SPA | They should not be placed in public sitemaps or marketed as generic searchable content |
| Site trust | Legal/imprint/privacy links and XGR.Network cross-link exist in initial HTML | Positive contextual trust/navigation material already present |
| Response security | CSP, anti-framing and security headers are declared in the sample Nginx configuration | Preserve these during SEO work; never weaken financial UI boundaries merely for Google crawlers |

## Prioritized corrections (proposed — NOT applied by this document)

1. **P0: public indexability verification.** Read-only `curl -I` and body tests for `/`, `/faq`, `/join`, `/robots.txt`, `/sitemap.xml` and a nonexistent URL, plus direct `X-Robots-Tag`/meta-robots checks. Validate that Nginx serves `robots.txt` as `text/plain` and `sitemap.xml` as XML, **not** the SPA `index.html` fallback. Confirm current Google indexed pages and coverage in verified Search Console ownership; do not infer indexing from repository contents.
2. **P1: crawlable intent pages.** Provide server-readable, accessible content and unique `<title>`, meta descriptions, canonical URLs and meaningful H1 text for static public routes: `/` (independent Interchain/Direct-BLS infrastructure), `/faq` (concepts and safety), `/join` (onboarding), `/markets` (public token/network discovery), and any carefully verified public token asset pages. Keep all claims about supported chains, sponsorship, token creator availability and operational readiness accurate to the actual public catalog; do not present future or draft integrations as live.
3. **P1: fixed sitemap + crawl policy.** Add `robots.txt` referencing the canonical `sitemap.xml`; include only *real*, accessible canonical public landing pages. Exclude admin, wallet-personal pages, unique transfer/resume URLs, private profiles, arbitrary token query permutations and uncrawled API endpoints from the sitemap. Provide actual HTTP 404 for unknown static paths or explicit noindex, and avoid Googlebot-specific deceptive serving.
4. **P1: canonical and graph hints.** Add consistent HTTPS canonicals; `og:title`, `og:description`, `og:url` and a stable approved preview image. Use concise `WebSite`/`Organization` JSON-LD only for factual claims; verify organization names/URLs before publishing. Do not fabricate testimonials, FAQ rich-result eligibility or indexed-search status.
5. **P2: performance & audit.** Test Googlebot mobile rendering, JavaScript errors, CSR/SSR parity and Core Web Vitals. The animated WebGL universe should be progressive enhancement, **not** the only way to read the site's informational content. Evaluate content quality and internal links to primary XGR technical docs. Submit the verified sitemap to Search Console and monitor indexing/impressions after deployment.

## Guardrails

- Keep wallet signing, bridge transaction flows, wallet balances, privacy, recovery/nonce state and all admin panels client-side or authenticated as designed. Pre-render **public descriptions**, never wallet-specific data or unsigned sensitive operations.
- Do not weaken CSP, remove security headers or disclose nonpublic catalog/keys to enable SEO.
- No SEO changes were deployed or merged into the public SPA in this review. A dedicated UI patch and production verification remain necessary.

## Suggested acceptance checklist

- The canonical landing pages return HTTP 200, contain distinct meaningful text, H1, title, description and self-canonical in the **initial HTML**.
- `/robots.txt` and `/sitemap.xml` return 200 with correct MIME types and consistent URL listings; neither serves `index.html`.
- Unknown pages correctly return 404 or noindex; wallet/personal paths do not appear in sitemap.
- Rendered HTML and JavaScript-enhanced UI agree on factual chain support; existing CSP and transfer security tests remain green.
- Search Console verifies ownership, accepts sitemap, and reports the real indexing state. Visibility changes are measured, not assumed.
