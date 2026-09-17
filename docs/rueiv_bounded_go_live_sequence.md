# RueIV Bounded Go-Live Sequence & Rollback Checklist

Use when Hub downstream publish is authorized and staging simulation gate is green.  
**Gate prerequisites:**
- `RUEIV_SHOPIFY_STAGING_SIMULATION_READY_FOR_BOUNDED_GO_LIVE_GATE` (synthetic)
- `RUEIV_REAL_HUB_DATA_STAGING_REHEARSAL_READY_FOR_BOUNDED_GO_LIVE_GATE` (real Hub CSV export)

**Hard rule:** No step in this sequence may be executed by automation without explicit owner authorization at the publish gate (Step 7).

---

## Phase 0 — Pre-Flight (read-only verification)

| # | Action | Owner | Rollback needed? |
|---|--------|-------|------------------|
| 0.1 | Confirm synthetic staging simulation green: `npm run staging:simulate` | Dev | N/A |
| 0.1b | Confirm real Hub rehearsal green: `npm run staging:rehearsal` | Dev | N/A |
| 0.1c | Verify rehearsal checksum matches `fixtures/real_hub_rehearsal/manifest.json` | Dev | N/A |
| 0.2 | Confirm PR #5 merged; Quick Ship (#8) on main; Theme Check CI green | Dev | N/A |
| 0.3 | Document current live theme ID: `shopify theme list` | Dev | **Required for rollback** |
| 0.4 | Confirm Hub canonical vendor list matches `config/represented_vendors.json` | Catalog | N/A |
| 0.5 | Confirm wording freeze — no nav label changes in diff | Dev | N/A |

---

## Phase 1 — Data Prep (Hub / CSV, bounded batch)

| # | Action | Script / tool | Env | Rollback |
|---|--------|---------------|-----|----------|
| 1.1 | Export Hub batch — max **N products per sync** (recommend 50–100 first batch) | Hub export | — | Revert batch SKUs to DRAFT in Hub |
| 1.2 | Validate batch against mapping doc | `npm run staging:rehearsal` (refresh fixture if export changed) | — | Fix Hub payload |
| 1.3 | Import batch as **DRAFT** | `DEFAULT_STATUS=DRAFT node scripts/import_shopify.js` | `LIMIT=N` | Set products DRAFT via Admin or script |
| 1.4 | Verify handles deterministic | Spot-check 5 SKUs | — | Update handles before ACTIVE |
| 1.5 | Backfill filter tags for batch | `node scripts/backfill_filter_tags.js` | `LIMIT=N` | Tags idempotent — remove via script if needed |

**Checkpoint:** Batch products visible in Admin as DRAFT; no storefront change yet.

---

## Phase 2 — Metafield Definition Registration

| # | Action | Command | Live mutation? |
|---|--------|---------|----------------|
| 2.1 | Dry-run metafield registration | `node scripts/define_metafields_v2.js --dry-run` | No |
| 2.2 | Register new defs (`price_hidden`, `tearsheet`) | `node scripts/define_metafields_v2.js` | **Yes — Admin only** |
| 2.3 | Verify defs in Admin → Settings → Custom data | Manual | — |

**Rollback:** Metafield definitions can remain registered (non-destructive). Product metafield values cleared per SKU if needed.

---

## Phase 3 — Bounded Product Sync (incremental)

| # | Action | Notes |
|---|--------|-------|
| 3.1 | Sync batch 1 (flagship vendors: Fabricut, Arte, Verellen, Porta Romana, ZR) | ~50 SKUs |
| 3.2 | Smoke verify in **unpublished preview theme** | See Phase 5 smoke list |
| 3.3 | Sync batch 2 (partner vendors) | Remaining documented vendors |
| 3.4 | Sync batch 3 (pending Hub vendors) | After registry updated |
| 3.5 | Set `ACTIVE` only after batch smoke pass | `DEFAULT_STATUS=ACTIVE` or bulk Admin |

**Bounded rule:** Do not ACTIVE entire catalog in one operation. Activate per verified batch.

**Rollback per batch:** Bulk set status → DRAFT for batch SKU list. Storefront hides DRAFT products immediately.

---

## Phase 4 — Collection & Filter Verification

| # | Action | Command |
|---|--------|---------|
| 4.1 | Create/verify category collections | `node scripts/create_collections_v2.js` |
| 4.2 | Create/verify vendor smart collections | `node scripts/fix_vendors.js` |
| 4.3 | Assign collection featured images (all vendor collections) | Manual Admin or script |
| 4.4 | Search & Discovery: enable filters — Color, Application, Type, Material, Design, Style, Room, **Designer** | Manual Admin |
| 4.5 | Verify Designer filter sourced from `product.vendor` | Manual |
| 4.6 | Spot-check vendor collection URLs: `/collections/{handle}` | Manual — 3 vendors |

