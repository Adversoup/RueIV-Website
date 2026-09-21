# Hub → Shopify Field Mapping — RueIV 23-Vendor Catalog

Deterministic mapping from Consortium Hub canonical product fields to Shopify Admin / theme consumption. Import scripts and Hub downstream publish MUST follow this contract.

**Wording freeze:** Hub must emit Shopify-native category and navigation labels already frozen on the storefront. Do not remap customer-visible taxonomy strings in theme code.

---

## Identity & Core Product

| Hub Field | Shopify Target | Type | Rules |
|-----------|----------------|------|-------|
| `canonical_vendor` / `brand` | `product.vendor` | string | Exact display name; must match `config/represented_vendors.json` |
| `title` | `product.title` | string | Override via `override.title` metafield when curators edit |
| `sku` | `variants[0].sku` | string | Primary identity key; handle = `slugify(title)-slugify(sku)` |
| `product_type` / `category` | `product.productType` | string | Map to frozen types: Textiles, Wallcovering, Furniture, Lighting, Rugs, Accessories |
| `status` | `product.status` | enum | `APPROVED` → env `DEFAULT_STATUS` (DRAFT until go-live); else DRAFT |
| `description_html` | `product.descriptionHtml` | html | Sanitized HTML body |
| `tags` | `product.tags` | string[] | See tag conventions below |

---

## Pricing Authority

| Hub Field | Shopify Target | Rules |
|-----------|----------------|-------|
| `price` | `variants[0].price` | Decimal string; store currency only |
| `compare_at_price` | `variants[0].compareAtPrice` | Optional |
| `price_authority` | `override.price_hidden` | `quote` \| `hidden` \| `trade` → `true`; `retail` → `false` |
| *(derived)* | Theme behavior | When `price_hidden=true` OR variant price ≤ 0: theme suppresses price UI and JSON-LD offers |

**Theme never invents fallback prices.** Zero/blank prices render as hidden, not `$19.99`.

---

## Media & Gallery

| Hub Field | Shopify Target | Rules |
|-----------|----------------|-------|
| `images[]` | `product.media` / `images` | Ordered gallery; first = featured |
| `hero_image_override` | `override.hero_image` | file_reference; wins over first image on cards when set |
| `square_image` | `image.square` | file_reference; 1:1 card normalization |
| `tearsheet_pdf` / `spec_pdf` | `specs.tearsheet` | file_reference; PDP download link when present |

---

## Availability & Status

| Hub Field | Shopify Target | Rules |
|-----------|----------------|-------|
| `availability` | `product.available` / inventory | Standard Shopify inventory or `continue selling when OOS` |
| `lead_time` | `specs.lead_time` + tag `lead-time:Quick Ship` | When Quick Ship, also set `taxonomy.lead_time` = `Quick Ship` |

---

## Specifications (category-specific)

All spec attributes map to `specs.*` namespace (`single_line_text_field` unless noted). See `docs/data_contract.md` for full CSV column mapping.

| Category | Required Hub attrs → `specs.*` |
|----------|-------------------------------|
| Textiles | composition, width, pattern, weave, repeat_h, repeat_v, martindale, usage, fire_rating, care |
| Wallcovering | pattern, roll_width, roll_length, repeat_h, repeat_v, substrate, installation, washability, fire_rating |
| Furniture | frame_material, upholstery, style, dimensions, com_yardage, assembly_required |
| Lighting | fixture_type, constructed_from, height, width_diameter, bulb_type, voltage, shade_material, dimmable, ip_rating |

Legacy Hub JSON blobs may also populate `rueiv.dimensions`, `rueiv.category_attributes`, `rueiv.attributes` — theme deduplicates with `specs.*` priority.

---

## Taxonomy & Filters (Search & Discovery)

| Hub Field | Shopify Target | Filter label (frozen) |
|-----------|----------------|----------------------|
| `color_family` | `taxonomy.color_family` + tag `color:{slug}` | Color |
| `end_use[]` | `taxonomy.end_use` + tag `end-use:{name}` | Application |
| `subcategory` | `taxonomy.subcategory` | Type |
| `collection` | `taxonomy.collection` | Collection |
| `material_type[]` | `taxonomy.material_type` + tag `material:{name}` | Material |
| `design` | `taxonomy.design` | Design |
| `style` | `taxonomy.style` | Style |
| `room[]` | `taxonomy.room` | Room |
| `vendor` | Native `product.vendor` | Designer (always last in smart-filters) |

---

## Brand Presentation

| Hub Field | Shopify Target | Theme consumer |
|-----------|----------------|------------------|
| `brand.logo` | `brand.logo` (file_reference) | `pdp-brand-badge`, optional card logo |
| `brand.story` | `brand.story` (multi_line_text_field) | `pdp-brand-story` |
| `brand.tier` | `brand.tier` | `flagship` shows tier badge on PDP |
| `brand.collection_handle` | Smart collection handle | `rueiv-vendor-url` snippet → `/collections/{handle}` |

**Future:** Migrate to `brand` metaobject referenced from products to avoid per-SKU duplication.

---

## Collections (data-driven, not theme)

| Collection type | Rule | Script |
|-----------------|------|--------|
| Category | `product_type equals {Category}` | `scripts/create_collections_v2.js` |
| Vendor | `vendor equals {Display Name}` | `scripts/fix_vendors.js` / Hub publish |
| Color × Category | `type + tag color:{slug}` | `scripts/create_collections.js` |
| End use | `type + tag end-use:{name}` | `scripts/create_collections.js` |

---

## Variant Products

| Hub Field | Shopify Target |
|-----------|----------------|
| `variants[].name` | `option1` (Size / Configuration) |
| `variants[].sku` | variant SKU |
| `variants[].price` | variant price; falls back to product price |

---

## Import Priority

```
override.*  >  taxonomy.*  >  specs.*  >  rueiv.*  >  native Shopify fields
```

See `theme/snippets/pdp-override-resolver.liquid` and `theme/snippets/rueiv-price-resolver.liquid`.
