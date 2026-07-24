# Navigation Structure — RueIV Platform

## Overview

Navigation is controlled via **Shopify link-list menus** that feed into the
mega menu system. Each dimension (Category, Room, End Use, Color, Brand)
has its own dedicated menu, making it easy to add/remove items without
touching theme code.

---

## 1. Main Menu (`main-menu`)

The main navigation renders in the header. The "Shop" item triggers
the RueIV Mega v2 mega menu.

```
Main Menu
├── Shop               → /collections (triggers mega menu)
│   ├── By Category
│   │   ├── Fabric     → /collections/fabric
│   │   ├── Wallpaper  → /collections/wallpaper
│   │   ├── Furniture  → /collections/furniture
│   │   └── Lighting   → /collections/lighting
│   ├── By End Use
│   │   ├── Upholstery → /collections/fabric-upholstery
│   │   ├── Drapery    → /collections/fabric-drapery
│   │   ├── Multi-purpose → /collections/fabric-multipurpose
│   │   └── Performance → /collections/fabric-performance
│   └── By Brand
│       ├── Arte       → /collections/arte
│       ├── Fabricut   → /collections/fabricut
│       ├── Porta Romana → /collections/porta-romana
│       ├── Verellen   → /collections/verellen
│       └── ZR         → /collections/zr
├── About              → /pages/about
├── Trade Program      → /pages/trade-program
└── Contact            → /pages/contact
```

---

## 2. Mega Menu Data Menus

These standalone link lists feed the mega menu columns.
Edit them in **Online Store → Navigation**.

### `shop-by-category`
| Link | URL |
|------|-----|
| Fabric | /collections/fabric |
| Wallpaper | /collections/wallpaper |
| Furniture | /collections/furniture |
| Lighting | /collections/lighting |
| Trim | /collections/trim |
| Rugs | /collections/rugs |

### `shop-by-room`
| Link | URL |
|------|-----|
| Living Room | /collections/living-room |
| Bedroom | /collections/bedroom |
| Dining Room | /collections/dining-room |
| Office | /collections/office |
| Outdoor | /collections/outdoor |
| Hospitality | /collections/hospitality |

### `shop-by-end-use`
| Link | URL |
|------|-----|
| Upholstery | /collections/fabric-upholstery |
| Drapery | /collections/fabric-drapery |
| Multi-purpose | /collections/fabric-multipurpose |
| Performance | /collections/fabric-performance |

### `shop-by-color`
17 color links pointing to `fabric-{color}` collections:
White, Ivory, Beige, Taupe, Camel, Grey, Blue, Navy, Teal, Green,
Gold, Red, Orange, Terracotta, Blush, Natural, Multi

### `shop-by-brand`
| Link | URL |
|------|-----|
| Arte | /collections/arte |
| Fabricut | /collections/fabricut |
| Porta Romana | /collections/porta-romana |
| Verellen | /collections/verellen |
| Zimmer + Rohde | /collections/zr |

---

## 3. Theme Wiring

The mega menu block (`rueiv_mega_v2` in header.liquid schema) maps
link lists to columns:

| Setting | Link List | Mega Menu Zone |
|---------|-----------|----------------|
| `menu_category` | `shop-by-category` | Left column (top) |
| `menu_room` | `shop-by-room` | Left column (bottom) |
| `menu_end_use` | `shop-by-end-use` | Right column (top) |
| `menu_color` | `shop-by-color` | Right column (bottom) |
| `menu_brands` | `shop-by-brand` | Bottom carousel |

Configuration is in `sections/header-group.json`.

---

## 4. Adding/Removing Items

To add a new category, room, or color:

1. Create the collection (via Admin or `create_collections.js`)
2. Add a link to the appropriate menu in **Online Store → Navigation**
3. The mega menu picks it up automatically — no theme code changes needed

---

## 5. Footer & Other Menus

| Menu Handle | Purpose |
|-------------|---------|
| `footer` | Footer links (Search, Privacy) |
| `customer-account-main-menu` | Customer account nav |

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_navigation.js` | Build/update main-menu via API |
| `scripts/create_sprint1_menus.js` | Create shop-by-room, shop-by-color |
| `scripts/build_main_menu.js` | Rebuild main menu structure |
