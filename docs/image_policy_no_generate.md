# Image Policy — No Generative Fill

> Version 2.0 — 2026-02-25
> Owner: Platform Engineering
> Supersedes: image_policy.md v1.0

---

## Non-Negotiable Rules

1. **NO AI image generation** — No DALL-E, Stable Diffusion, GPT-Image, or any generative model.
2. **NO outpainting** — No content synthesis to extend backgrounds.
3. **NO blurred gradient fill** — No cheap Instagram-style blur as default padding.
4. **Do NOT clip the product** — If a 1:1 crop would cut the subject, expand canvas instead.
5. **All output pixels must be derived from the original image** — via cropping, scaling, and non-generative padding only.

---

## Why This Policy Exists

| Concern | Explanation |
|---------|-------------|
| **Brand integrity** | Generated pixels may introduce colors, textures, or artifacts that misrepresent the product. |
| **Legal / IP** | AI-generated content may raise copyright concerns; real-pixel methods are legally safe. |
| **Reproducibility** | Non-generative transforms are deterministic — same input always produces same output. |
| **Performance** | No API calls to generative services means faster batch processing and lower cost. |
| **Quality control** | Edge-extend, mirror, and solid fill methods are predictable and easy to QA. |

---

## Allowed Strategies

### 1. `CROP_SQUARE`
- **When**: Subject bbox has ≥10% margin on all four sides.
- **How**: Center a square crop on the subject bbox with 15% breathing room.
- **Pixels**: 100% from original image.

### 2. `FIT_AND_PAD_SOLID`
- **When**: Background classified as `solid`.
- **How**: Sample 5px edge strips → compute median color → fill padding with that solid color.
- **Pixels**: Original + solid color sampled from original edges.

### 3. `FIT_AND_PAD_EDGE`
- **When**: Background classified as `gradient`.
- **How**: Replicate border pixels outward (nearest-neighbor stretch of 1px edge strips) + subtle noise.
- **Pixels**: Original + edge-replicated pixels + noise (random, non-generative).

### 4. `FIT_AND_PAD_MIRROR`
- **When**: Background classified as `textured` or `lifestyle`.
- **How**: Mirror-reflect 15px edge strips into padding → Gaussian blur (σ=30) → subtle noise (σ=3) → composite original back as sharp center.
- **Pixels**: Original + reflected/blurred original pixels + noise.

---

## What is NOT Allowed

| Method | Status | Reason |
|--------|--------|--------|
| DALL-E outpainting | **BANNED** | Generates new content |
| Stable Diffusion inpainting | **BANNED** | Generates new content |
| GPT-Image-1 edit | **BANNED** | Generates new content |
| Content-aware fill (Photoshop-style) | **BANNED** | Synthesizes new texture |
| Blurred gradient overlay | **BANNED as default** | Looks cheap; edge-extend preferred |
| Simple solid white/black fill | **Allowed but not preferred** | Acceptable if background is truly white/black |

---

## Thresholds

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `PADDING_THRESHOLD` | 10% | Minimum margin for safe crop |
| `PADDING_FACTOR` | 1.15 | 15% breathing room in crop mode |
| `MIN_CONFIDENCE` | 0.50 | Below → flag for manual review |
| `EDGE_SAMPLE_WIDTH` | 5px | Strip width for solid-bg color sampling |
| `MIRROR_STRIP_WIDTH` | 15px | Strip width for mirror-reflect fill |
| `BLUR_SIGMA` | 30 | Gaussian blur for reflected fill |
| `NOISE_SIGMA` | 3 | Subtle noise to break banding |
| `WEBP_QUALITY` | 85 | Output WebP quality |
| `JPG_QUALITY` | 88 | Output JPG fallback quality |

---

## Quality Acceptance Criteria

- [ ] 0 cases of product being clipped in any output.
- [ ] 0 use of generative fill (verified by code audit — no outpaint/generate imports).
- [ ] Padding looks neutral/premium — no obvious blur gradients.
- [ ] All outputs are exactly 1:1 aspect ratio.
- [ ] Seams invisible at 100% zoom for solid backgrounds.
- [ ] Seams acceptable (subtle) at 100% zoom for textured backgrounds.
- [ ] Batch of 30 images produces consistent thumbnails.

---

## Audit Checklist

To verify compliance, run:

```bash
# Verify no generative imports exist
grep -r "outpaint\|dall-e\|image.edit\|generative\|inpaint" scripts/ lib/ --include="*.js"

# Verify strategy names in report
cat out/image_report.json | jq '.entries[].strategy' | sort | uniq
# Expected: "CROP_SQUARE", "FIT_AND_PAD_SOLID", "FIT_AND_PAD_EDGE", "FIT_AND_PAD_MIRROR"
# NOT expected: "EXPAND_OUTPAINT", "GENERATE", anything with "AI"
```
