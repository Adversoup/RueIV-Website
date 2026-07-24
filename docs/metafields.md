# Metafield Definitions — RueIV Platform

## Naming Convention

| Rule | Value |
|------|-------|
| **Namespace** | `specs` |
| **Key format** | `snake_case` |
| **Metafield owner** | `product` |
| **Type** (default) | `single_line_text_field` unless noted |

All metafields live under the `specs` namespace on the **Product** resource.
Example: `product.metafields.specs.material`

---

## Common Metafields (all categories)

| Key | Label | Type | Example | Source CSV Column |
|-----|-------|------|---------|-------------------|
| `material` | Material | `single_line_text_field` | `100% Linen` | `core_products.material` |
| `finish` | Finish | `single_line_text_field` | `Matte Black` | `*_attributes.finish` |
| `dimensions` | Dimensions | `single_line_text_field` | `30" H x 48" W x 20" D` | derived |
| `width` | Width | `single_line_text_field` | `54.00 in (137.16 cm)` | `*_attributes.width` |
| `height` | Height | `single_line_text_field` | `330mm \| 13"` | `*_attributes.height` |
| `depth` | Depth | `single_line_text_field` | `20"` | `furniture_variants.depth` |
| `weight` | Weight | `single_line_text_field` | `12.39 oz/ly` | `*_attributes.weight` |
| `color` | Color | `single_line_text_field` | `Ivory` | `core_products.color` |
| `collection_name` | Collection | `single_line_text_field` | `Gergei Erdei` | `*_attributes.collection` |
| `country_of_origin` | Country of Origin | `single_line_text_field` | `Italy` | `core_products.country_of_origin` |
| `lead_time` | Lead Time | `single_line_text_field` | `8-10 weeks` | `core_products.lead_time` |
| `care` | Care | `single_line_text_field` | `Dry Clean Only` | derived from finish/notes |
| `fire_rating` | Fire Rating | `single_line_text_field` | `UFAC Class I / NFPA 260` | `*_attributes.fire_rating` |

---

## Fabric-Specific Metafields

| Key | Label | Type | Example | Source CSV Column |
|-----|-------|------|---------|-------------------|
| `pattern` | Pattern | `single_line_text_field` | `Print Pattern, Abstract` | `fabric_attributes.pattern` |
| `weave` | Weave | `single_line_text_field` | `Plain` | `fabric_attributes.weave` |
| `composition` | Composition | `single_line_text_field` | `100% Linen` | `fabric_attributes.composition` |
| `repeat_h` | Horizontal Repeat | `single_line_text_field` | `54.00 in` | `fabric_attributes.repeat_h` |
| `repeat_v` | Vertical Repeat | `single_line_text_field` | `0.00 in` | `fabric_attributes.repeat_v` |
| `martindale` | Martindale | `single_line_text_field` | `51,000+` | `fabric_attributes.martindale` |
| `usage` | Usage | `single_line_text_field` | `Bedding, Drapery` | `fabric_attributes.usage` |

---

## Furniture-Specific Metafields

| Key | Label | Type | Example | Source CSV Column |
|-----|-------|------|---------|-------------------|
| `frame_material` | Frame Material | `single_line_text_field` | `Solid Hardwood` | `furniture_attributes.frame_material` |
| `upholstery` | Upholstery | `single_line_text_field` | `Fabric or Leather` | `furniture_attributes.upholstery` |
| `style` | Style | `single_line_text_field` | `Simple silhouette` | `furniture_attributes.style` |
| `com_yardage` | COM Yardage | `single_line_text_field` | `6 yards` | `furniture_attributes.com_yardage` |
| `assembly_required` | Assembly Required | `single_line_text_field` | `Yes` | `furniture_attributes.assembly_required` |

---

## Lighting-Specific Metafields

| Key | Label | Type | Example | Source CSV Column |
|-----|-------|------|---------|-------------------|
| `fixture_type` | Fixture Type | `single_line_text_field` | `Wall Light` | `lighting_attributes.fixture_type` |
| `constructed_from` | Constructed From | `single_line_text_field` | `Cast composite` | `lighting_attributes.constructed_from` |
| `bulb_type` | Bulb Type | `single_line_text_field` | `2 x 450lm LED E14` | `lighting_attributes.bulb_type` |
| `max_wattage` | Max Wattage | `single_line_text_field` | `10W` | `lighting_attributes.max_wattage` |
| `voltage` | Voltage | `single_line_text_field` | `220-240 V` | `lighting_attributes.voltage` |
| `shade_material` | Shade Material | `single_line_text_field` | `Oyster linen` | `lighting_attributes.shade_material` |
| `dimmable` | Dimmable | `single_line_text_field` | `Yes` | `lighting_attributes.dimmable` |
| `ip_rating` | IP Rating | `single_line_text_field` | `IP44` | `lighting_attributes.ip_rating` |
| `projection` | Projection | `single_line_text_field` | `125mm` | `lighting_attributes.projection` |
| `cable_length` | Cable Length | `single_line_text_field` | `2m` | `lighting_attributes.cable_length` |

---

## Wallpaper-Specific Metafields

| Key | Label | Type | Example | Source CSV Column |
|-----|-------|------|---------|-------------------|
| `roll_width` | Roll Width | `single_line_text_field` | `120 cm (47.24")` | `wallpaper_attributes.roll_width` |
| `roll_length` | Roll Length | `single_line_text_field` | `10m` | `wallpaper_attributes.roll_length` |
| `substrate` | Substrate | `single_line_text_field` | `Non-woven backing` | `wallpaper_attributes.substrate` |
| `installation` | Installation | `single_line_text_field` | `Paste the wall` | `wallpaper_attributes.installation` |
| `washability` | Washability | `single_line_text_field` | `Spongeable` | `wallpaper_attributes.washability` |

---

## How To Populate

1. **Shopify Admin → Settings → Custom data → Products → Add definition**
2. Namespace: `specs`, Key: (from table above), Type: `Single line text`
3. Repeat for each key.
4. Via API: `POST /admin/api/2024-01/products/{id}/metafields.json`
   ```json
   {
     "metafield": {
       "namespace": "specs",
       "key": "material",
       "value": "100% Linen",
       "type": "single_line_text_field"
     }
   }
   ```

## How the Theme Reads Them

- `snippets/metafield-get.liquid` — safe getter with fallback
- `snippets/specs-table.liquid` — renders the table, skips blank rows
- The `specs_table` block in `main-product` section renders inside an accordion
- If no metafields are populated → **nothing renders** (no empty table, no broken layout)
