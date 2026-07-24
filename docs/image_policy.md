# Image Normalization Policy — Rue IV Platform

> Version 1.0 — 2026-02-22
> Owner: Platform Engineering

---

## 1  Objective

Every product in the Rue IV catalogue must have a **1 : 1 square image** for use
in collection grids, search results, and thumbnails.  
The original image is never deleted — we **add** a normalized square alongside it.

### Non-negotiable Rule

> **Never clip the product.**  If the subject would be cut by a square crop we
> must expand the canvas instead.

---

## 2  Definitions

| Term | Meaning |
|------|---------|
| **Subject bbox** | Axis-aligned bounding-box of the product inside the image, expressed as `{x, y, w, h}` in pixels (origin = top-left). |
| **Safe margin** | The gap between the bbox edge and the image edge, in % of image dimension. |
| **PADDING_THRESHOLD** | **10 %** — minimum safe margin on *every* side for a crop to be considered safe. |
| **PADDING_FACTOR** | **1.15** — when cropping, the square side = `max(bbox.w, bbox.h) × 1.15`, adding at least 15 % breathing room around the product. |
| **Target sizes** | `1200 × 1200` (high-res) and `600 × 600` (thumbnail). |

---

## 3  Pipeline Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Fetch image │ ──► │ Vision step  │ ──► │  Strategy    │ ──► │  Output      │
│  from Shopify│     │ (bbox, conf, │     │  decision    │     │  600 + 1200  │
│              │     │  bg_type)    │     │  CROP | PAD  │     │  WebP + JPG  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                          ┌─────┴─────┐
                                          │  Upload   │
                                          │  back to  │
                                          │  Shopify  │
                                          └───────────┘
```

---

## 4  Vision Analysis Contract

```jsonc
// analyze_image(url) → AnalysisResult
{
  "bbox": { "x": 120, "y": 45, "w": 800, "h": 920 },
  "confidence": 0.92,        // 0-1; below 0.5 → flag for manual review
  "bg_type": "solid"         // enum: solid | gradient | textured | lifestyle
}
```

Implementations may be:

| Provider | Notes |
|----------|-------|
| **OpenAI gpt-4o vision** | Prompt returns JSON bbox + bg classification |
| **Google Cloud Vision** | Object localization → bbox; bg heuristic via dominant colors |
| **Local saliency** | `sharp.stats()` edge-trim + histogram peak → bbox, bg |
| **Manual fallback** | Treat full image as bbox (confidence 0.0) — triggers EXPAND_PAD |

---

## 5  Decision Logic (deterministic)

```
given: image (W × H), bbox {x, y, w, h}, confidence, bg_type

1. margin_top    = bbox.y / H
   margin_bottom = (H - bbox.y - bbox.h) / H
   margin_left   = bbox.x / W
   margin_right  = (W - bbox.x - bbox.w) / W

2. safe = all four margins >= PADDING_THRESHOLD (0.10)

3. IF safe:
      strategy = CROP
      side = max(bbox.w, bbox.h) × PADDING_FACTOR
      center = center of bbox
      square region = side × side centered on bbox center, clamped to image bounds
      → Resize to 1200 then 600

4. ELSE:
      strategy = EXPAND_*
      target_side = max(W, H)          // make the short axis equal the long axis
      delta_x = target_side - W        // total pixels to add horizontally
      delta_y = target_side - H        // total pixels to add vertically
      pad_left   = floor(delta_x / 2)
      pad_right  = delta_x - pad_left
      pad_top    = floor(delta_y / 2)
      pad_bottom = delta_y - pad_top

      4a. IF outpaint available AND confidence >= 0.6:
            strategy = EXPAND_OUTPAINT
            call outpaint(image, target_side, bg hints)

      4b. ELSE:
            strategy = EXPAND_PAD
            IF bg_type == 'solid':
               sample dominant edge color → extend with solid fill
            ELSE:
               mirror-reflect edge strips (15 px) + Gaussian blur (σ 30) + subtle
               noise (σ 3) → blended fill
      → Resize to 1200 then 600
