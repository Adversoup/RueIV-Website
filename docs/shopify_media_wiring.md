# Shopify Media Wiring — Square Images

> Version 1.0 — 2026-02-25
> Owner: Platform Engineering

---

## Overview

Square-normalized images are stored **outside the product gallery** so they
appear in collection grids / search thumbnails but NOT in the PDP image carousel.

```
┌─────────────────────────────────────────────────────┐
│  Shopify Admin                                       │
│                                                      │
│  Product "Wind Chime Ocean"                          │
│  ├── Featured Image  → original (used in PDP zoom)   │
│  ├── Media Gallery   → untouched (PDP carousel)      │
│  └── Metafield image.square → square 1200×1200 WebP  │
│         ↑                                            │
│         └── Stored in Shopify Files (CDN-served)     │
│                                                      │
│  Collection Grid Card                                │
│  └── Liquid reads metafield → shows square crop      │
│      Fallback → featured_media (if metafield empty)  │
└─────────────────────────────────────────────────────┘
```

---

## Architecture Decision: Why Metafield + Files API?

| Option | Pros | Cons | Chosen? |
|--------|------|------|---------|
| **Product media (additional image)** | Simple upload | Appears in PDP gallery (unwanted) | ❌ |
| **Product metafield + Files API** | Separate from gallery; queryable in Liquid | Extra upload step | ✅ |
| **External CDN (S3/Cloudflare)** | Full control | Extra infra; not Shopify-native | ❌ |

---

## Metafield Schema

| Property | Value |
|----------|-------|
| Namespace | `image` |
| Key | `square` |
| Type | `file_reference` |
| Owner | Product |

The metafield stores a reference to a Shopify File (MediaImage GID).
Shopify resolves this to a CDN URL automatically in Liquid.

### Defining the Metafield

Already handled by `scripts/define_metafields.js`. The definition:

```graphql
mutation {
  metafieldDefinitionCreate(definition: {
    name: "Square Image"
    namespace: "image"
    key: "square"
    type: "file_reference"
    ownerType: PRODUCT
    validations: [{ name: "file_type_options", value: "[\"IMAGE\"]" }]
  }) {
    createdDefinition { id }
    userErrors { field message }
  }
}
```

---

## Upload Pipeline

### Step 1: Staged Upload

```graphql
mutation {
  stagedUploadsCreate(input: [{
    filename: "wind-chime-ocean_sq_1200.webp"
    mimeType: "image/webp"
    httpMethod: POST
    resource: FILE
    fileSize: "145000"
  }]) {
    stagedTargets {
      url
      resourceUrl
      parameters { name value }
    }
  }
}
```

### Step 2: HTTP POST to Staged URL

Multipart form upload with the parameters from Step 1 + the file blob.

### Step 3: Register File

```graphql
mutation {
  fileCreate(files: [{
    alt: "Square normalized: wind-chime-ocean"
    contentType: IMAGE
    originalSource: "<resourceUrl from Step 1>"
  }]) {
    files {
      ... on MediaImage { id image { url } }
    }
  }
}
```

### Step 4: Set Metafield

```graphql
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/Product/123456"
    namespace: "image"
    key: "square"
    value: "gid://shopify/MediaImage/789012"
    type: "file_reference"
  }]) {
    metafields { id }
  }
}
```

All steps are implemented in `lib/shopify_images.js`.

---

## Theme Integration

### Liquid: Collection Grid Card

In the card template (e.g., `card-product.liquid` or equivalent snippet),
prefer the square image if it exists:

```liquid
{%- comment -%} Square image for grid consistency {%- endcomment -%}
{%- assign sq_img = product.metafields.image.square -%}
{%- if sq_img != blank -%}
  {%- assign card_image = sq_img -%}
{%- else -%}
  {%- assign card_image = product.featured_media -%}
{%- endif -%}

<img
  src="{{ card_image | image_url: width: 600 }}"
  srcset="{{ card_image | image_url: width: 352 }} 352w,
          {{ card_image | image_url: width: 600 }} 600w,
          {{ card_image | image_url: width: 1200 }} 1200w"
  width="600"
  height="600"
  loading="lazy"
  alt="{{ product.title | escape }}"
>
```

### PDP: Unchanged

The PDP gallery (`product-media.liquid` / `main-product.liquid`) continues to
use `product.media` — the square image never appears there because it's a
Shopify File, not a product media attachment.

---

## CSS: Enforcing Square Aspect Ratio

Even with square images, enforce 1:1 in CSS for safety:

```css
.card-product__image {
  aspect-ratio: 1 / 1;
  object-fit: cover;   /* fallback for non-square originals */
  width: 100%;
}
```

When the square metafield image is used, `object-fit: cover` has no effect
(image is already 1:1). For products without square images, it crops the
fallback to 1:1 as a graceful degradation.

---

## CLI Commands

```bash
# Sprint 1: Process locally (dry run)
node scripts/image_normalize.js --limit 5 --dry-run

# Sprint 1: Process locally (write files)
node scripts/image_normalize.js --limit 30

# Sprint 2: Process + upload to Shopify
node scripts/image_normalize.js --limit 30 --upload

# Process single product
node scripts/image_normalize.js --product "gid://shopify/Product/123456"

# Force reprocess all
node scripts/image_normalize.js --force
```

---

## Output Structure

```
out/
├── images/
│   ├── wind-chime-ocean/
│   │   ├── wind-chime-ocean_sq_1200.webp
│   │   ├── wind-chime-ocean_sq_1200.jpg
│   │   ├── wind-chime-ocean_sq_600.webp
│   │   └── wind-chime-ocean_sq_600.jpg
│   └── ...
├── image_manifest.json    ← idempotency tracker
└── image_report.json      ← per-image decision log
```

### Report Entry Schema

```json
{
  "product_id": "gid://shopify/Product/...",
  "handle": "wind-chime-ocean",
  "title": "Wind Chime Ocean",
  "image_url": "https://cdn.shopify.com/...",
  "strategy": "CROP_SQUARE | FIT_AND_PAD_SOLID | FIT_AND_PAD_EDGE | FIT_AND_PAD_MIRROR",
  "bbox": { "x": 120, "y": 45, "w": 800, "h": 920 },
  "confidence": 0.85,
  "bg_type": "solid | gradient | textured | lifestyle",
  "margins": { "top": "4.5%", "bottom": "5.2%", "left": "12.0%", "right": "11.8%" },
  "output_files": {
    "webp_1200": "out/images/.../..._sq_1200.webp",
    "webp_600": "out/images/.../..._sq_600.webp",
    "jpg_1200": "out/images/.../..._sq_1200.jpg",
    "jpg_600": "out/images/.../..._sq_600.jpg"
  },
  "shopify_file_id": "gid://shopify/MediaImage/...",
  "metafield_id": "gid://shopify/Metafield/...",
  "warnings": [],
  "error": null
}
```

---

## Rollback

To remove all square metafields:

```bash
# Query all products with image.square metafield and delete them
node -e "
const { gqlFetch } = require('./lib/shopify_images');
// ... bulk metafieldDelete mutation
"
```

The uploaded files remain in Shopify Files but become orphaned (harmless).
Product galleries are never affected.
