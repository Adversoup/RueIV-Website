# RueIV Platform — Production Implementation Plan
## Premium Multi-Vendor AI-Assisted Catalog Platform

---

## 1. Executive Summary

RueIV is a showroom-style Shopify experience representing **5 vendors** (Fabricut, Verellen, Arte, Porta Romana, ZR) across **4 categories** (Fabric, Wallpaper, Furniture, Lighting) with **120 products** live today. The platform must feel like one curated brand despite multi-vendor sourcing.

**Current State:**
- 120 products imported via `productSet` mutation with `specs.*` metafields
- 94 products have normalized 1200×1200 square featured images
- Theme: Modiva (live, ID `156225110147`)
- Existing metafield namespace: `specs` (material, finish, dimensions, etc.)
- No color taxonomy, no automated collections, no category navigation
- No end-use tagging, no brand isolation, no admin override tools

**Target State:**
- Controlled navigation: Category → End Use → Color → Brand
- AI-powered color mapping with confidence scoring + human override
- Category-isolated color filtering (Blue Fabrics ≠ Blue Wallpapers)
- Premium PDP with structured attributes, tear sheets, brand story
- Admin-level override dashboard for all taxonomy assignments
- Visually balanced grids via image normalization + hero weighting

**Vendors:** Fabricut (S. Harris), Verellen, Arte, Porta Romana, ZR
**Categories:** Fabric (48), Furniture (24), Lighting (24), Wallpaper (24)
**Color data quality:** ~65 unique raw values, highly inconsistent ("Linen, Off White / Ivory", "Varies due to natural characteristics", "887", numeric codes, compound strings)

---

## 2. Sprint Plan

### Sprint 1: Data + Taxonomy + Controlled Navigation
**Duration:** 1 week | **Theme:** Foundation

#### Epic 1.1 — Metafield Schema Extension

**Story 1.1.1 — Define taxonomy metafields**
Create new metafield definitions for controlled taxonomy values.

| Namespace | Key | Type | Purpose |
|-----------|-----|------|---------|
| `taxonomy` | `color_family` | `single_line_text_field` | Controlled color family (from defined palette) |
| `taxonomy` | `color_family_secondary` | `single_line_text_field` | Optional second color family |
| `taxonomy` | `color_raw` | `single_line_text_field` | Original vendor color string (preserved) |
| `taxonomy` | `color_confidence` | `number_decimal` | AI mapping confidence 0.0–1.0 |
| `taxonomy` | `color_source` | `single_line_text_field` | `ai` \| `manual` \| `ai+override` |
| `taxonomy` | `end_use` | `list.single_line_text_field` | Controlled end-use tags |
| `taxonomy` | `subcategory` | `single_line_text_field` | e.g., "Bed", "Dining Chair", "Wall Light" |
| `override` | `title` | `single_line_text_field` | Manual title override |
| `override` | `hero_image` | `file_reference` | Manual hero image override |
| `override` | `category` | `single_line_text_field` | Manual category override |
| `override` | `color_family` | `single_line_text_field` | Manual color override (takes priority) |
| `override` | `end_use` | `list.single_line_text_field` | Manual end-use override |
| `override` | `grid_weight` | `number_integer` | 1=normal, 2=featured, 3=hero (for grid) |
| `brand` | `story` | `multi_line_text_field` | Brand story blurb |
| `brand` | `logo` | `file_reference` | Brand logo image |
| `brand` | `tier` | `single_line_text_field` | `flagship` \| `partner` \| `emerging` |

**Technical Tasks:**
- [ ] Create `scripts/define_metafields.js` — registers all definitions via `metafieldDefinitionCreate`
- [ ] Create `config/taxonomy.json` — canonical color families + end-use values
- [ ] Update `docs/metafields.md` with new namespaces

**Acceptance Criteria:**
- All metafield definitions registered in Shopify admin
- Definitions visible in product editor under correct groupings
- Backward compatible — existing `specs.*` fields untouched

---

**Story 1.1.2 — Color taxonomy definition**

Controlled color families (24 max for visual grid):

```
NEUTRALS          WARM               COOL               ACCENT
─────────         ─────────          ─────────           ─────────
White              Cream              Blue                Red
Ivory              Beige              Navy                Orange
Grey               Taupe              Teal                Burgundy
Charcoal           Camel              Green               Gold
Black              Terracotta         Forest              
                   Rust               Sage
                   Blush              Indigo
```

Plus: `Natural`, `Multi` (for multi-color products), `Metallic`

Total: **24 controlled color families**

Each maps from vendor color names:
```
"Linen, Off White / Ivory" → Ivory
"887"                      → (needs AI + image analysis)
"Blue, Navy"               → Navy
"Autumn Gold"              → Gold
"Forest Green"             → Forest
"Mephisto Tobacco"         → Camel
"Bronzed"                  → Metallic
```

**Technical Tasks:**
- [ ] Create `config/color_taxonomy.json` with families + known mappings
- [ ] Create `config/end_use_taxonomy.json` with normalized end-use values:
  - `Upholstery`, `Drapery`, `Multipurpose`, `Performance`, `Outdoor`, `Bedding`, `Decorative`
- [ ] Create `config/subcategory_taxonomy.json` for furniture/lighting subtypes