**Rollback:** Collection scripts are idempotent. Re-run with previous config or delete collections via Admin API if needed.

---

## Phase 5 — Theme Preview Smoke (NOT production publish)

Run on **unpublished preview theme** with PR #5 code pushed to development theme.

### Global
- [ ] Homepage loads; mega menu categories unchanged (wording freeze)
- [ ] `/collections/designers` shows auto vendor grid (not 5 hardcoded breakers)

### Per edge case (sample SKUs from staging fixtures)
- [ ] Trade SKU: no price on card, PDP, JSON-LD
- [ ] Retail SKU: price visible
- [ ] No-image SKU: placeholder, no broken layout
- [ ] Multi-image SKU: gallery renders
- [ ] Tearsheet SKU: download link present
- [ ] No-tearsheet SKU: link absent
- [ ] Multi-variant SKU: picker renders
- [ ] Vendor badge links to `/collections/{handle}` (not text search)

### Collections
- [ ] Category collection: Designer filter last, searchable
- [ ] Vendor collection: brand hero from featured image

**Checkpoint:** All smoke items pass on preview theme before owner publish gate.

---

## Phase 6 — Owner Publish Gate (manual only)

| # | Action | Who | Required |
|---|--------|-----|----------|
| 6.1 | Review staging simulation report | Owner | ✅ |
| 6.2 | Review bounded batch ACTIVE list | Owner | ✅ |
| 6.3 | Approve theme publish to production | Owner | ✅ |
| 6.4 | Publish theme: `shopify theme push` or Admin publish | Owner | ✅ |
| 6.5 | Post-publish smoke on live storefront (5 min) | Dev + Owner | ✅ |

**This step is NOT executed by Cloud Agent.**

---

## Rollback Playbook

### Scenario A — Bad product data (no theme issue)

1. Bulk set affected SKUs → DRAFT in Shopify Admin
2. Revert Hub publish for affected SKUs
3. Re-import corrected batch with `DEFAULT_STATUS=DRAFT`
4. Re-smoke on preview theme before re-ACTIVE

**Time to recover:** Minutes (DRAFT is immediate)

### Scenario B — Theme regression after publish

1. Revert to documented previous theme ID (Phase 0.3)
   - Admin → Online Store → Themes → Actions → Publish previous version
2. Products remain DRAFT or ACTIVE independently of theme
3. Fix theme on development theme; re-smoke; re-publish with owner approval

**Time to recover:** Minutes (theme revert is one-click)

### Scenario C — Collection/filter misconfiguration

1. Re-run collection scripts (idempotent)
2. Or manually adjust Search & Discovery filter config
3. No theme rollback needed

### Scenario D — Metafield definition error

1. Definitions are non-destructive — fix product metafield values per SKU
2. Re-run import for affected batch
3. Do not delete metafield definitions unless owner approves (may affect existing products)

---

## Sign-Off Matrix

| Phase | Gate | Sign-off |
|-------|------|----------|
| 0 | Staging simulation green | Dev |
| 1–3 | Batch data verified | Catalog + Dev |
| 4 | Collections + filters | Shopify Admin |
| 5 | Preview smoke pass | Dev |
| 6 | **GO LIVE** | **Owner** |

---

## Quick Reference Commands

```bash
# Staging simulation (always safe)
npm run staging:simulate
npm run staging:rehearsal
node scripts/staging_simulation.js --real --verbose

# Theme check (local)
npm run theme-check

# Metafield registration (go-live only — requires owner auth)
node scripts/define_metafields_v2.js --dry-run
node scripts/define_metafields_v2.js

# Bounded import (go-live only)
DEFAULT_STATUS=DRAFT LIMIT=50 node scripts/import_shopify.js
```

---

## Related Documents

- `docs/rueiv_staging_simulation_report.md` — synthetic simulation results
- `docs/rueiv_real_hub_staging_rehearsal_report.md` — real Hub CSV rehearsal results
- `fixtures/real_hub_rehearsal/` — deterministic sanitized fixture + checksum
- `docs/hub_shopify_field_mapping.md` — field mapping contract
- `docs/rueiv_go_live_checklist.md` — PR #5 go-live checklist
- `docs/brand_template_rules.md` — vendor/collection rules
- `config/represented_vendors.json` — vendor registry
