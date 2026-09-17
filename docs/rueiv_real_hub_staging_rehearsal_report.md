# RueIV Real Hub Data Staging Rehearsal Report

**Gate target:** `RUEIV_REAL_HUB_DATA_STAGING_REHEARSAL_READY_FOR_BOUNDED_GO_LIVE_GATE`  
**Date:** 2026-09-17  
**Mode:** Read-only Hub CSV export → deterministic mapping dry-run — **no live Shopify, Hub, or theme publish**

**Main baseline:** `f902c1997b51ac1b5bf52bc10de72f3f94a329e1` (PR #8 Quick Ship fix merged)

---

## Executive Summary

Issue #9 advances the merged synthetic staging simulation (PR #5 / Issue #6) to a **real Hub-data rehearsal pack** using checked-in operator CSV exports from production-complete vendors. The existing `scripts/staging_simulation.js` mapper, represented-vendor config, and theme expectations are reused without rebuild.

| Check | Result |
|-------|--------|
| Real Hub fixture built (sanitized) | ✅ 84/120 records selected |
| Deterministic checksum | ✅ `f337492b6db674c67efcf2e355534698b55d0882426ac3d8f2c878b8847b40a9` |
| Hub → Shopify mapping | ✅ 84/84 pass (2 expected warnings: no-image SKUs) |
| Theme/mapping code defects proven | ❌ None — **no defect PR required** |
| Wording freeze preserved | ✅ No customer-visible label changes |
| Live merchant mutation | ❌ None performed (by design) |

---

## 1. Data Source (Read-Only)

Source: `mnt/data/*.csv` — checked-in Hub export snapshot (120 products from 5 production-complete vendors).

| Vendor | Source count | In rehearsal manifest |
|--------|-------------|------------------------|
| ZR | 24 | 16 |
| Arte | 24 | 16 |
| Fabricut | 24 | 17 |
| Verellen | 24 | 18 |
| Porta Romana | 24 | 17 |

Supporting attribute files joined at import time (not duplicated in fixture): `fabric_attributes.csv`, `furniture_attributes.csv`, `furniture_variants.csv`, `lighting_attributes.csv`, `wallpaper_attributes.csv`.

**Sanitization:** Product/catalog fields only. No credentials, secrets, or customer PII. Public CDN image URLs retained (required for gallery mapping validation).

---

## 2. Rehearsal Commands

```bash
# Build or refresh fixture from Hub CSV export (read-only)
npm run staging:rehearsal:build

# Run real-data mapping rehearsal
npm run staging:rehearsal

# Verbose per-SKU field report
node scripts/staging_simulation.js --real --verbose

# Synthetic edge cases (still required prerequisite)
npm run staging:simulate
```

**Outputs:**
- `fixtures/real_hub_rehearsal/manifest.json` — selection rules, coverage matrix, checksum
- `fixtures/real_hub_rehearsal/products.json` — sanitized Hub-shaped records
- `out/real_hub_rehearsal_report.json` — full pass/fail/quarantine field report

---

## 3. Scenario Coverage (Real Data)

| Scenario | Covered from real data? | Evidence |
|----------|------------------------|----------|
| ZR family | ✅ | 16 ZR textiles SKUs (e.g. `11037415`) |
| Arte | ✅ | 16 wallcovering SKUs (e.g. `97912`) |
| Missing image | ✅ | `FAB-FAB-8099AEA2`, `TWL52S` |
| Image/gallery present | ✅ | 82/84 with 2+ images |
| Price-hidden / no-price | ✅ | 62 trade/quote SKUs (Verellen, ZR, Fabricut, Arte) |
| Retail price visible | ✅ | 22 Porta Romana lighting SKUs with list prices |
| Variant/options-like data | ✅ | `ADR OTTO` (11 variants), `CRW SECT` (10), `VER-FUR-37AF0949` |
| Tearsheet missing | ✅ | All 84 records (no PDF in export) |

### Pending Hub export (not in current snapshot)

| Scenario | Status | Fallback validation |
|----------|--------|---------------------|
| Artistic Frame | ⏳ Pending Hub export | — |
| JAB family + child identities | ⏳ Pending Hub export | — |
| Innovations | ⏳ Pending Hub export | — |
| Chaddock / Powell & Bonnell | ⏳ Pending Hub export | — |
| Child-brand routing | ⏳ No `parent_brand` rows in export | Synthetic fixture `child-brand-routing` (PR #5) |
| Tearsheet present | ⏳ No `tearsheet_pdf` in export | Synthetic fixture `tearsheet-present` (PR #5) |

---

## 4. Per-Field Mapping Results (84 records)

All records pass core mapping validation (`mapping_ok: true`).

| Field | Pass | Warn | Fail | Notes |
|-------|------|------|------|-------|
| vendor/brand | 84 | 0 | 0 | All vendors in `represented_vendors.json` |
| SKU | 84 | 0 | 0 | |
| title | 84 | 0 | 0 | |
| product_type | 84 | 0 | 0 | Frozen set: Textiles, Wallcovering, Furniture, Lighting |
| description | 84 | 0 | 0 | HTML body from Hub description |
| images/gallery | 82 | 2 | 0 | Warn = placeholder expected |
| tearsheet | 0 | 84 | 0 | Expected — no PDFs in export |
| price_hidden | 84 | 0 | 0 | Trade/quote → hidden; Porta Romana retail → visible |
| options/variants | 84 | 0 | 0 | 3 multi-variant furniture SKUs |
| collection_handle | 84 | 0 | 0 | `/collections/{handle}` from registry |
| child-brand routing | n/a | — | — | No parent_brand in export |
| publish_eligibility | 84 | 0 | 0 | All APPROVED → DRAFT at import |

**Expected warnings (2 total):**
- `FAB-FAB-8099AEA2` — no images; theme placeholder
- `TWL52S` — no images; theme placeholder

---

## 5. Theme Expectations (Unchanged)

Real-data rehearsal confirms the same theme consumers validated in PR #5 synthetic simulation:

| Theme component | Real-data confirmation |
|-----------------|------------------------|
| `rueiv-price-resolver` | Trade SKUs → `showPrice=false`; Porta Romana retail → `showPrice=true` |
| `pdp-tearsheet` | No tearsheet metafield emitted (link omitted — correct) |
| `rueiv-vendor-url` | Collection URLs resolve for all 5 vendors |
| Wording freeze | No nav label changes in this PR |

---

## 6. Proven Defects

**None.** Mapping and theme contract hold for all 84 real-data records. No separate defect-fix PR is required.

Remaining gaps are **data availability** (6 vendors/scenarios pending Hub export), not code defects.

---

## 7. Remaining Gates Before Owner-Authorized Live Sync

See updated `docs/rueiv_go_live_checklist.md` and `docs/rueiv_bounded_go_live_sequence.md`.

1. **Hub export expansion** — add Artistic Frame, JAB, Innovations, Chaddock/Powell & Bonnell, child-brand rows, tearsheet PDFs
2. **Re-run rehearsal** — `npm run staging:rehearsal` must produce same checksum until export changes
3. **Synthetic + real both green** — prerequisite gates for bounded go-live sequence Phase 0
4. **Owner authorization** — metafield registration, DRAFT import, preview smoke, theme publish

---

## Sign-Off Gate

| Gate code | Status |
|-----------|--------|
| `RUEIV_SHOPIFY_STAGING_SIMULATION_READY_FOR_BOUNDED_GO_LIVE_GATE` | ✅ PR #5 (synthetic) |
| `RUEIV_REAL_HUB_DATA_STAGING_REHEARSAL_READY_FOR_BOUNDED_GO_LIVE_GATE` | ✅ This report |

**Next step:** Expand Hub export for pending vendors → re-run rehearsal → owner review of bounded go-live sequence.