**Acceptance Criteria:**
- All 24 color families defined with hex swatches
- Mapping table covers 80%+ of existing vendor color strings
- End-use taxonomy covers all fabric usage values from CSV

---

#### Epic 1.2 — Collection Architecture

**Story 1.2.1 — Category collections (automated, rule-based)**

| Collection | Rule | Type |
|-----------|------|------|
| All Fabric | `product_type = Fabric` | Automated |
| All Wallpaper | `product_type = Wallpaper` | Automated |
| All Furniture | `product_type = Furniture` | Automated |
| All Lighting | `product_type = Lighting` | Automated |
| All Trim | `product_type = Trim` | Automated (future) |
| All Rugs | `product_type = Rug` | Automated (future) |

**Story 1.2.2 — End-use collections (tag-based automation)**

| Collection | Rule |
|-----------|------|
| Upholstery Fabrics | `product_type = Fabric AND tag = end-use:upholstery` |
| Drapery Fabrics | `product_type = Fabric AND tag = end-use:drapery` |
| Multipurpose Fabrics | `product_type = Fabric AND tag = end-use:multipurpose` |
| Performance Fabrics | `product_type = Fabric AND tag = end-use:performance` |
| Outdoor Fabrics | `product_type = Fabric AND tag = end-use:outdoor` |

**Story 1.2.3 — Color-isolated collections (category × color)**

Critical: `Blue Fabrics ≠ Blue Wallpapers`

Strategy: **Dual-axis automated collections** using compound tags.

| Collection | Rule |
|-----------|------|
| Blue Fabrics | `product_type = Fabric AND tag = color:blue` |
| Blue Wallpapers | `product_type = Wallpaper AND tag = color:blue` |
| Blue Furniture | `product_type = Furniture AND tag = color:blue` |
| Navy Fabrics | `product_type = Fabric AND tag = color:navy` |
| ... | (24 colors × 4 categories = 96 max) |

Lazy creation: Only create collections where products exist.

**Story 1.2.4 — Brand collections**

| Collection | Rule |
|-----------|------|
| Fabricut / S. Harris | `vendor = Fabricut` |
| Verellen | `vendor = Verellen` |
| Arte | `vendor = Arte` |
| Porta Romana | `vendor = Porta Romana` |
| ZR | `vendor = ZR` |

**Technical Tasks:**
- [ ] Create `scripts/create_collections.js` — automated collection creation via `collectionCreate` mutation
- [ ] Set `product_type` on all 120 products (currently not set — uses `category` from CSV)
- [ ] Create `scripts/tag_products.js` — applies `color:*`, `end-use:*` tags from taxonomy metafields
- [ ] Create color-isolated collections only where data exists (avoid empty collections)

**Acceptance Criteria:**
- 4 category collections created and populated
- End-use collections created for fabric (5+)
- Color × category collections created where products exist
- 5 brand collections created
- Zero empty collections visible to customers
- All rules testable via Shopify admin automated collection preview

---

#### Epic 1.3 — Navigation Structure

**Story 1.3.1 — Main navigation menu**

```
SHOP
├── By Category
│   ├── Fabric
│   ├── Wallpaper
│   ├── Furniture
│   ├── Lighting
│   ├── Trim (coming soon)
│   └── Rugs (coming soon)
│
├── Fabric by End Use
│   ├── Upholstery
│   ├── Drapery
│   ├── Multipurpose
│   ├── Performance
│   └── Outdoor
│
├── By Color
│   ├── [Color swatches grid — category tabs]
│   │   ├── Fabric tab
│   │   ├── Wallpaper tab
│   │   ├── Furniture tab
│   │   └── Lighting tab
│   └── Each swatch links to color×category collection
│
└── By Brand
    ├── Fabricut / S. Harris
    ├── Verellen
    ├── Arte
    ├── Porta Romana
    └── ZR

ABOUT
TRADE PROGRAM
CONTACT
```

**Story 1.3.2 — Color navigation mega-menu**

Custom liquid section: a visual swatch grid grouped by category tab. Each swatch is a circle with the hex color + label, linking to the color-isolated collection.

**Technical Tasks:**
- [ ] Create navigation menu via Shopify Online Store > Navigation (or `menuCreate` API)
- [ ] Create `theme/snippets/mega-menu-colors.liquid` — color swatch grid
- [ ] Create `theme/snippets/mega-menu-brands.liquid` — brand logos grid
- [ ] Update `header.liquid` to support mega-menu sections
- [ ] Create `config/navigation.json` — menu structure definition

**Acceptance Criteria:**
- Main nav renders all 4 tiers (Category, End Use, Color, Brand)
- Color mega-menu shows swatches grouped by category
- Clicking a swatch goes to category-isolated collection
- Responsive: mobile drawer collapses properly
- Empty collections hidden from navigation

---

#### Epic 1.4 — Product Type + Tag Backfill

**Story 1.4.1 — Set product_type on all products**

Currently products have `category` in CSV but `product_type` may not be set in Shopify.

**Story 1.4.2 — Backfill taxonomy tags**

For each product: derive `color:*` and `end-use:*` tags from existing data.

