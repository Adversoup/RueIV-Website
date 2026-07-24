# RueIV Mega v2 — Integration Guide

## Overview

**RueIV Mega v2** is a custom mega menu block type added to the Modiva theme's existing mega menu system. It renders a 3-column layout with a hover preview panel and a brands carousel for the **Shop** menu item.

```
┌──────────────────┬────────────────┬──────────────────┐
│  Shop by Category│    Preview     │  Shop by End Use │
│  (text links)    │    (image)     │  (text links)    │
├──────────────────┴────────────────┴──────────────────┤
│  Brands — horizontal carousel with ← → arrows       │
└─────────────────────────────────────────────────────-─┘
```

---

## 1. Theme Editor Setup

### Enable the block

1. Go to **Online Store → Themes → Customize** (Modiva theme)
2. Click the **Header** section
3. In the left sidebar, find the block for "Shop" (or add a new block)
4. Choose block type: **RueIV Mega v2**
5. Configure:
   - **Menu title**: `Shop` (must match the top-level nav link title exactly)
   - **Shop by Category menu**: select `shop-by-category`
   - **Shop by End Use menu**: select `shop-by-end-use`
   - **Brands menu**: select `shop-by-brand`
   - **Brands visible at once**: `4` (adjustable 3–6)
   - **Fallback preview image**: optional — shown when a hovered item has no collection image

---

## 2. Navigation Menus to Create

Create these three navigation menus in **Online Store → Navigation**:

### `shop-by-category`
| Link Title | Link URL |
|---|---|
| Fabric | `/collections/fabric` |
| Wallpaper | `/collections/wallpaper` |
| Furniture | `/collections/furniture` |
| Lighting | `/collections/lighting` |

### `shop-by-end-use`
| Link Title | Link URL |
|---|---|
| Upholstery | `/collections/upholstery` |
| Drapery | `/collections/drapery` |
| Multi-purpose | `/collections/multi-purpose` |
| Performance | `/collections/performance` |

### `shop-by-brand`
| Link Title | Link URL |
|---|---|
| Arte | `/collections/arte` |
| Fabricut | `/collections/fabricut` |
| Porta Romana | `/collections/porta-romana` |
| Verellen | `/collections/verellen` |
| ZR | `/collections/zr` |

> **Tip**: Add or remove items from these menus at any time — the mega menu reflects changes immediately.

---

## 3. Collection Featured Images (for Thumbnails)

The mega menu automatically pulls thumbnails using this priority:

1. **Collection image** (`collection.featured_image`) — set via **Products → Collections → [collection] → Collection image**
2. **First product's featured image** — used if no collection image is set
3. **URL-based fallback** — attempts to resolve collection handle from the link URL
4. **Fallback image** — the image set in the Theme Editor block settings

### How to set collection images:
1. Go to **Products → Collections**
2. Click a collection (e.g., Fabric)
3. In the right sidebar, under **Collection image**, upload a square image (recommended: 480×480px or larger)
4. Save

---

## 4. Architecture & Files

| File | Purpose |
|---|---|
| `sections/header.liquid` | Schema defines `rueiv_mega_v2` block type with settings |
| `sections/header-group.json` | Config — sets block type to `rueiv_mega_v2` for Shop |
| `snippets/desktop-menu.liquid` | Routes `rueiv_mega_v2` blocks to the new snippet |
| `snippets/mega-menu-rueiv-v2.liquid` | Renders the 3-col layout, preview panel, brands carousel, inline JS |
| `assets/rueiv-mega-v2.css` | Scoped styles (`.rv2-` prefix) |

### How it integrates with the theme

- Uses the theme's existing `<details is="details-mega">` custom element for open/close transitions
- Wraps content in `.mega-menu` / `.mega-menu__container` / `.mega-menu__wrapper` to inherit theme animations (slide-in, stagger)
- Items use `.mega-menu__item` class to inherit the theme's opacity/translate entrance animation
- Brand cards use `.promotion-item` class to get staggered entrance animation
- Mobile: hidden via CSS media query — the theme's drawer navigation handles mobile

---

## 5. QA Checklist

### Functionality
- [ ] Hovering "Shop" in the desktop nav opens the mega menu with slide-down animation
- [ ] Left column shows "Shop by Category" links (Fabric, Wallpaper, Furniture, Lighting)
- [ ] Right column shows "Shop by End Use" links (Upholstery, Drapery, etc.)
- [ ] Center preview panel shows a default image on open
- [ ] Hovering any category/end-use link swaps the preview image
- [ ] Focusing any link with keyboard (Tab) also swaps the preview image
- [ ] Clicking any link navigates to the correct collection page
- [ ] Brands carousel shows brand thumbnails with names
- [ ] Left/right arrow buttons scroll the brands carousel
- [ ] At least 3 brand cards are visible at once on desktop

### Visual
- [ ] Mega menu fills the full width of the header
- [ ] Preview image has rounded corners and smooth opacity transition
- [ ] Brand cards have hover zoom effect
- [ ] Columns are evenly spaced
- [ ] Brands section has a top border separator

### Mobile
- [ ] Mega menu is hidden on mobile (< 1024px)
- [ ] Mobile hamburger menu still works normally
- [ ] No layout shift or broken elements on mobile

### Edge Cases
- [ ] Empty navigation menu → column hides gracefully (no errors)
- [ ] Collection with no image → falls back to product image or fallback image
- [ ] No fallback image set → preview area shows empty (no broken img)
- [ ] Menu closes cleanly on Escape key
- [ ] Menu closes when clicking outside

### Theme Editor
- [ ] Block appears in Theme Editor as "RueIV Mega v2"
- [ ] All settings (menus, brands_visible, fallback_image) are configurable
- [ ] Changing menu_title updates which nav link gets the mega menu
- [ ] Live preview works in Theme Editor

### Performance
- [ ] CSS loads async (print → all pattern)
- [ ] Images use `loading="lazy"`
- [ ] No console errors
- [ ] No Liquid errors in theme editor

---

## 6. Reverting to Previous Mega Menu

To switch back to the old `product_list` mega menu:

1. Open Theme Editor → Header → Shop block
2. Remove the "RueIV Mega v2" block
3. Add a new "Product List" block with `menu_title: Shop`
4. Configure as needed

Or edit `header-group.json` and change the block type back to `product_list`.
