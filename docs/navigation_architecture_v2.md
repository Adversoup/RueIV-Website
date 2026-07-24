# Navigation Architecture v2 — RueIV Platform

## Design Principles

- **Category-first discovery** — Vendors never appear in primary navigation
- **Vendor as filter only** — Designer/brand appears only in collection filter dropdowns
- **Editorial luxury UX** — Inspired by RH, Arhaus, Design Within Reach
- **Scale-ready** — Supports 50+ vendors, 10,000+ products without nav changes
- **Clean hierarchy** — 7 primary categories + 1 experiential section

---

## 1. Primary Navigation (Header)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TEXTILES   WALLCOVERING   FURNITURE   LIGHTING   RUGS   ACCESSORIES   │
│                         THE VIBE STUDIO                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

| Position | Title           | Type         | Mega Menu Block        |
|----------|-----------------|--------------|------------------------|
| 1        | Textiles        | Mega Menu    | `rueiv_mega_v3`        |
| 2        | Wallcovering    | Mega Menu    | `rueiv_mega_v3`        |
| 3        | Furniture       | Mega Menu    | `rueiv_mega_v3`        |
| 4        | Lighting        | Mega Menu    | `rueiv_mega_v3`        |
| 5        | Rugs            | Mega Menu    | `rueiv_mega_v3`        |
| 6        | Accessories     | Mega Menu    | `rueiv_mega_v3`        |
| 7        | The Vibe Studio | Mega Menu    | `rueiv_mega_vibe`      |

> **Designers** and **About/Contact** removed from primary nav.
> No vendor links anywhere in the header.

---

## 2. Mega Menu Structure

Each category opens a 3-column mega menu with:
- Column heading
- Navigation links
- Optional tile image (auto-fallback from collection image)

### TEXTILES

| Column A — Shop by Application | Column B — Shop by Material | Column C — Shop by Color |
|---|----|---|
| All Textiles | All Materials | All Colors |
| Upholstery | Linen | Neutrals |
| Drapery | Cotton | Warm |
| Sheers | Silk | Cool |
| Decorative | Velvet | Dark |
| Outdoor | Wool | Patterned |
| Leather | Performance | |

**Menus:** `textiles-application`, `textiles-material`, `textiles-color`

### WALLCOVERING

| Column A — Shop by Material | Column B — Shop by Design | Column C — Shop by Color |
|---|---|---|
| All Wallcovering | All Designs | All Colors |
| Paper | Textures | Neutrals |
| Vinyl | Florals | Warm |
| Naturals | Geometric | Cool |
| Grasscloth | Scenic | Dark |
| Textile | Animal / Skin | Patterned |
| Murals | | |

**Menus:** `wallcovering-material`, `wallcovering-design`, `wallcovering-color`

### FURNITURE

| Column A — Shop by Room | Column B — Shop by Type | Column C — Project Solutions |
|---|---|---|
| All Furniture | Sofas | Quick Ship |
| Living Room | Lounge Chairs | New Arrivals |
| Dining | Dining Chairs | Contract / Hospitality |
| Bedroom | Tables | |
| Office | Casegoods | |

**Menus:** `furniture-room`, `furniture-type`, `furniture-solutions`

### LIGHTING

| Column A — Shop by Type | Column B — Shop by Style | Column C — Project Solutions |
|---|---|---|
| All Lighting | Modern | Quick Ship |
| Table Lamps | Traditional | New Designs |
| Floor Lamps | Sculptural | |
| Wall Lights | Architectural | |
| Ceiling Lights | | |
| Pendant | | |

**Menus:** `lighting-type`, `lighting-style`, `lighting-solutions`

### RUGS

| Column A — Shop by Size | Column B — Shop by Material | Column C — Shop by Color |
|---|---|---|
| All Rugs | Wool | All Colors |
| Small | Natural Fiber | Neutrals |
| Medium | Flatweave | Warm |
| Large | Hand Knotted | Cool |
| Oversize | | Dark |
| | | Patterned |

**Menus:** `rugs-size`, `rugs-material`, `rugs-color`