**Technical Tasks:**
- [ ] Create `scripts/backfill_product_type.js`
- [ ] Create `scripts/backfill_tags.js`
- [ ] Run on all 120 products

**Acceptance Criteria:**
- All products have `product_type` set (Fabric/Wallpaper/Furniture/Lighting)
- Fabric products have `end-use:*` tags derived from `fabric_attributes.usage`
- Products with known color mappings have `color:*` tags

---

### Sprint 1 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Automated collection rules too complex | Medium | High | Use simple tag-based rules, validate with preview |
| Color name mapping incomplete | High | Medium | Sprint 2 AI fills gaps; manual fallback |
| Mega-menu breaks mobile | Medium | Medium | Progressive enhancement; test on real devices |
| API rate limiting during backfill | Low | Low | Rate limiter already in place |

---

### Sprint 2: AI Color Mapping + Grid Normalization
**Duration:** 1 week | **Theme:** Intelligence

#### Epic 2.1 — AI Color Mapping Pipeline

**Story 2.1.1 — Color mapping engine**

Pipeline: `vendor_color_string → AI analysis → confidence score → taxonomy assignment`

Architecture:
```
┌─────────────────────────────────────────────────────────┐
│                 Color Mapping Pipeline                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  INPUT                                                   │
│  ├── vendor_color_string (from CSV / metafield)          │
│  ├── product_image (featured image URL)                  │
│  └── category (fabric/wallpaper/furniture/lighting)      │
│                                                          │
│  STAGE 1: Dictionary Lookup                              │
│  ├── Check config/color_taxonomy.json known_mappings     │
│  ├── If exact match → confidence = 1.0                   │
│  └── If partial match → confidence = 0.8                 │
│                                                          │
│  STAGE 2: NLP Fuzzy Match (no API needed)                │
│  ├── Levenshtein distance to known families              │
│  ├── Synonym expansion (ivory→cream→white family)        │
│  └── confidence = 0.6–0.8                                │
│                                                          │
│  STAGE 3: Image Analysis (GPT-4o Vision)                 │
│  ├── Send featured image to GPT-4o                       │
│  ├── Prompt: "What are the dominant color families?"      │
│  ├── Returns: primary + secondary color family            │
│  └── confidence = 0.5–0.9 (based on model certainty)     │
│                                                          │
│  STAGE 4: Consensus                                      │
│  ├── If stages agree → boost confidence                  │
│  ├── If override.color_family exists → use it (1.0)      │
│  ├── Write: taxonomy.color_family                        │
│  ├── Write: taxonomy.color_confidence                    │
│  └── Write: taxonomy.color_source                        │
│                                                          │
│  OUTPUT                                                  │
│  ├── taxonomy.color_family = "Navy"                      │
│  ├── taxonomy.color_family_secondary = "Blue"            │
│  ├── taxonomy.color_confidence = 0.87                    │
│  ├── taxonomy.color_source = "ai"                        │
│  └── tag: color:navy                                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Priority Rules (highest to lowest):**
1. `override.color_family` (manual override — always wins, confidence = 1.0)
2. Dictionary exact match (confidence = 1.0)
3. Dictionary partial match (confidence = 0.8)
4. NLP fuzzy match (confidence = 0.6–0.8)
5. Image analysis (confidence = 0.5–0.9)
6. Unclassified → flag for review (confidence = 0.0)

**Technical Tasks:**
- [ ] Create `lib/color_mapper.js` — 4-stage pipeline
- [ ] Create `lib/nlp_color.js` — fuzzy string matching + synonym expansion
- [ ] Extend `lib/vision.js` — add `classifyProductColor(imageUrl)` using GPT-4o
- [ ] Create `scripts/map_colors.js` — batch run on all products
- [ ] Create `config/color_synonyms.json` — synonym expansion table
- [ ] Create `scripts/color_report.js` — generate confidence report

**Acceptance Criteria:**
- 80%+ products mapped with confidence ≥ 0.7
- All manual overrides respected (confidence = 1.0)
- Low-confidence products (<0.5) flagged in report
- Reprocessing idempotent — doesn't overwrite manual overrides
- Report output: CSV with product, raw color, mapped family, confidence, source

---

**Story 2.1.2 — Reprocessing logic**

```
IF override.color_family exists:
  → SKIP (never overwrite manual)
ELSE IF taxonomy.color_source == "manual":
  → SKIP (was manually set without override namespace)
ELSE:
  → RUN pipeline
  → IF new_confidence > existing_confidence:
    → UPDATE
  → ELSE:
    → KEEP existing