```

---

## 6  Background Fill — EXPAND_PAD Detail

### 6a  Solid / Near-Solid Background

1. Sample a 5 px strip along each edge that needs extending.
2. Compute median color per strip.
3. Fill padded region with that median color.
4. Apply a 3 px Gaussian feather at the seam.

### 6b  Gradient / Textured / Lifestyle Background

1. Mirror-reflect the edge strip (width = 15 px) into the new region.
2. Apply Gaussian blur (σ = 30 px) to the reflected strip.
3. Add Gaussian noise (σ = 3, clamped) for texture.
4. Alpha-blend the blurred strip over a solid fill of edge-median color to ensure
   the transition looks smooth.

**Visual example (described):**

```
Original (4:3 landscape):
┌─────────────────────┐
│  ░░░░░░░░░░░░░░░░░  │   ← textured bg
│  ░░░┌─────────┐░░░  │
│  ░░░│ PRODUCT │░░░  │
│  ░░░└─────────┘░░░  │
│  ░░░░░░░░░░░░░░░░░  │
└─────────────────────┘

After EXPAND_PAD (1:1 square):
┌──────────────────────────┐
│  ▓▓▓░░░░░░░░░░░░░░░░▓▓▓ │  ← blurred-mirror fill
│  ▓▓▓░░░░░░░░░░░░░░░░▓▓▓ │
│  ▓▓▓░░░┌─────────┐░░▓▓▓ │
│  ▓▓▓░░░│ PRODUCT │░░▓▓▓ │
│  ▓▓▓░░░└─────────┘░░▓▓▓ │
│  ▓▓▓░░░░░░░░░░░░░░░░▓▓▓ │
│  ▓▓▓░░░░░░░░░░░░░░░░▓▓▓ │
└──────────────────────────┘
  ▲ padded zone             ▲ padded zone