### ACCESSORIES

| Column A — Decor | Column B — Tabletop | Column C — Shop by Material |
|---|---|---|
| All Accessories | Trays | Stone |
| Objects | Bowls | Metal |
| Sculpture | Decorative Pieces | Glass |
| Frames | | Mixed Media |

**Menus:** `accessories-decor`, `accessories-tabletop`, `accessories-material`

### THE VIBE STUDIO

3-card editorial layout:

| Card 1 | Card 2 | Card 3 |
|---|---|---|
| Explore Moodboards | How It Works | Submit a Project |

Plus footer CTA: "Shop The Vibe"

---

## 3. Footer Navigation

### Footer Menu (`footer`)

| Column 1 — Company | Column 2 — Resources | Column 3 — Connect |
|---|---|---|
| About | Trade Program | Contact |
| Press | Events | Find a Showroom |
| Careers | Designer Directory | Newsletter Signup |

### Footer Secondary Menu (`footer-secondary`)

| Link | URL |
|---|---|
| Privacy Policy | /policies/privacy-policy |
| Terms of Service | /policies/terms-of-service |
| Shipping & Returns | /pages/shipping-returns |
| Accessibility | /pages/accessibility |

---

## 4. Shopify Navigation Menus Required

### Main Menu: `main-menu`

```
Main Menu
├── Textiles         → /collections/textiles
│   └── (child links not needed — v3 uses separate menus)
├── Wallcovering     → /collections/wallcovering
├── Furniture        → /collections/furniture
├── Lighting         → /collections/lighting
├── Rugs             → /collections/rugs
├── Accessories      → /collections/accessories
└── The Vibe Studio  → /pages/vibe-studio
    ├── Explore Moodboards → /pages/moodboards
    ├── How It Works       → /pages/how-it-works
    └── Submit a Project   → /pages/submit-project
```

### Mega Menu Data Menus (21 total)

| Handle | Category | Column |
|--------|----------|--------|
| `textiles-application` | Textiles | A |
| `textiles-material` | Textiles | B |
| `textiles-color` | Textiles | C |
| `wallcovering-material` | Wallcovering | A |
| `wallcovering-design` | Wallcovering | B |
| `wallcovering-color` | Wallcovering | C |
| `furniture-room` | Furniture | A |
| `furniture-type` | Furniture | B |
| `furniture-solutions` | Furniture | C |
| `lighting-type` | Lighting | A |
| `lighting-style` | Lighting | B |
| `lighting-solutions` | Lighting | C |
| `rugs-size` | Rugs | A |
| `rugs-material` | Rugs | B |
| `rugs-color` | Rugs | C |
| `accessories-decor` | Accessories | A |
| `accessories-tabletop` | Accessories | B |
| `accessories-material` | Accessories | C |
| `footer` | — | Footer |
| `footer-secondary` | — | Footer |

---

## 5. Collection Handle Mapping

### Category Collections (product_type rules)

| Handle | product_type |
|--------|-------------|
| `textiles` | Fabric |
| `wallcovering` | Wallpaper |
| `furniture` | Furniture |
| `lighting` | Lighting |
| `rugs` | Rug |
| `accessories` | Accessory |

### Application/End-Use Collections (tag rules)

| Handle | Rules |
|--------|-------|
| `textiles-upholstery` | type=Fabric AND tag=end-use:Upholstery |
| `textiles-drapery` | type=Fabric AND tag=end-use:Drapery |
| `textiles-sheers` | type=Fabric AND tag=end-use:Sheer |
| `textiles-decorative` | type=Fabric AND tag=end-use:Decorative |
| `textiles-outdoor` | type=Fabric AND tag=end-use:Outdoor |
| `textiles-leather` | type=Fabric AND tag=material:Leather |
| `textiles-performance` | type=Fabric AND tag=end-use:Performance |

### Material Collections