```

CLI: `node scripts/map_colors.js [--force] [--limit N] [--min-confidence 0.5]`

---

#### Epic 2.2 — Grid Balancing Logic

**Story 2.2.1 — Image normalization integration**

Already built: `scripts/image_normalize.js` produces 1200×1200 square images.
All 94 products with images now have uniform square featured images uploaded.

Remaining:
- Ensure all future imports auto-normalize
- Add WebP srcset for performance

**Story 2.2.2 — Hero weighting system**

Products with `override.grid_weight = 3` (hero) get:
- 2× column span in grid
- Larger image loaded (2400px)
- Featured badge overlay

Products with `override.grid_weight = 2` (featured):
- Normal span but priority sort position
- Subtle border or shadow treatment

Default (`grid_weight = 1`):
- Standard grid cell

**Story 2.2.3 — Visual density control**

Collection pages: ensure grid doesn't feel repetitive.

Logic in `card-product.liquid`:
```liquid
{% assign gw = product.metafields.override.grid_weight | default: 1 | plus: 0 %}
{% if gw == 3 %}
  {% assign card_class = 'product-card--hero' %}
  {% assign card_colspan = 2 %}
{% elsif gw == 2 %}
  {% assign card_class = 'product-card--featured' %}
  {% assign card_colspan = 1 %}
{% else %}
  {% assign card_class = '' %}
  {% assign card_colspan = 1 %}
{% endif %}
```

CSS: hero cards span 2 columns, featured get subtle elevation.

**Technical Tasks:**
- [ ] Add `grid_weight` metafield to all products (default = 1)
- [ ] Update `card-product.liquid` with hero/featured logic
- [ ] Update `main-collection-product-grid.liquid` with CSS grid spanning
- [ ] Add hero CSS to theme (subtle, elegant — not "SALE" banner style)
- [ ] Create `scripts/set_hero_products.js` — set 2-3 hero products per collection

**Acceptance Criteria:**
- Hero products render at 2× width in desktop grid
- Featured products sort to prominent positions
- Grid never shows two hero products adjacent
- Mobile: hero products render full-width
- All images uniform 1:1 ratio maintained

---

### Sprint 2 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GPT-4o color classification inaccurate | Medium | Medium | Multi-stage pipeline; never trust single source |
| API key cost for 120 image calls | Low | Low | ~$0.50 total for 120 images |
| Grid hero layout breaks on odd product counts | Medium | Low | CSS fallback to 1× span |
| Color families too granular (24) → sparse collections | Medium | Medium | Merge rare families; show only populated |
| Reprocessing overwrites manual edits | High | High | Override namespace takes absolute priority |

---

### Sprint 3: PDP Premiumization + Admin Override Tools + Polish
**Duration:** 1 week | **Theme:** Experience

#### Epic 3.1 — Premium Product Detail Page

**Story 3.1.1 — PDP layout redesign**

Target: high-end design showroom feel.

```
┌──────────────────────────────────────────────────────┐
│  BREADCRUMB: Home > Fabric > Upholstery > Blue       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────────────────┐  ┌────────────────────────┐ │
│  │                     │  │  BRAND BADGE            │ │
│  │   HERO IMAGE        │  │  FABRICUT / S. HARRIS   │ │
│  │   (1:1 square)      │  │                        │ │
│  │                     │  │  PRODUCT TITLE          │ │
│  │                     │  │  Wind Chime Matte Ivory │ │
│  │                     │  │                        │ │
│  │                     │  │  SKU: 3170002           │ │
│  │                     │  │  Color: Ivory           │ │
│  │                     │  │                        │ │
│  │                     │  │  ─── Specs ───          │ │
│  │                     │  │  Material: 100% Linen   │ │
│  │                     │  │  Width: 54" (137 cm)    │ │
│  │                     │  │  Pattern: Abstract      │ │
│  │                     │  │  Repeat: 54"H × 0"V    │ │
│  │                     │  │  Martindale: 51,000+    │ │
│  │                     │  │  Usage: Drapery, Multi  │ │
│  │                     │  │  Fire: UFAC Class I     │ │
│  │                     │  │  Origin: Italy          │ │
│  │                     │  │                        │ │
│  │                     │  │  [REQUEST SAMPLE]       │ │
│  │                     │  │  [ADD TO PROJECT]       │ │
│  └─────────────────────┘  └────────────────────────┘ │
│                                                       │
│  ┌─ COLLAPSIBLE ────────────────────────────────────┐ │
│  │ ▾ Material & Care                                │ │
│  │ ▾ Dimensions & Repeat                            │ │
│  │ ▾ Downloads (Tear Sheet, Specs PDF)              │ │
│  │ ▾ Brand Story (if available)                     │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ── RELATED PRODUCTS (same color family + category) ──│
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                        │
│  │    │ │    │ │    │ │    │                          │
│  └────┘ └────┘ └────┘ └────┘                        │
│                                                       │
│  ── BRAND STORY BLOCK ────────────────────────────── │
│  [Logo]  "Fabricut has been..."  [EXPLORE BRAND]      │
└──────────────────────────────────────────────────────┘
```

**Technical Tasks:**
- [ ] Create `theme/snippets/pdp-specs-table.liquid` — structured specs grid
- [ ] Create `theme/snippets/pdp-brand-badge.liquid` — brand logo + name
- [ ] Create `theme/snippets/pdp-downloads.liquid` — tear sheet links
- [ ] Create `theme/snippets/pdp-brand-story.liquid` — brand story block
- [ ] Update `main-product.liquid` with new section architecture
- [ ] Update `product.json` template with new block ordering
- [ ] CSS: premium typography, spacing, minimal borders
- [ ] Related products: filter by `taxonomy.color_family` + `product_type`

**Acceptance Criteria:**
- PDP feels like a high-end design showroom, not a Shopify template
- Specs table renders correctly for all 4 categories (different fields per type)
- Brand badge shows vendor name + logo (from `brand.logo` metafield)
- Downloads section shows only if tear sheet metafield exists
- Related products are from same category + color family (not random)
- Mobile: single column, image full-width, specs below

---

**Story 3.1.2 — Category-specific specs rendering**

The specs table must show different fields per product type:

| Category | Display Fields |
|----------|---------------|
| Fabric | Material, Width, Pattern, Weave, Repeat H/V, Martindale, Fire Rating, Usage, Care |
| Wallpaper | Pattern, Roll Width, Roll Length, Repeat H/V, Substrate, Installation, Washability, Fire Rating |
| Furniture | Frame Material, Upholstery, Style, Dimensions, COM Yardage, Assembly |
| Lighting | Fixture Type, Material, Height/Width, Bulb, Voltage, Shade, Dimmable, IP Rating |

Logic: read `product.type` → render matching spec fields from `specs.*` metafields.

---

#### Epic 3.2 — Admin Override Tools

**Story 3.2.1 — Override metafield visibility in Shopify admin**

Shopify allows pinning metafield definitions to the product editor. All `override.*` fields will be pinned to a "Curatorship Overrides" section at the top of the product editor.

**Override fields visible in admin:**

| Field | Behavior |
|-------|----------|
| `override.title` | If set, liquid uses this instead of product title |
| `override.hero_image` | If set, used as featured image instead of product media |
| `override.category` | Overrides product_type for collection membership |
| `override.color_family` | Overrides AI-assigned color (takes absolute priority) |
| `override.end_use` | Overrides derived end-use tags |
| `override.grid_weight` | 1/2/3 — controls grid prominence |

**Liquid priority resolution:**
```liquid
{% assign display_title = product.metafields.override.title
   | default: product.title %}

