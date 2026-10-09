# XETA standalone web UI

Serve apps/web as a static site with **SPA fallback to index.html**. Deploy at xeta.xgr.network after completing all security gates.

The website is built from the authoritative repository inventory:

```sh
node tools/build-xeta-web-catalog.mjs
node --test apps/web/keccak.test.mjs
node tools/build-xeta-web-catalog.mjs --check
```

The UI uses an injected EIP-1193 EVM wallet and the onchain ILNGateway's quoteILN/bridge functions. It blocks unknown, unverified, or unactivated routes, and checks the canonical ILN Registry immediately before quotes. Users must approve ERC20 amounts to the **gateway**. Delivery requires destination Mailbox.delivered(messageId); submission alone is not success.

Join Alliance creates a local JSON draft only; it does not pretend to send an application to a configured server. Live pricing, volume, indexing and recovery must be independently verified before being advertised.
