# Metafields Structure — RueIV Platform

## Overview

Product metafields are organized into 4 namespaces:
- **`taxonomy`** — Controlled classification values (color, end use, subcategory)
- **`override`** — Human curator controls that always take priority
- **`brand`** — Brand-level metadata for PDP brand blocks
- **`specs`** — Original product specifications from vendor data (legacy)

All definitions are registered via `scripts/define_metafields.js` (idempotent).

---

## 1. taxonomy.* — Controlled Classification

| Key | Type | Pinned | Purpose |
|-----|------|--------|---------|
| `color_family` | `single_line_text_field` | Yes | Primary color family (e.g., Navy, Ivory) |
| `color_family_secondary` | `single_line_text_field` | No | Optional second color for multi-tone products |
| `color_raw` | `single_line_text_field` | No | Original vendor color string (preserved) |
| `color_confidence` | `number_decimal` | No | AI mapping confidence 0.0–1.0 |
| `color_source` | `single_line_text_field` | No | `ai` · `manual` · `ai+override` · `dictionary` |
| `end_use` | `list.single_line_text_field` | Yes | Controlled end-use values |
| `subcategory` | `single_line_text_field` | Yes | Product subcategory (e.g., Dining Chair) |

### Color Families (24 controlled values)

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

Plus: `Natural`, `Multi`, `Metallic`

### End-Use Values

`Upholstery`, `Drapery`, `Multipurpose`, `Performance`, `Outdoor`,
`Bedding`, `Decorative`, `Sheer`

---

## 2. override.* — Human Curator Controls

| Key | Type | Pinned | Purpose |
|-----|------|--------|---------|
| `title` | `single_line_text_field` | Yes | Display title override |
| `hero_image` | `file_reference` | Yes | Hero image override |
| `category` | `single_line_text_field` | Yes | Category override |
| `color_family` | `single_line_text_field` | Yes | Color override (ALWAYS wins over AI) |
| `end_use` | `list.single_line_text_field` | Yes | End-use override |
| `grid_weight` | `number_integer` | Yes | 1=normal, 2=featured, 3=hero |

**Priority**: Override values always take precedence over taxonomy values.

---

## 3. brand.* — Brand Metadata

| Key | Type | Pinned | Purpose |
|-----|------|--------|---------|
| `story` | `multi_line_text_field` | No | Brand story for PDP |
| `logo` | `file_reference` | No | Brand logo image |
| `tier` | `single_line_text_field` | No | `flagship` · `partner` · `emerging` |

---

## 4. specs.* — Vendor Specifications (Legacy)

These are the original vendor-supplied product specs, imported via
`scripts/import_shopify.js` using the `productSet` mutation.

| Key | Example Values |
|-----|---------------|
| `specs.material` | "100% Polyester", "Blown Glass" |
| `specs.finish` | "Matte", "Brushed Brass" |
| `specs.dimensions` | "54\" W", "24\" H x 12\" D" |
| `specs.weight` | "4.2 lbs" |
| `specs.pattern` | "Botanical", "Geometric" |
| `specs.collection_name` | "Artisan Naturals" |
| `specs.color` | Original vendor color string |

---

## 5. Tag Conventions

Products use tags for automated collection rules:

| Tag Pattern | Example | Used By |
|-------------|---------|---------|
| `color:{slug}` | `color:navy` | Color × Category collections |
| `end-use:{name}` | `end-use:Upholstery` | End-use collections |

Tags are backfilled via `scripts/backfill_tags.js`.

---

## 6. Registration

```bash
# Register all definitions (idempotent)
node scripts/define_metafields.js

# Dry run (no mutations)
node scripts/define_metafields.js --dry-run
```

Total: **16 definitions** across taxonomy (7), override (6), brand (3).

---

## 7. Color Mapping Pipeline

```
vendor_color_string
    → Dictionary lookup (config/color_taxonomy.json)
    → NLP fuzzy match
    → GPT-4o Vision analysis
    → Consensus + confidence score
    → taxonomy.color_family + taxonomy.color_confidence + color:{slug} tag
```

See `scripts/map_colors.js` and `lib/color_mapper.js` for implementation.