{% assign display_color = product.metafields.override.color_family
   | default: product.metafields.taxonomy.color_family
   | default: product.metafields.specs.color %}
```

**Technical Tasks:**
- [ ] Register all `override.*` metafield definitions with `pin: true`
- [ ] Create `theme/snippets/pdp-override-resolver.liquid` — resolves display values
- [ ] Test: set override on one product, verify it renders correctly
- [ ] Document override rules in `docs/overrides.md`

**Acceptance Criteria:**
- All override fields visible in Shopify product editor
- Override values always win over AI/automated values
- Removing an override reverts to automated value
- No code changes needed to add an override — just edit in admin

---

**Story 3.2.2 — Reporting & dashboard**

Create scripts that generate admin-visible reports:

| Report | What it Shows |
|--------|---------------|
| Missing Taxonomy | Products without color_family assigned |
| Low Confidence | Products where color_confidence < 0.5 |
| Missing Images | Products without featured image |
| Override Audit | Products with manual overrides (for tracking) |
| Collection Health | Collections with <3 products (too sparse) |

**Technical Tasks:**
- [ ] Create `scripts/taxonomy_report.js` — generates CSV + JSON reports
- [ ] Output to `out/reports/` directory
- [ ] Optional: create a Shopify page with metaobject-driven dashboard

**Acceptance Criteria:**
- Running `node scripts/taxonomy_report.js` generates all 5 reports
- Reports identify specific products needing attention
- CI-ready: can be run in GitHub Actions weekly

---

#### Epic 3.3 — Polish & Performance

**Story 3.3.1 — Filtering UX**

Collection pages: ensure Shopify's native filtering works with our taxonomy.

Storefront filtering uses:
- `product_type` for category
- Tags for color and end-use
- Metafields (if configured in Shopify admin under Online Store > Navigation > Collection filters)

Enable metafield-based filtering:
- `taxonomy.color_family` as filter
- `specs.material` as filter
- `specs.pattern` as filter (fabric)
- `vendor` as filter (brand)

**Story 3.3.2 — Performance optimization**

- [ ] All images: WebP with JPG fallback
- [ ] Lazy loading for below-fold images
- [ ] Preload hero images on collection pages
- [ ] Font subsetting for Inter/custom font
- [ ] Critical CSS inlining for above-fold

**Story 3.3.3 — SEO structured data**

- [ ] JSON-LD Product schema with correct `category`, `brand`, `color`
- [ ] Collection page meta descriptions from collection metafields
- [ ] Canonical URLs for color-isolated collections

---

### Sprint 3 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PDP redesign conflicts with Modiva theme | Med | High | Surgical snippet overrides, not full rewrite |
| Shopify metafield-based filtering limited | Med | Med | Fall back to tag-based filtering |
| Override field proliferation → admin confusion | Low | Med | Clear documentation + limited fields |
| Related products query slow | Low | Low | Cache via metaobject or limit to 4 |

---

## 3. Data Schema Proposal

### Metafield Architecture (3 Namespaces)

```
PRODUCT METAFIELDS
│
├── specs.* (existing — product attributes from CSV)
│   ├── material, finish, dimensions, width, height, ...
│   ├── pattern, weave, composition (fabric)
│   ├── fixture_type, bulb_type, voltage (lighting)
│   ├── frame_material, upholstery (furniture)
│   └── substrate, installation (wallpaper)
│
├── taxonomy.* (NEW — AI-assigned, controlled values)
│   ├── color_family          → "Navy"
│   ├── color_family_secondary → "Blue"
│   ├── color_raw             → "Blue, Navy" (preserved vendor string)
│   ├── color_confidence      → 0.87
│   ├── color_source          → "ai" | "manual" | "ai+override"
│   ├── end_use               → ["Upholstery", "Drapery"]
│   └── subcategory           → "Dining Chair"
│
├── override.* (NEW — human curator overrides, always highest priority)
│   ├── title                 → "Wind Chime — Matte Ivory"
│   ├── hero_image            → [file_reference]
│   ├── category              → "fabric"
│   ├── color_family          → "Ivory"
│   ├── end_use               → ["Drapery"]
│   └── grid_weight           → 2
│
├── brand.* (NEW — vendor branding)
│   ├── story                 → "Fabricut has been..."
│   ├── logo                  → [file_reference]
│   └── tier                  → "flagship"
│
└── image.* (existing — normalized images)
    └── square                → [file_reference] (1200×1200)
