# Data Contract — CSV → Shopify Field Mapping

This document defines the exact mapping from each CSV column to its corresponding
Shopify product field, variant field, or metafield.

---

## Naming Convention

| Rule | Value |
|------|-------|
| Metafield namespace | `specs` |
| Metafield key format | `snake_case` |
| Metafield type | `single_line_text_field` (default for all) |
| Product handle | `slugify(name)-slugify(sku)` — deterministic, unique |

---

## 1. core_products.csv → Shopify Product

| CSV Column | Shopify Field | Notes |
|-----------|---------------|-------|
| `sku` | `variants[0].sku` | Primary identity key (used for lookups & handle generation) |
| `name` | `title` | Product title |
| `vendor` | `vendor` | |
| `category` | `productType` | Mapped: fabric→Fabric, furniture→Furniture, etc. |
| `status` | `status` | APPROVED → `DEFAULT_STATUS` env (default DRAFT); else DRAFT |
| `description` | `descriptionHtml` | Stored as HTML body |
| `material` | **metafield** `specs.material` | |
| `color` | **metafield** `specs.color` | |
| `price` | `variants[0].price` | If empty/missing → `0` |
| `currency` | *(not used)* | Shopify uses store currency |
| `lead_time` | **metafield** `specs.lead_time` | |
| `country_of_origin` | **metafield** `specs.country_of_origin` | |
| `image_url_1` | `images[0].src` | Up to image_url_10 supported |
| `image_url_2` | `images[1].src` | |
| `image_url_3` | `images[2].src` | |
| `source_url` | *(not imported)* | Reference only |
| `created_at` | *(not imported)* | Shopify manages timestamps |
| `updated_at` | *(not imported)* | Shopify manages timestamps |

**Tags:** The `category` value is added as a product tag (e.g., `fabric`, `furniture`).

---

## 2. fabric_attributes.csv → Metafields (namespace: `specs`)

Joined to core_products via `sku`.

| CSV Column | Metafield Key | Example Value |
|-----------|---------------|---------------|
| `pattern` | `specs.pattern` | `Print Pattern, Abstract` |
| `weave` | `specs.weave` | `Plain` |
| `width` | `specs.width` | `54.00 in (137.16 cm)` |
| `repeat_h` | `specs.repeat_h` | `54.00 in` |
| `repeat_v` | `specs.repeat_v` | `0.00 in` |
| `weight` | `specs.weight` | `12.39 oz/ly` |
| `martindale` | `specs.martindale` | `51,000+` |
| `finish` | `specs.finish` | `Reversible, Dry Clean Only` |
| `composition` | `specs.composition` | `100% Linen` |
| `usage` | `specs.usage` | `Bedding, Drapery, Multipurpose` |
| `fire_rating` | `specs.fire_rating` | `UFAC Class I / NFPA 260` |

---

## 3. furniture_attributes.csv → Metafields (namespace: `specs`)

Joined to core_products via `sku`.

| CSV Column | Metafield Key | Example Value |
|-----------|---------------|---------------|
| `style` | `specs.style` | `Simple silhouette, low profile` |
| `frame_material` | `specs.frame_material` | `Solid Hardwood` |
| `upholstery` | `specs.upholstery` | `Fabric or Leather` |
| `finish` | `specs.finish` | `In-house water based finishes` |
| `com_yardage` | `specs.com_yardage` | `6` |
| `weight` | `specs.weight` | `85 lbs` |
| `assembly_required` | `specs.assembly_required` | `Yes` |
| `details_json` | *(flattened)* | See below |

### details_json flattening

The `details_json` column contains a JSON object whose keys are flattened
into individual metafields:

```json
{
  "body": "Upholstered Only",
  "seat": "Tight Seat Configuration",
  "back": "Tight Back Configuration",
  "leg_|_base": "Standard: Exposed Wood"
}
```

Each key is normalized to snake_case and stored as `specs.<key>`:

