# Collection Structure — RueIV Platform

## Overview

RueIV uses **automated smart collections** (rule-based) across 4 dimensions:
Category, End Use, Color, and Brand. All collections are created via
`scripts/create_collections.js` using the Shopify REST Admin API.

---

## 1. Category Collections (Primary)

| Collection | Handle | Rule | Products |
|-----------|--------|------|----------|
| Fabric | `fabric` | `product_type = Fabric` | ~48 |
| Wallpaper | `wallpaper` | `product_type = Wallpaper` | ~24 |
| Furniture | `furniture` | `product_type = Furniture` | ~24 |
| Lighting | `lighting` | `product_type = Lighting` | ~24 |
| Trim | `trim` | `product_type = Trim` | Coming soon |
| Rugs | `rugs` | `product_type = Rug` | Coming soon |

**Rule type**: Automated (`product_type equals X`)

---

## 2. Brand Collections

| Collection | Handle | Rule |
|-----------|--------|------|
| Arte | `arte` | `vendor = Arte` |
| Fabricut / S. Harris | `fabricut` | `vendor = Fabricut` |
| Porta Romana | `porta-romana` | `vendor = Porta Romana` |
| Verellen | `verellen` | `vendor = Verellen` |
| Zimmer + Rohde | `zr` | `vendor = ZR` |

---

## 3. End-Use Collections (Fabric only)

| Collection | Handle | Rule |
|-----------|--------|------|
| Upholstery Fabrics | `fabric-upholstery` | `type = Fabric AND tag = end-use:Upholstery` |
| Drapery Fabrics | `fabric-drapery` | `type = Fabric AND tag = end-use:Drapery` |
| Multipurpose Fabrics | `fabric-multipurpose` | `type = Fabric AND tag = end-use:Multipurpose` |
| Performance Fabrics | `fabric-performance` | `type = Fabric AND tag = end-use:Performance` |
| Bedding Fabrics | `fabric-bedding` | `type = Fabric AND tag = end-use:Bedding` |
| Decorative Fabrics | `fabric-decorative` | `type = Fabric AND tag = end-use:Decorative` |
| Sheer Fabrics | `fabric-sheer` | `type = Fabric AND tag = end-use:Sheer` |

---

## 4. Color × Category Collections

Category-isolated color collections prevent cross-category mixing
(Blue Fabrics ≠ Blue Wallpapers).

**Pattern**: `{category}-{color_slug}`

### Fabric Colors
| Handle | Rule |
|--------|------|
| `fabric-ivory` | `type = Fabric AND tag = color:ivory` |
| `fabric-blue` | `type = Fabric AND tag = color:blue` |
| `fabric-navy` | `type = Fabric AND tag = color:navy` |
| `fabric-beige` | `type = Fabric AND tag = color:beige` |
| `fabric-camel` | `type = Fabric AND tag = color:camel` |
| `fabric-grey` | `type = Fabric AND tag = color:grey` |
| `fabric-taupe` | `type = Fabric AND tag = color:taupe` |
| `fabric-gold` | `type = Fabric AND tag = color:gold` |
| `fabric-natural` | `type = Fabric AND tag = color:natural` |
| `fabric-white` | `type = Fabric AND tag = color:white` |
| `fabric-teal` | `type = Fabric AND tag = color:teal` |
| `fabric-blush` | `type = Fabric AND tag = color:blush` |
| `fabric-terracotta` | `type = Fabric AND tag = color:terracotta` |
| `fabric-multi` | `type = Fabric AND tag = color:multi` |
| `fabric-red` | `type = Fabric AND tag = color:red` |
| `fabric-orange` | `type = Fabric AND tag = color:orange` |
| `fabric-green` | `type = Fabric AND tag = color:green` |

### Wallpaper Colors
`wallpaper-camel`, `wallpaper-beige`, `wallpaper-red`, `wallpaper-forest`,
`wallpaper-orange`, `wallpaper-natural`, `wallpaper-gold`, `wallpaper-indigo`,
`wallpaper-multi`, `wallpaper-rust`, `wallpaper-ivory`, `wallpaper-taupe`,
`wallpaper-terracotta`

### Furniture Colors
`furniture-beige`, `furniture-taupe`, `furniture-grey`, `furniture-cream`,
`furniture-black`, `furniture-camel`, `furniture-natural`, `furniture-rust`,
`furniture-ivory`

### Lighting Colors
`lighting-white`, `lighting-metallic`, `lighting-terracotta`, `lighting-sage`,
`lighting-natural`, `lighting-gold`, `lighting-camel`, `lighting-cream`,
`lighting-multi`

---

## 5. Room Collections (Planned)

| Collection | Handle | Rule |
|-----------|--------|------|
| Living Room | `living-room` | Manual / future room metafield |
| Bedroom | `bedroom` | Manual / future room metafield |
| Dining Room | `dining-room` | Manual / future room metafield |
| Office | `office` | Manual / future room metafield |
| Outdoor | `outdoor` | Manual / future room metafield |
| Hospitality | `hospitality` | Manual / future room metafield |

> Room collections are linked in navigation but will be populated
> when room metafield data is backfilled on products.

---

## Total: ~65 Collections

| Type | Count |
|------|-------|
| Category | 4 (+ 2 coming soon) |
| Brand | 5 |
| End Use | 7 |
| Color × Category | ~48 |
| **Total** | **~65** |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_collections.js` | Create all smart collections (idempotent) |
| `scripts/sync_collections.js` | Sync/verify collection rules |
| `scripts/set_collection_images.js` | Set collection featured images |

## Key Principle

> Only create color collections where products actually exist.
> The `create_collections.js` script queries all product tags before
> creating color×category collections, avoiding empty collections.