```

### Tag Strategy

Tags are used for automated collection rules (Shopify supports tag-based conditions).

Format: `namespace:value` (lowercase, hyphenated)

```
color:navy
color:ivory
color:charcoal
end-use:upholstery
end-use:drapery
end-use:multipurpose
brand-tier:flagship
subcategory:dining-chair
subcategory:wall-light
```

### Category Isolation Logic

Color filtering is always category-scoped:

```
Collection: "Blue Fabrics"
Rule: product_type = "Fabric" AND tag contains "color:blue"

Collection: "Blue Wallpapers"  
Rule: product_type = "Wallpaper" AND tag contains "color:blue"
```

These are SEPARATE collections. A customer browsing "Blue Fabrics" never sees wallpapers, furniture, or lighting.

The navigation color mega-menu shows tabs per category, each with swatch links to the appropriate category-isolated collection.

### Override Priority Resolution

```
DISPLAY VALUE = override.X ?? taxonomy.X ?? specs.X ?? raw_value

Example for color:
  override.color_family  →  if set, use this (confidence=1.0, source="manual")
  taxonomy.color_family  →  if set, AI-assigned value
  specs.color            →  original vendor color string
  ""                     →  flag for review
```

---

## 4. AI Color Mapping System

### Pipeline Architecture

```
lib/color_mapper.js
├── stage1_dictionary(raw_color) → { family, confidence, source }
├── stage2_nlp(raw_color)        → { family, confidence, source }
├── stage3_vision(image_url)     → { family, secondary, confidence, source }
├── consensus(results[])         → { family, secondary, confidence, source }
└── resolve(product)             → writes metafields + tags

config/color_taxonomy.json
├── families[]: { name, hex, keywords[], synonyms[] }
└── known_mappings: { "vendor string" → "family" }

