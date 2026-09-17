# RueIV Shopify Staging Simulation Report

**Gate target:** `RUEIV_SHOPIFY_STAGING_SIMULATION_READY_FOR_BOUNDED_GO_LIVE_GATE`  
**Date:** 2026-09-17  
**Mode:** Dry-run / synthetic payloads — **no live Shopify, Hub, or theme publish**

---

## Executive Summary

This report advances draft PR #5 (`Weekend sprint — incoming 23-vendor Shopify readiness`) into a **staging/go-live simulation pack**. PR #5 theme and data readiness work is reused without rebuilding theme structure. Hub → Shopify mapping is validated deterministically across 10 synthetic edge-case fixtures. Represented-vendor rules and wording freeze are preserved.

| Check | Result |
|-------|--------|
| PR #5 reconciled with `main` | ✅ Clean merge (no conflicts) |
| Hub → Shopify mapping deterministic | ✅ 10/10 fixtures pass |
| Edge cases (price, image, tearsheet, variants) | ✅ Theme expectations documented |
| Represented vendor registry | ✅ 10 live + 13 pending Hub vendors |
| Metafield import order confirmed | ✅ Dry-run only — not registered live |
| Wording freeze preserved | ✅ No customer-visible label changes |
| Live merchant mutation | ❌ None performed (by design) |

---

## 1. Drift Reconciliation — PR #5 vs Main / Phase 2 / Quick Ship

### PR #5 vs `main` (current baseline)

PR #5 branch (`cursor/rueiv-23-vendor-shopify-readiness-6140`) is **based on latest `main`** (`ed1e2c5` — brand-top collection template, per-designer brand breaker matching). Merge is clean with no conflicts.

PR #5 adds 21 files (+1263 / −121 lines) on top of main:

- Theme snippets: `rueiv-price-resolver`, `rueiv-vendor-url`, `pdp-tearsheet`
- Theme fixes: price.liquid, pdp-jsonld, pdp-brand-badge/story, designers grid
- Config/docs: `represented_vendors.json`, mapping docs, go-live checklist
- CI: `.github/workflows/theme-check.yml`

**No conflict** with main's `collection.brand-top.json` hardcoded breakers — PR #5 only changes `collection.designers.json` to auto-grid (correct for 23 vendors).

### Phase 2 draft (PR #2)

| Area | Phase 2 state | PR #5 / staging state | Resolution |
|------|---------------|----------------------|------------|
| `collection.designers.json` | Banner + product-grid with 5 hardcoded breakers | Auto `rueiv-designers-grid` | **Keep PR #5** — scales to 23 vendors |
| `index.json` | Homepage section ordering + assets | Unchanged on PR #5 head | Merge Phase 2 homepage content at owner gate |
| Homepage assets | 14 new image files | Not in PR #5 | Orthogonal — content-only |

### Quick Ship draft (PR #3)

| Area | Quick Ship state | Impact on mapping |
|------|------------------|-------------------|
| `rueiv-project-ready.liquid` | Scroller loop fix (clone count) | None — UI only |
| `index.json` | Quick Ship section config | None — content only |

**Recommendation:** Merge Quick Ship scroller fix before go-live. Merge Phase 2 homepage assets separately. Do not revert PR #5 designers auto-grid.

---

## 2. Hub → Shopify Mapping Validation

Source of truth: `docs/hub_shopify_field_mapping.md`

Run simulation:

```bash
node scripts/staging_simulation.js --verbose
```

Output: `out/staging_simulation_report.json`

### Mapping rules verified

| Hub field | Shopify target | Theme consumer |
|-----------|----------------|----------------|
| `canonical_vendor` | `product.vendor` | Cards, filters, vendor URL |
| `title` + `sku` | `handle` = slugify(title)-slugify(sku) | URL routing |
| `category` / `product_type` | `productType` (frozen set) | Collections, filters |
| `price_authority` | `override.price_hidden` | `rueiv-price-resolver` |
| `images[]` | product media (first = featured) | Gallery, cards |
| `tearsheet_pdf` | `specs.tearsheet` | `pdp-tearsheet` |
| `variants[]` | option1 + variant SKU/price | Variant picker |
| `brand.collection_handle` | smart collection handle | `rueiv-vendor-url` |