| JSON Key | Metafield Key | Example |
|---------|---------------|---------|
| `body` | `specs.body` | `Upholstered Only` |
| `seat` | `specs.seat` | `Tight Seat Configuration\nFoam/Down` |
| `back` | `specs.back` | `Tight Back Configuration\nFoam/Fiber` |
| `leg_|_base` | `specs.leg__base` | `Standard: Exposed Wood` |
| `arm` | `specs.arm` | `Arm width of 3 inches` |
| `additional_details` | `specs.additional_details` | `Optional Nailhead Detail` |

---

## 4. furniture_variants.csv → Shopify Variants

Joined to core_products via `sku`. One product may have multiple variant rows.

| CSV Column | Shopify Variant Field | Notes |
|-----------|----------------------|-------|
| `sku` | *(join key)* | Links to product |
| `variant_name` | `option1` (Option: "Size") | `48" Banquette`, `60" Banquette` |
| `width` | *(informational)* | Stored in variant name |
| `depth` | *(informational)* | |
| `height` | *(informational)* | |
| `seat_height` | *(informational)* | |
| `arm_height` | *(informational)* | |
| `price` | `price` | If empty → falls back to core_products.price → 0 |
| `options` | *(not used)* | Free-text, may be parsed in future |

If a SKU has **no rows** in furniture_variants.csv, a single "Default" variant is created.

---

## 5. lighting_attributes.csv → Metafields (namespace: `specs`)

Joined to core_products via `sku`.

| CSV Column | Metafield Key | Example Value |
|-----------|---------------|---------------|
| `fixture_type` | `specs.fixture_type` | `Wall Light` |
| `collection` | `specs.collection` | `Gergei Erdei` |
| `constructed_from` | `specs.constructed_from` | `Cast composite with decorative finish` |
| `height` | `specs.height` | `330mm \| 13"` |
| `width_diameter` | `specs.width_diameter` | `402mm \| 16"` |
| `projection` | `specs.projection` | `125mm \| 5"` |
| `bulb_type` | `specs.bulb_type` | `2 x 450lm (5w) LED E14 Candle` |
| `max_wattage` | `specs.max_wattage` | `10W` |
| `voltage` | `specs.voltage` | `220-240 V` |
| `shade_material` | `specs.shade_material` | `Paper and Chalk raffia binding` |
| `finish` | `specs.finish` | `Anziano White or Gilted Verdigris` |
| `weight` | `specs.weight` | `1.4kg \| 3 1/4lbs` |
| `dimmable` | `specs.dimmable` | `Yes` |
| `ip_rating` | `specs.ip_rating` | `IP44` |
| `cable_length` | `specs.cable_length` | `2m` |

---

## 6. wallpaper_attributes.csv → Metafields (namespace: `specs`)

Joined to core_products via `sku`.

| CSV Column | Metafield Key | Example Value |
|-----------|---------------|---------------|
| `pattern` | `specs.pattern` | `Drop match` |
| `roll_width` | `specs.roll_width` | `120 cm (47.24")` |
| `roll_length` | `specs.roll_length` | `10m` |
| `repeat_h` | `specs.repeat_h` | `110 cm (43.31")` |
| `repeat_v` | `specs.repeat_v` | `55 cm (21.65")` |
| `substrate` | `specs.substrate` | `Non-woven backing` |
| `installation` | `specs.installation` | `Paste the wall` |
| `washability` | `specs.washability` | `Spongeable during hanging` |
| `fire_rating` | `specs.fire_rating` | `EU: B-s1, d0; US: Class A` |

---

## Deduplication Rules

- If the same key appears in both core_products and a category-specific CSV
  (e.g., `material` in core and `composition` in fabric), **both are stored**
  as separate metafield keys. The theme `specs-table.liquid` snippet renders
  whichever keys are present.
- If a key appears in both core and attribute with the same name (e.g., `weight`),
  the **attribute value wins** (last-write).

## Blank Handling

- Any CSV value that is empty, whitespace-only, or missing is **skipped**.
- No blank metafields are created.
- No blank rows appear in the specs table.