config/color_synonyms.json
└── { "ivory": "Ivory", "off white": "Ivory", "cream": "Cream", ... }
```

### Stage Details

**Stage 1 — Dictionary Lookup (instant, free)**
```javascript
// Known mappings from config
const KNOWN = {
  "Linen, Off White / Ivory": { family: "Ivory", confidence: 1.0 },
  "Blue, Navy": { family: "Navy", confidence: 1.0 },
  "Forest Green": { family: "Forest", confidence: 1.0 },
  "Autumn Gold": { family: "Gold", confidence: 0.95 },
  "Bronzed": { family: "Metallic", confidence: 0.9 },
  "Burnt Stone": { family: "Terracotta", confidence: 0.85 },
  // ... 40+ mappings
};
```

**Stage 2 — NLP Fuzzy Match (instant, free)**
```javascript
// For each word in raw_color, find closest synonym
// "Mephisto Tobacco" → "Tobacco" → closest to Camel family
// Levenshtein distance + synonym expansion
function fuzzyMatch(raw) {
  const words = raw.toLowerCase().split(/[\s,\/]+/);
  for (const word of words) {
    const closest = findClosestSynonym(word, ALL_SYNONYMS);
    if (closest.distance < 3) return closest.family;
  }
  return null;
}
```

**Stage 3 — Vision Analysis (GPT-4o, ~$0.004/image)**
```javascript
const prompt = `Analyze this product image for a high-end design catalog.
What is the PRIMARY dominant color family? Choose exactly from:
${FAMILIES.join(', ')}

Also provide a SECONDARY color family if applicable.
Return JSON: {"primary": "...", "secondary": "...", "confidence": 0.0-1.0}`;
```

**Stage 4 — Consensus**
```javascript
function consensus(dict, nlp, vision) {
  // If all agree → high confidence
  if (dict?.family === nlp?.family === vision?.primary)
    return { family: dict.family, confidence: 0.95 };
  
  // If 2/3 agree → medium-high
  // If only 1 → use highest confidence single result
  // If override exists → always use override
}
```

### Confidence Scoring

| Score | Meaning | Action |
|-------|---------|--------|
| 1.0 | Manual override or exact dictionary match | None needed |
| 0.8–0.99 | High confidence AI match | Auto-apply |
| 0.5–0.79 | Medium confidence | Auto-apply + flag for review |
| 0.3–0.49 | Low confidence | Flag only — don't auto-apply |
| < 0.3 | Unclassifiable | Skip — needs manual assignment |

### Handling Edge Cases

| Case | Color String | Strategy |
|------|-------------|----------|
| Numeric code | "887" | Vision-only → image analysis |
| "Various" | "Various colors available" | Vision + manual review |
| Compound | "887, 883, 880" | Vision + flag multi-color |
| Description | "Varies due to natural characteristics" | Vision + assign "Natural" |
| Metallic | "Sprottle & Gold" | Map to "Metallic" or "Gold" based on image |
| Multi-color | "Ponceau, Ombre, Autumn Gold" | Primary = dominant in image, tag as "Multi" |

---

## 5. Shopify Implementation Blueprint

### Collection Strategy

| Type | Count | Rule Engine | Notes |
|------|-------|-------------|-------|
| Category | 4 (+2 future) | `product_type` automated | Fabric, Wallpaper, Furniture, Lighting |
| End Use | 7 | `product_type + tag` automated | Fabric-only |
| Color × Category | ~40 (populated only) | `product_type + tag` automated | Lazy-created |
| Brand | 5 | `vendor` automated | One per vendor |
| Featured | 1 | Manual | Hand-picked hero products |
| **Total** | **~57** | | Only non-empty created |

### Filtering Configuration

In Shopify admin → Online Store → Navigation → Collection and search filters:

| Filter | Source | Display Type |
|--------|--------|-------------|
| Color Family | `taxonomy.color_family` metafield | Swatch chips |
| Material | `specs.material` metafield | Text list |
| Pattern | `specs.pattern` metafield | Text list |
| Brand | `vendor` | Text list |
| Price | Price range | Slider |
| Availability | Inventory | Toggle |

### Navigation Implementation

```liquid
{%- comment -%} theme/snippets/mega-menu-colors.liquid {%- endcomment -%}
<div class="mega-menu-colors">
  <div class="color-tabs">
    <button data-tab="fabric" class="active">Fabric</button>
    <button data-tab="wallpaper">Wallpaper</button>
    <button data-tab="furniture">Furniture</button>
    <button data-tab="lighting">Lighting</button>
  </div>
  
  <div class="color-swatches" data-tab-content="fabric">
    {%- for color in color_families -%}
      {%- assign collection_handle = 'fabric-' | append: color.slug -%}
      {%- assign coll = collections[collection_handle] -%}
      {%- if coll.products_count > 0 -%}
        <a href="{{ coll.url }}" class="color-swatch">
          <span class="swatch-circle" style="background: {{ color.hex }}"></span>
          <span class="swatch-label">{{ color.name }}</span>
        </a>
      {%- endif -%}
    {%- endfor -%}
  </div>
  <!-- repeat for wallpaper, furniture, lighting -->
</div>
```

### Theme Changes Summary

| File | Change | Sprint |
|------|--------|--------|
| `config/settings_data.json` | `pcard_image_ratio: "1/1"` | Done ✓ |
| `snippets/card-product.liquid` | Hero weight logic + grid spanning | S2 |
| `snippets/mega-menu-colors.liquid` | New — color swatch navigation | S1 |
| `snippets/mega-menu-brands.liquid` | New — brand logo grid | S1 |
| `snippets/pdp-specs-table.liquid` | New — category-specific specs | S3 |
| `snippets/pdp-brand-badge.liquid` | New — brand badge component | S3 |
| `snippets/pdp-downloads.liquid` | New — tear sheet download | S3 |
| `snippets/pdp-brand-story.liquid` | New — brand story block | S3 |
| `snippets/pdp-override-resolver.liquid` | New — override resolution logic | S3 |
| `sections/main-product.liquid` | PDP restructure + new blocks | S3 |
| `sections/main-collection-product-grid.liquid` | Hero grid CSS | S2 |
| `sections/header.liquid` | Mega-menu support | S1 |
| `templates/product.json` | New block ordering | S3 |
| `templates/collection.json` | Filter configuration | S1 |

---

## 6. Risk & Mitigation

### Critical Risks

| # | Risk | Impact | Probability | Mitigation |
|---|------|--------|-------------|------------|
| 1 | **Color taxonomy too granular** — 24 families create sparse collections | High | Medium | Start with 15 families, merge when <3 products per collection |
| 2 | **AI misclassifies colors** — product in wrong collection | High | Medium | Confidence threshold + override system + weekly report |
| 3 | **Override system confusing** — buyers/admins conflict | Medium | Low | Clear naming (`override.*`), documentation, training |
| 4 | **Mega-menu performance** — too many collections loaded | Medium | Medium | Lazy load tabs, cache collection counts, precompute in JSON |
| 5 | **Image normalization edge cases** — products without images | Low | Known | 26 products missing images → vendor asset request workflow |
| 6 | **Theme update conflicts** — Modiva theme updates break customizations | High | Low | All changes in snippets, not core sections; version-controlled |
| 7 | **Shopify API rate limits** — backfill scripts throttled | Low | Low | Rate limiter already proven at 120 products |
| 8 | **Vendor onboarding inconsistency** — new vendors have different data shapes | Medium | High | Config-driven import mapper per vendor |

### Dependency Chain

```
Sprint 1 (Foundation)
  └─ Metafield definitions ← Sprint 2 AI needs these to write to
  └─ Collections created ← Sprint 2 tags populate them
  └─ Navigation built ← Sprint 3 PDP links back to filtered collections