**Import priority:** `override.*` > `taxonomy.*` > `specs.*` > `rueiv.*` > native Shopify fields

---

## 3. Synthetic Edge-Case Fixtures (10 scenarios)

| Fixture ID | Scenario | Theme expectation |
|------------|----------|-------------------|
| `retail-single-image` | Retail price, 1 image | Price visible; featured image renders |
| `trade-no-price` | Trade authority, $0 | Price hidden on cards, PDP, JSON-LD |
| `no-image` | Empty images array | Placeholder SVG; no layout break |
| `multi-image-gallery` | 3 images | Gallery grid-mix; first = featured |
| `tearsheet-present` | PDF metafield set | Download link in PDP specs area |
| `tearsheet-missing` | No PDF | Link omitted |
| `variant-product` | 3 size variants | Button picker; per-variant SKU |
| `child-brand-routing` | Altura under Jeffrey Michaels | `product.vendor` = child name; registry lookup |
| `vendor-collection-fallback` | Unknown vendor | URL → `?filter.p.vendor=` fallback |
| `quick-ship-lead-time` | Quick Ship | Tag + `taxonomy.lead_time` metafield |

All fixtures pass mapping validation. Expected warnings (not errors) for pending/unknown vendors and missing images.

---

## 4. Represented Vendor Rules

Source: `config/represented_vendors.json`

- **10 vendors documented** with exact `display_name`, `handle`, `tier`, `categories`
- **13 additional** Jeffrey Michaels represented vendors pending Hub canonical list
- Theme is **vendor-agnostic** — no per-vendor Liquid branches

### Wording freeze (preserved exactly)

Primary navigation labels must remain:

- Textiles
- Wallcovering
- Furniture
- Lighting
- Rugs
- Accessories
- The Vibe Studio

Vendor appears only as **Designer** filter (last position) and in Designers submenu — not in primary nav.

### Collection template rules

| Template | Use |
|----------|-----|
| `collection.brand-top` | Per-vendor smart collection |
| `collection.designers` | Master vendor index (auto-grid) |
| `page.brand` | Optional flagship marketing page |

See `docs/brand_template_rules.md`.

---

## 5. Metafield Definitions — Go-Live Order (NOT registered live)

Confirmed from `config/metafield_schema_v2.json`. **Not executed against live store.**

### New definitions to register at go-live

| Namespace | Key | Type | Purpose |
|-----------|-----|------|---------|
| `override` | `price_hidden` | boolean | Suppress price UI + JSON-LD |
| `specs` | `tearsheet` | file_reference | PDP PDF download |

### Bounded import sequence

1. `node scripts/define_metafields_v2.js` — register definitions
2. Hub downstream publish / CSV import with metafield payloads
3. `node scripts/backfill_filter_tags.js` — color/end-use tags
4. `node scripts/create_collections_v2.js` — category collections
5. `node scripts/fix_vendors.js` — vendor smart collections
6. Search & Discovery admin — enable Designer filter (manual)

---

## 6. Theme Readiness (PR #5 — no rebuild)

| Component | Status |
|-----------|--------|
| Price hidden | ✅ `rueiv-price-resolver` + `price.liquid` |
| Tearsheet | ✅ `pdp-tearsheet` in `product.json` |
| Vendor URL | ✅ `rueiv-vendor-url` with collection fallback |
| Designers grid | ✅ Auto vendor dedupe |
| JSON-LD | ✅ Offers omitted when price hidden |
| Theme Check CI | ✅ Workflow on PR head |

---

## 7. Explicit Boundaries (observed)

- ❌ No theme publish to Shopify
- ❌ No live product/collection/menu/metafield mutation
- ❌ No Hub downstream publish
- ❌ No pricing/media production writes

---

## Sign-Off Gate

| Gate code | Status |
|-----------|--------|
| `RUEIV_23_VENDOR_SHOPIFY_THEME_DATA_READINESS_READY_FOR_GO_LIVE_GATE` | ✅ PR #5 |
| `RUEIV_SHOPIFY_STAGING_SIMULATION_READY_FOR_BOUNDED_GO_LIVE_GATE` | ✅ This report |

**Next step:** Owner review → bounded go-live sequence (`docs/rueiv_bounded_go_live_sequence.md`)