| Handle | Rules |
|--------|-------|
| `textiles-linen` | type=Fabric AND tag=material:Linen |
| `textiles-cotton` | type=Fabric AND tag=material:Cotton |
| `textiles-silk` | type=Fabric AND tag=material:Silk |
| `textiles-velvet` | type=Fabric AND tag=material:Velvet |
| `textiles-wool` | type=Fabric AND tag=material:Wool |
| `wallcovering-paper` | type=Wallpaper AND tag=material:Paper |
| `wallcovering-vinyl` | type=Wallpaper AND tag=material:Vinyl |
| `wallcovering-naturals` | type=Wallpaper AND tag=material:Natural |
| `wallcovering-grasscloth` | type=Wallpaper AND tag=material:Grasscloth |
| `wallcovering-textile` | type=Wallpaper AND tag=material:Textile |
| `wallcovering-murals` | type=Wallpaper AND tag=design:Mural |

### Design/Pattern Collections

| Handle | Rules |
|--------|-------|
| `wallcovering-textures` | type=Wallpaper AND tag=design:Texture |
| `wallcovering-florals` | type=Wallpaper AND tag=design:Floral |
| `wallcovering-geometric` | type=Wallpaper AND tag=design:Geometric |
| `wallcovering-scenic` | type=Wallpaper AND tag=design:Scenic |
| `wallcovering-animal` | type=Wallpaper AND tag=design:Animal |

### Furniture Type Collections

| Handle | Rules |
|--------|-------|
| `furniture-sofas` | type=Furniture AND tag=subcat:Sofa |
| `furniture-lounge-chairs` | type=Furniture AND tag=subcat:Lounge Chair |
| `furniture-dining-chairs` | type=Furniture AND tag=subcat:Dining Chair |
| `furniture-tables` | type=Furniture AND tag=subcat:Table |
| `furniture-casegoods` | type=Furniture AND tag=subcat:Casegood |

### Room Collections

| Handle | Rules |
|--------|-------|
| `living-room` | tag=room:living-room |
| `dining` | tag=room:dining |
| `bedroom` | tag=room:bedroom |
| `office` | tag=room:office |

### Lighting Type / Style

| Handle | Rules |
|--------|-------|
| `lighting-table-lamps` | type=Lighting AND tag=subcat:Table Lamp |
| `lighting-floor-lamps` | type=Lighting AND tag=subcat:Floor Lamp |
| `lighting-wall-lights` | type=Lighting AND tag=subcat:Wall Light |
| `lighting-ceiling-lights` | type=Lighting AND tag=subcat:Ceiling Light |
| `lighting-pendant` | type=Lighting AND tag=subcat:Pendant |
| `lighting-modern` | type=Lighting AND tag=style:Modern |
| `lighting-traditional` | type=Lighting AND tag=style:Traditional |
| `lighting-sculptural` | type=Lighting AND tag=style:Sculptural |
| `lighting-architectural` | type=Lighting AND tag=style:Architectural |

### Special Collections

| Handle | Rules |
|--------|-------|
| `quick-ship` | tag=lead-time:Quick Ship |
| `new-arrivals` | tag=new-arrival (sorted by created_at) |
| `contract-hospitality` | tag=trade:Contract |

### Color Family Collections (per category)

Pattern: `{category}-color-{family}`

| Family | Textiles | Wallcovering | Rugs |
|--------|----------|-------------|------|
| Neutrals | `textiles-color-neutrals` | `wallcovering-color-neutrals` | `rugs-color-neutrals` |
| Warm | `textiles-color-warm` | `wallcovering-color-warm` | `rugs-color-warm` |
| Cool | `textiles-color-cool` | `wallcovering-color-cool` | `rugs-color-cool` |
| Dark | `textiles-color-dark` | `wallcovering-color-dark` | `rugs-color-dark` |
| Patterned | `textiles-color-patterned` | `wallcovering-color-patterned` | `rugs-color-patterned` |

**Color family → tag mapping:**

| Family | Tags included |
|--------|--------------|
| Neutrals | color:white, color:ivory, color:cream, color:beige, color:taupe, color:grey, color:natural |
| Warm | color:camel, color:gold, color:terracotta, color:rust, color:orange, color:blush, color:red |
| Cool | color:blue, color:navy, color:teal, color:green, color:sage, color:indigo, color:forest |
| Dark | color:charcoal, color:black, color:burgundy |
| Patterned | color:multi |