```

---

## 7  Output Specification

| Property | Value |
|----------|-------|
| Formats | **WebP** (primary, quality 85) + **JPG** (fallback, quality 88) |
| Sizes | `1200×1200` (high-res) + `600×600` (thumb) |
| Naming | `{handle}_sq_1200.webp`, `{handle}_sq_600.webp`, `{handle}_sq_1200.jpg`, `{handle}_sq_600.jpg` |
| Local dir | `out/images/{handle}/` |
| No upscale | If source max dimension < 1200, high-res = source dimension. If < 600, thumb = source dimension. Logged as warning. |

---

## 8  Idempotency & Resume

- `out/image_manifest.json` tracks every processed image:
  ```jsonc
  {
    "<product_id>": {
      "source_url": "https://cdn.shopify.com/...",
      "source_md5": "a1b2c3...",
      "strategy": "CROP",
      "processed_at": "2026-02-22T10:00:00Z",
      "outputs": {
        "webp_1200": "out/images/amelie-chair/amelie-chair_sq_1200.webp",
        "webp_600":  "out/images/amelie-chair/amelie-chair_sq_600.webp",
        "jpg_1200":  "out/images/amelie-chair/amelie-chair_sq_1200.jpg",
        "jpg_600":   "out/images/amelie-chair/amelie-chair_sq_600.jpg"
      },
      "shopify_file_id": "gid://shopify/MediaImage/...",   // filled after upload
      "metafield_id": "gid://shopify/Metafield/..."        // filled after upload
    }
  }
  ```
- On re-run, the pipeline skips any product whose `source_md5` matches the
  current CDN image.  Pass `--force` to reprocess everything.

---

## 9  Shopify Integration

### 9a  Where square images live

**Option chosen: Files API + product metafield.**

1. Upload the 1200 WebP to **Shopify Files** (`stagedUploadsCreate` → HTTP PUT →
   `fileCreate`).
2. Store the resulting CDN URL in product metafield:
   - Namespace: `image`
   - Key: `square`
   - Type: `file_reference`

### 9b  Why not product media?

Product media appears in the PDP gallery.  We don't want the square crop in the
gallery — it's only for collection grids and cards.  A separate metafield keeps
the square version invisible to the gallery but query-able in Liquid.

---

## 10  Theme Selection Rule

In `card-product.liquid`, prefer the square image if it exists:

```liquid
{%- assign sq_img = product.metafields.image.square -%}
{%- if sq_img != blank -%}
  {%- assign card_image = sq_img -%}
{%- else -%}
  {%- assign card_image = product.featured_media -%}
{%- endif -%}
```

This ensures collection grids are consistent without breaking products that
haven't been processed yet.

---

## 11  Quality Checklist

- [ ] No product edge is clipped in any output.
- [ ] All outputs are exactly 1:1 aspect ratio.
- [ ] Expanded regions show no hard seam visible at 100 % zoom.
- [ ] File sizes: WebP < 150 KB for 600², < 500 KB for 1200² (typical).
- [ ] Batch of 120 products completes in < 15 min (excl. outpainting).
- [ ] Re-running the pipeline with no source changes produces zero API calls.

---

## 12  Sprint Plan

### Sprint 1 — Local Prototype (1 week)

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 1.1 | Install `sharp` + scaffold `scripts/image_normalize.js` | Script runs `node scripts/image_normalize.js --help` |
| 1.2 | Vision interface stub (`lib/vision.js`) | `analyzeImage(url)` returns bbox JSON — uses saliency/edge-trim heuristic |
| 1.3 | CROP strategy | 10 landscape & portrait test images produce subject-centered 1:1 crops, product never clipped |
| 1.4 | EXPAND_PAD — solid bg | 5 solid-bg test images padded, seam invisible at 100 % zoom |
| 1.5 | EXPAND_PAD — textured bg | 5 textured-bg test images padded, seam acceptable |
| 1.6 | Output pipeline (WebP + JPG, 600 + 1200) | `out/images/` contains 4 files × 20 products |
| 1.7 | `out/image_report.json` with per-image stats | JSON validates against schema, all 20 entries present |
| 1.8 | Idempotency — re-run skips already-done | Second run logs "0 new images" and exits in < 2 s |

### Sprint 2 — Shopify Integration (1 week)

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 2.1 | `lib/shopify_upload.js` — staged upload → Files API | File visible in Shopify Files admin |
| 2.2 | Write `image.square` metafield on product | Metafield visible in Admin → Product → Metafields |
| 2.3 | Theme hook in `card-product.liquid` | Collection grid shows square image, PDP gallery shows original |
| 2.4 | Batch mode — process all 120 products | Report shows 120 entries, 0 failures |
| 2.5 | Rate limiting + resume after failure | Kill mid-batch, re-run picks up where it left off |
| 2.6 | AI outpainting integration (optional) | If API key present, uses outpaint; else falls back to PAD |
| 2.7 | Monitoring & alerting | Slack/log webhook on failure; daily cron plan documented |

---

## 13  Thresholds Summary

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `PADDING_THRESHOLD` | 10 % | Below this, the subject is too close to the edge to crop safely. |
| `PADDING_FACTOR` | 1.15 | 15 % breathing room around the product avoids a "packed" look. |
| `MIN_CONFIDENCE` | 0.50 | Below this, skip auto-processing and flag for manual review. |
| `OUTPAINT_CONFIDENCE` | 0.60 | Outpainting needs decent bbox; below this, use PAD instead. |
| `EDGE_SAMPLE_WIDTH` | 5 px | Strip width for solid-bg median color sampling. |
| `MIRROR_STRIP_WIDTH` | 15 px | Strip width for mirror-reflect fill. |
| `BLUR_SIGMA` | 30 | Gaussian blur sigma for reflected fill. |
| `NOISE_SIGMA` | 3 | Subtle noise to break up banding in filled areas. |
| `WEBP_QUALITY` | 85 | Good balance of size vs. quality. |
| `JPG_QUALITY` | 88 | Slightly higher than WebP since JPG compresses less effectively. |
