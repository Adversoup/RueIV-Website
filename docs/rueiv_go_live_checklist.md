# RueIV 23-Vendor Go-Live Checklist

Use when Hub downstream publish is authorized. Complete in order. **Do not rename customer-visible labels** (wording freeze).

---

## Pre-Publish — Hub & Data

- [ ] Hub canonical vendor list matches `config/represented_vendors.json` (display names exact)
- [ ] All products pass Hub → Shopify mapping per `docs/hub_shopify_field_mapping.md`
- [ ] SKU uniqueness verified; handles deterministic (`slugify(title)-slugify(sku)`)
- [ ] `product_type` values align with frozen categories (Textiles, Wallcovering, Furniture, Lighting, Rugs, Accessories)
- [ ] Taxonomy metafields populated: color_family, end_use, subcategory, material_type where applicable
- [ ] Tags backfilled: `color:*`, `end-use:*`, `lead-time:*`, `new-arrival` per `config/metafield_schema_v2.json`
- [ ] `override.price_hidden` set for quote/trade SKUs; retail SKUs have valid prices
- [ ] `specs.tearsheet` file metafields uploaded where vendor provides PDFs
- [ ] Images: minimum 1 per product; `image.square` normalized where available
- [ ] Product status strategy confirmed (DRAFT batch → ACTIVE at go-live)

---

## Pre-Publish — Shopify Admin (no theme push yet)

- [ ] Run `node scripts/define_metafields_v2.js` — register new definitions (price_hidden, tearsheet)
- [ ] Run `node scripts/create_collections_v2.js` — category/end-use/color collections
- [ ] Run `node scripts/fix_vendors.js` — vendor name normalization + smart collections + Designers menu
- [ ] Search & Discovery: enable filters — Color, Application, Type, Material, Design, Style, Room, **Designer**
- [ ] Search & Discovery: Designer filter sourced from `product.vendor`
- [ ] Verify each vendor smart collection: rule `vendor equals {Display Name}`, handle = `vendor | handleize`
- [ ] Assign collection featured images for all vendor collections
- [ ] Create/update `page.brand` pages for flagship vendors (optional)
- [ ] Predictive search: consider enabling vendor display (`predictive_search_show_vendor`)

---

## Theme Deployment (owner gate)

- [ ] Merge draft PR `cursor/rueiv-23-vendor-shopify-readiness-6140` after CI green
- [ ] Theme Check passes on exact PR head
- [ ] **Owner approval** for theme publish to production theme
- [ ] Publish theme to Shopify (NOT done by agent — manual owner step)
- [ ] Smoke test on preview theme before production publish

---

## Post-Publish — Storefront Verification

### Global
- [ ] Homepage loads; mega menu categories unchanged (wording freeze)
- [ ] Designers / brand navigation resolves for all 23 vendors
- [ ] Search returns products across vendors; Designer filter works on category collections

### Product cards (sample 3 vendors × 2 categories)
- [ ] Vendor name displays
- [ ] Price hidden for trade SKUs; visible for retail SKUs
- [ ] Missing image → placeholder (no broken layout)
- [ ] Square image metafield renders 1:1 when present

### PDP (per category: Textiles, Wallcovering, Furniture, Lighting)
- [ ] Brand badge links to vendor collection (not text search)
- [ ] Specs accordion populated from `specs.*`; no duplicate legacy rows
- [ ] Tearsheet download appears when metafield set; absent when not
- [ ] Multi-image gallery + zoom
- [ ] Variant products: picker renders; single-variant: clean layout
- [ ] JSON-LD: no price in offers for hidden-price products

### Collections
- [ ] `/collections/designers` (or equivalent) shows auto vendor grid
- [ ] Category collection filters: Designer last, searchable at 23+ values
- [ ] Vendor collection pages show brand hero from collection image

---

## Rollback

- [ ] Previous theme version ID documented before publish
- [ ] Hub publish can revert product status to DRAFT without theme rollback
- [ ] Collection/menu changes are idempotent via scripts

---

## Sign-Off

| Role | Name | Date | Gate |
|------|------|------|------|
| Hub / Catalog | | | Data complete |
| Shopify Admin | | | Collections + filters |
| Theme / Dev | | | Theme Check green |
| Owner | | | **GO LIVE authorized** |

**Gate code:** `RUEIV_23_VENDOR_SHOPIFY_THEME_DATA_READINESS_READY_FOR_GO_LIVE_GATE`
