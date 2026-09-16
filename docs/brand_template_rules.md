# Brand & Collection Template Rules — Represented Vendor Set

Rules for configuring brand presentation across 23 represented vendors. **Theme code is vendor-agnostic** — all rules are data and merchant-config driven.

---

## Template Assignment

| Page type | Shopify template | When to use |
|-----------|-------------------|-------------|
| Vendor product listing | `collection.brand-top` | Automated smart collection where `vendor equals {name}` |
| All designers index | `collection.designers` | Master vendor index collection (all represented products) |
| Brand marketing landing | `page.brand` | Optional editorial page per flagship vendor |

---

## Vendor Registry

Source of truth: `config/represented_vendors.json`

Each vendor entry requires:

```json
{
  "display_name": "Exact Shopify vendor string",
  "handle": "shopify-collection-handle",
  "tier": "flagship | partner | emerging",
  "categories": ["Textiles", "..."],
  "status": "live | pending"
}
```

**Handle convention:** `display_name | handleize` unless historically overridden (e.g., `ZR` → `zr`, `Fabricut` → `fabricut`).

---

## Smart Collection Rule (required per vendor)

```
IF vendor equals "{display_name}"
THEN collection membership automatic
```

Sort order: `best-selling` (default) or `created-desc` for new-arrival emphasis.

---

## Brand Breaker Blocks (optional)

On **category** collection templates (`collection.json`, `collection.brand-top.json`), brand breaker blocks in `main-collection-product-grid` promote vendors within mixed grids.

- Configured via Theme Editor → add `brand_breaker` block → select vendor collection
- **Not required for every vendor** — vendor collection pages auto-use collection featured image as hero
- For 23 vendors: add breakers only for flagship campaigns; do not hardcode in JSON

---

## PDP Brand Blocks

| Metafield | Required | Renders when |
|-----------|----------|--------------|
| `brand.logo` | Optional | Logo badge instead of text vendor name |
| `brand.story` | Optional | Editorial brand story card + "Explore {vendor}" CTA |
| `brand.tier` | Optional | "Flagship Collection" badge when `flagship` |
| `specs.tearsheet` | Optional | PDF download link in specs area |

CTA links resolve via `snippets/rueiv-vendor-url.liquid` → `/collections/{handle}`.

---

## Missing Assets Flag

When onboarding a new Hub vendor, flag in Hub/onboarding tracker if any are missing:

| Asset | Impact if missing |
|-------|-------------------|
| Vendor smart collection | Brand links 404; filter broken |
| Collection featured image | Generic hero on vendor collection |
| brand.logo | Text-only badge (acceptable) |
| brand.story | Brand story block hidden (acceptable) |
| specs.tearsheet | No download link (acceptable for non-spec categories) |
| page.brand content | No marketing landing (acceptable) |

---

## Navigation (wording freeze)

- Primary nav: **category-first** (Textiles, Wallcovering, Furniture, Lighting, Rugs, Accessories, The Vibe Studio)
- Vendor appears only as **Designer filter** on collection pages and in Designers submenu
- Do not add vendor names to primary nav without owner approval

---

## Hub Onboarding Sequence

1. Hub emits product with canonical `vendor` display name
2. Create/verify smart collection (script or Hub publish)
3. Backfill brand metafields on representative SKUs (or metaobject when available)
4. Upload collection featured image
5. Optionally create `page.brand` and brand breaker block
6. Verify vendor appears in Search & Discovery Designer filter after first product indexed
