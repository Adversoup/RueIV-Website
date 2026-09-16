# RueIV 23-Vendor Shopify Readiness Audit

**Target gate:** `RUEIV_23_VENDOR_SHOPIFY_THEME_DATA_READINESS_READY_FOR_GO_LIVE_GATE`  
**Scope:** Modiva theme + data contract only. No theme push/publish. No live merchant mutation.

---

## Executive Summary

The Modiva theme is **architecturally vendor-agnostic** — Liquid reads `product.vendor` and metafields without per-vendor `if` branches. Gaps are in **commerce UX** (price-hidden, tearsheet), **URL conventions**, **orphaned sections**, and **merchant configuration** (Search & Discovery filters, brand assets, collection breakers).

This PR adds data-driven theme fixes and documentation. Remaining go-live work is primarily Hub publish + Shopify Admin configuration.

---

## 1. Product Card Assumptions

| Area | Current behavior | 23-vendor risk | Resolution |
|------|------------------|----------------|------------|
| Vendor label | `product.vendor` when `pcard_show_vendor=true` | Low — scales automatically | Data only |
| Price | Always rendered via `price.liquid` | **High** — trade/quote products show $0 or bogus fallback | **Fixed:** `rueiv-price-resolver` + updated `price.liquid` |
| Missing image | `placeholder-svg` | Medium — inconsistent vendor photography | `image.square` metafield already supported |
| Second image hover | First two product images | Low | No change |
| Quick view | Shows price even when PDP omits it | Medium | Price resolver applies globally |

**Files:** `snippets/card-product.liquid`, `snippets/price.liquid`, `config/settings_data.json`

---

## 2. PDP Assumptions

| Area | Current behavior | 23-vendor risk | Resolution |
|------|------------------|----------------|------------|
| Price block | Defined but **excluded from block_order** (intentional showroom UX) | OK for trade showroom | Price resolver ensures consistency when block enabled |
| Brand badge | `product.vendor` + `brand.logo` | Medium — logo duplicated per SKU | Document metaobject migration; Hub populates metafields |
| Brand story | Requires `brand.story` per product | Medium | Same as above |
| Specs | Dual source `specs.*` + `rueiv.*` | Medium — duplicate rows possible | `specs.*` takes priority; legacy rows skipped when spec key present |
| Tearsheet | **Not implemented** | **High** for textiles/wallpaper | **Fixed:** `pdp-tearsheet.liquid` reads `specs.tearsheet` |
| Variants | Button picker + variant_image swatches | Low — vendor-agnostic | No change |
| Gallery | grid-mix, zoom, multi-image | Low | Verified — no vendor logic |
| JSON-LD | Always emits price | Medium — exposes hidden prices | **Fixed:** omit offers when price hidden |

**Files:** `templates/product.json`, `snippets/rueiv-product-specs.liquid`, `snippets/pdp-brand-badge.liquid`

---

## 3. Collection, Search & Filter

| Area | Current behavior | 23-vendor risk | Resolution |
|------|------------------|----------------|------------|
| Smart filters | Category-aware order; Designer always last | **Depends on Search & Discovery admin** | Go-live checklist: configure vendor filter |
| Designer filter | Searchable dropdown when >25 values | Ready for 23 vendors | Data/config |
| Price filter | Skipped in smart-filters | OK for trade showroom | No change |
| Vendor collection detection | First product's vendor vs collection handle | Medium — wrong if sort changes | Document: vendor collections must be single-vendor smart collections |
| Brand breakers | 5 hardcoded blocks in templates | High for 18+ vendors | **Fixed:** designers template uses auto-grid; breakers optional per-vendor in theme editor |

**Files:** `snippets/smart-filters.liquid`, `sections/main-collection-product-grid.liquid`, `templates/collection.designers.json`

---

## 4. Vendor / Brand Presentation

| Area | Data-driven? | Notes |
|------|--------------|-------|
| Mega menu brands | ✅ Menu-driven | `shop-by-brand` navigation menu |
| PDP brand badge | ✅ `product.vendor` | Link fixed to vendor collection URL |
| PDP brand story | ✅ `brand.story` metafield | CTA uses vendor collection |
| Designers grid | ✅ Dedupes vendors from collection | **Fixed:** wired to `collection.designers` template |
| Homepage spotlight | ⚠️ Manual section settings | Porta Romana/Arte defaults — owner content, not theme logic |
| Brand pages | ✅ `page.brand` template | One page instance per vendor (merchant config) |

**No Liquid `if vendor == 'X'` branching found.**

---

## 5. Native Shopify Data vs Theme Code

| Concern | Handle via data | Handle via theme |
|---------|-----------------|------------------|
| Vendor assignment | ✅ `product.vendor` | — |
| Category membership | ✅ `product_type` + tags | — |
| Color/end-use filters | ✅ metafields + tags + Search & Discovery | Filter **order** only |
| Brand logo/story | ✅ `brand.*` metafields (→ metaobject) | Render only |
| Price hidden | ✅ `override.price_hidden` | Suppress UI + JSON-LD |
| Tearsheet link | ✅ `specs.tearsheet` file | Render download link |
| Vendor collection URL | ✅ smart collection handle = `vendor \| handleize` | `rueiv-vendor-url` resolver |
| Brand breakers in category grids | ✅ optional theme editor blocks | Auto hero from collection image on vendor collections |
| Navigation labels | ✅ menus + frozen copy | **Do not change** |

---

## 6. PDP Edge-Case Verification

| Scenario | Expected behavior | Status |
|----------|-------------------|--------|
| Missing image | Placeholder SVG on cards; gallery shows empty state | ✅ Existing |
| Multiple images | Gallery grid-mix + carousel | ✅ Existing |
| Tearsheet present | Download link in PDP specs area | ✅ **This PR** |
| No tearsheet | Link omitted | ✅ **This PR** |
| Price hidden / zero | No price on cards, PDP, sticky bar, JSON-LD | ✅ **This PR** |
| Price visible | Normal Modiva price rendering | ✅ Existing |
| Single variant | Default variant picker hidden or single option | ✅ Existing |
| Multi variant | Button picker + swatches | ✅ Existing |

---

## 7. Missing Client Content / Assets (flagged)

Per vendor (see `config/represented_vendors.json`):

- [ ] Smart collection exists with handle = `vendor | handleize`
- [ ] Collection featured image for brand hero/breaker fallback
- [ ] `brand.logo` on representative products (or future metaobject)
- [ ] `brand.story` editorial copy (optional)
- [ ] `page.brand` landing page instance (optional marketing)
- [ ] Tearsheet PDFs where vendor supplies spec sheets
- [ ] Search & Discovery: vendor appears in Designer filter values

**10 vendors documented today; 13 additional Hub vendors pending canonical list.**

---

## 8. Theme Changes in This PR

| File | Change |
|------|--------|
| `snippets/rueiv-price-resolver.liquid` | Central price-hidden detection |
| `snippets/rueiv-vendor-url.liquid` | Vendor → collection URL |
| `snippets/price.liquid` | Remove $19.99 fallback; respect price hidden |
| `snippets/pdp-jsonld.liquid` | Omit offers when price hidden |
| `snippets/pdp-tearsheet.liquid` | Tearsheet download from metafield |
| `snippets/pdp-brand-badge.liquid` | Vendor collection links |
| `sections/rueiv-designers-grid.liquid` | Fix vendor URLs |
| `templates/collection.designers.json` | Use designers grid section |
| `templates/product.json` | Add tearsheet block |
| `config/metafield_schema_v2.json` | Add price_hidden, tearsheet definitions |
| `.github/workflows/theme-check.yml` | CI gate |
