# Source#146 text-enriched handoff slot

Checked-in bridge directory for `Adversoup/RueIV-Source#146` / PR #148.

## Required upstream gate

`ARTISTIC_FRAME_DEMO_TEXT_ENRICHED_READY_FOR_SHOPIFY_REMOTE_MEDIA_IMPORT`

## Expected files (one manifest + one export)

| Manifest (any one) | Export (any one) |
|--------------------|------------------|
| `artistic_frame_demo_text_enriched_cohort_manifest.json` | `artistic_frame_demo_text_enriched_export.json` |
| `artistic_frame_demo_remote_media_handoff_manifest.json` | `artistic_frame_demo_remote_media_export.json` |
| `manifest.json` | `products.json` |

Legacy enriched file names from prior Source#146 iterations are also accepted by the ingest script.

## Export record contract (50 products)

Each product record must include:

- `sku`, `title`, `canonical_vendor: "Artistic Frame"`
- `category`, `status: "APPROVED"`, `price: "0"`, `price_authority` (`trade`|`quote`|`hidden`)
- `description_html` (text-enriched copy)
- authoritative `price` and/or `variants[].price` (never invented by Website ingest)
- `media_handoff_mode: "remote_source_url_import"`
- `primary_image_source_url` and/or `primary_image_source_urls` and/or `gallery_image_source_urls`
- optional: `variants[]`, `tearsheet_pdf`, `brand`

**Excluded SKUs (applied at ingest):** `2532A`, `2588S`

**Smoke SKU (live media gate):** `2505A`

No manual media files — Shopify imports via `productCreateMedia(originalSource)`.

## Ingest

```bash
npm run af-demo:ingest:146
# or
node scripts/ingest_source146_af_cohort.js --from fixtures/artistic_frame_demo/source146_handoff
```

Then:

```bash
npm run af-demo:preflight
npm run af-demo:sync          # dry-run
npm run af-demo:sync:live     # smoke 2505A → remaining 49 + collection (auth-only price visibility)
```