Sprint 2 (Intelligence)
  └─ Color mapping done ← Sprint 3 PDP shows mapped colors
  └─ Grid weighting set ← Sprint 3 collection pages use it

Sprint 3 (Experience)
  └─ Depends on S1 + S2 complete
  └─ Can start PDP work in parallel with S2 (no dependency on AI mapping)
```

---

## 7. Concrete Repo Files to Create

### Sprint 1 — Immediate

```
config/
├── color_taxonomy.json       # 24 color families with hex, keywords, synonyms
├── end_use_taxonomy.json     # Normalized end-use values
├── subcategory_taxonomy.json # Furniture/lighting subtypes
├── color_synonyms.json       # Word → family mapping table
└── navigation.json           # Menu structure definition

scripts/
├── define_metafields.js      # Register taxonomy.*, override.*, brand.* definitions
├── backfill_product_type.js  # Set product_type on all 120 products
├── backfill_tags.js          # Apply color:*, end-use:* tags from taxonomy
├── create_collections.js     # Create all automated collections
└── validate_taxonomy.js      # Validate all products have required taxonomy fields

docs/
├── overrides.md              # How to use override metafields
└── taxonomy.md               # Color family definitions + end-use values
```

### Sprint 2 — AI Pipeline

```
lib/
├── color_mapper.js           # 4-stage color mapping pipeline
└── nlp_color.js              # Fuzzy string match + synonym expansion

scripts/
├── map_colors.js             # Batch run color mapper on all products
├── color_report.js           # Generate confidence/gap reports
└── set_hero_products.js      # Set grid_weight on featured products

theme/snippets/
├── mega-menu-colors.liquid   # Color swatch navigation component
└── mega-menu-brands.liquid   # Brand logo navigation component
```

### Sprint 3 — PDP + Admin

```
theme/snippets/
├── pdp-specs-table.liquid    # Category-specific specs rendering
├── pdp-brand-badge.liquid    # Brand logo + name component
├── pdp-downloads.liquid      # Tear sheet download section
├── pdp-brand-story.liquid    # Brand story block
└── pdp-override-resolver.liquid # Override priority resolution

scripts/
├── taxonomy_report.js        # Full taxonomy health report
└── export_overrides.js       # Export all overrides for audit

out/reports/
├── missing_taxonomy.csv
├── low_confidence.csv
├── missing_images.csv
├── override_audit.csv
└── collection_health.csv
```

---

## Appendix A: Color Taxonomy Reference

| Family | Hex | Keywords |
|--------|-----|----------|
| White | `#FFFFFF` | white, snow, chalk, plaster |
| Ivory | `#FFFFF0` | ivory, off-white, eggshell, cream-white |
| Cream | `#FFFDD0` | cream, vanilla, butter |
| Beige | `#D4C5A9` | beige, sand, oat, linen |
| Taupe | `#8B7D6B` | taupe, mushroom, stone |
| Camel | `#C19A6B` | camel, tan, tobacco, caramel, khaki |
| Grey | `#808080` | grey, gray, silver, ash, fog |
| Charcoal | `#36454F` | charcoal, anthracite, slate, smoke |
| Black | `#000000` | black, onyx, jet, ebony |
| Blush | `#DE5D83` | blush, rose, pink, petal, mauve |
| Red | `#B22222` | red, crimson, scarlet, vermilion, ponceau |
| Burgundy | `#800020` | burgundy, wine, merlot, oxblood, claret |
| Orange | `#CC5500` | orange, spice, paprika, cinnamon |
| Terracotta | `#CC4E2C` | terracotta, clay, brick, rust, burnt |
| Gold | `#CFB53B` | gold, amber, ochre, honey, saffron |
| Rust | `#B7410E` | rust, sienna, cider, harvest |
| Green | `#228B22` | green, emerald, olive, leaf |
| Forest | `#013220` | forest, pine, myrtle, hunter |
| Sage | `#BCB88A` | sage, moss, lichen, celadon |
| Blue | `#4169E1` | blue, sky, cobalt, azure, cornflower |
| Navy | `#000080` | navy, midnight, marine, admiral |
| Teal | `#008080` | teal, turquoise, aqua, peacock |
| Indigo | `#3F00FF` | indigo, violet, purple, plum, amethyst |
| Natural | `#C4A882` | natural, raw, undyed, organic |
| Multi | `#gradient` | multi, multicolor, rainbow, varied |
| Metallic | `#C0C0C0` | metallic, bronze, copper, brass, gilt |

---

## Appendix B: Current Data Gaps

| Gap | Affected Products | Resolution |
|-----|-------------------|------------|
| No image | 26 products | Request from vendor |
| Color = "" (empty) | ~15 products | AI vision (Sprint 2) |
| Color = numeric code | ~5 products | AI vision (Sprint 2) |
| Color = "Various/Varies" | ~8 products | AI vision + manual review |
| No price set | ~120 products | Trade program pricing TBD |
| No end-use (furniture/lighting) | 48 products | N/A (end-use is fabric-specific) |
| No tearsheet | 120 products | Vendor asset collection |