---

## 6. Quick Ship Logic

Quick Ship is a cross-cutting concept:

1. **Tag:** `lead-time:Quick Ship` applied to qualifying products
2. **Standalone collection:** `/collections/quick-ship` (tag-based smart collection)
3. **Mega menu links:** Appears under "Project Solutions" for Furniture and Lighting
4. **Filter value:** Appears in Lead Time filter group on collection pages
5. **Homepage section:** `rueiv-quick-ship.liquid` section
6. **Metafield:** `taxonomy.lead_time` = `Quick Ship` or `Standard`

---

## 7. Smart Filter System

Filters adapt per collection based on product_type:

### TEXTILES collection filters
1. Application (Upholstery, Drapery, Sheers, etc.)
2. Material (Linen, Cotton, Silk, etc.)
3. Color Family (Neutrals, Warm, Cool, Dark, Patterned)
4. Designer (alphabetical, collapsed, searchable)

### WALLCOVERING collection filters
1. Material (Paper, Vinyl, Grasscloth, etc.)
2. Design (Textures, Florals, Geometric, etc.)
3. Color Family
4. Designer

### FURNITURE collection filters
1. Room (Living Room, Dining, Bedroom, Office)
2. Type (Sofas, Chairs, Tables, etc.)
3. Material
4. Lead Time (Quick Ship, Standard)
5. Designer

### LIGHTING collection filters
1. Type (Table, Floor, Wall, Ceiling, Pendant)
2. Style (Modern, Traditional, Sculptural, Architectural)
3. Lead Time
4. Designer

### RUGS collection filters
1. Size (Small, Medium, Large, Oversize)
2. Material (Wool, Natural Fiber, Flatweave, Hand Knotted)
3. Color Family
4. Designer

### ACCESSORIES collection filters
1. Type (Objects, Sculpture, Frames, Trays, Bowls)
2. Material (Stone, Metal, Glass, Mixed Media)
3. Designer

---

## 8. Designer Filter UX Rules

- **Never** in main navigation
- Alphabetical sort
- Collapsed dropdown by default
- Searchable text input if vendor count > 25
- Shows product count per designer
- Appears as LAST filter in every filter bar

---

## 9. Collection Page Structure

```
┌─────────────────────────────────────────────────┐
│  Home > Textiles > Upholstery          (crumbs) │
├─────────────────────────────────────────────────┤
│  UPHOLSTERY FABRICS                    (h1)     │
│  Explore our curated selection…        (desc)   │
├─────────────────────────────────────────────────┤
│  [Filter] [Filter] [Filter] [Sort ▾]  (sticky) │
├─────────────────────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                   │
│  │prod│ │prod│ │prod│ │prod│   (product grid)   │
│  └────┘ └────┘ └────┘ └────┘                   │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                   │
│  │prod│ │prod│ │prod│ │prod│                    │
│  └────┘ └────┘ └────┘ └────┘                   │
├─────────────────────────────────────────────────┤
│  [1] [2] [3] [→]                   (pagination) │
└─────────────────────────────────────────────────┘
```

---

## 10. Migration from v1

### What changes:
- Main menu: "Shop" mega dropdown → 7 individual category menus
- "Brands" column removed from mega menu
- "Designers" moved from primary nav to footer
- "About", "Trade Program", "Contact" moved to footer
- Old `shop-by-category`, `shop-by-brand` menus deprecated
- New per-category menus created (21 menus)

### Backward compatibility:
- Old menus kept for reference (prefixed with underscore)
- v2 mega block remains in header.liquid schema
- v3 block used for all new categories

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup_navigation_v2.js` | Creates all 21+ menus and updates main-menu |
| `scripts/create_collections_v2.js` | Creates new smart collections for all handles |
| `scripts/define_metafields_v2.js` | Registers new filter-oriented metafields |
| `scripts/backfill_filter_tags.js` | Adds material:*, design:*, style:* tags |
