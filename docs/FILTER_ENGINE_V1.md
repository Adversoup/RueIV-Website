# RueIV Filter Engine v1 — preview integration

Companion implementation: Adversoup/RueIV-Source, `docs/FILTER_ENGINE_V1.md` and
`docs/FILTER_ENGINE_V1_G7_ACCEPTANCE.md`. Mandatory policy: the owner's
RueIV_ConsortiumHub_Canonical_Operating_Rules.md. IA: Source `docs/Website Categories.xlsx`.

This change adds only an alternate collection template, a product-card fragment template,
an opt-in section and its JS/CSS. The default collection grid and smart-filters are untouched.

Use `?view=rueiv-filter&preview_theme_id=<confirmed unpublished theme ID>` only after uploading
the new files to that preview theme and setting the new section's enabled/endpoint settings
there. The endpoint must be an approved staging Hub endpoint. No production collection
template assignment, theme publication, live-theme upload or product mutation is included.

Facets and counts come from the Hub's approved tenant/store/publication readback index;
results paginate independently of Shopify native filters. The browser receives handles,
not prices. Native card-product and its existing image/price resolver render same-origin
fragments with the current customer session. Preview ID and localized root are preserved.
Fragments are fetched with no-store and are not persisted in browser storage.

Supported behaviour: multiple selections, option search, collection scope, title search,
name sorting, 24-product pages, URL/history/back navigation, desktop/mobile and labelled
standard-collection fallback when the API or native card view fails.

Local validation: JS syntax passed; full theme check passed with no errors; Chromium
integration with a real fixture FastAPI backend and Liquid-rendered section passed for
40,001 products. Synthetic cards prove session forwarding, not real Shopify price policies.
Run the optional browser test using Playwright/LiquidJS/Chromium and FILTER_TEST_SOURCE
pointing to the Source checkout: `node scripts/test_filter_engine_browser.cjs`.

**G7: BLOCKED.** No preview deployment or live storefront validation was possible because
Consortium Hub has only a production environment and connector credentials are redacted.
Do not represent local fixture success as real storefront acceptance. Owner approval is
required after preview verification and before any production rollout.
