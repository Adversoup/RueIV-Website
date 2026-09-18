# Source#146 handoff slot (50-product revised cohort)

Checked-in bridge directory for `Adversoup/RueIV-Source#146`.

## Required upstream gate

`ARTISTIC_FRAME_DEMO_TEXT_ENRICHED_READY_FOR_SHOPIFY_REMOTE_MEDIA_IMPORT` (or successor gate from revised 50-product handoff)

## Expected files

| Manifest | Export |
|----------|--------|
| `artistic_frame_demo_enrichment_manifest.json` | `artistic_frame_demo_enriched_payload.json` |

## Export contract (exactly 50 products)

Each record must include:

- `sku`, `title`, `canonical_vendor: "Artistic Frame"`
- authoritative `price` and/or `variants[].price` (Website never invents prices)
- `media_handoff_mode: "hub_processed_media_sync_ready"`
- Hub-processed sync-ready media refs in `images[]`, `hub_processed_images[]`, or `processed_media_refs[]`
- `media_status: "sync_ready"` (or equivalent per Source manifest)

**Rejected at ingest/preflight:**

- `media_handoff_mode: "remote_source_url_import"` (raw Artistic Frame URLs only)
- Stale 28-product payload fingerprint `5f0b2771…`
- Raw `primary_image_source_url(s)` without Hub-processed refs

**Excluded SKUs:** `2532A`, `2588S` (unless Source manifest documents additional hard failures)

**Smoke SKU:** `2505A`

**Theme:** existing Modiva login-based price visibility — Website does not add price gating metafields/tags.

## Commands

```bash
npm run af-demo:bridge:146
npm run af-demo:preflight
npm run af-demo:sync          # dry-run only until revised handoff passes preflight
```

No live sync until revised 50-product Hub-processed handoff is ingested and preflight is green.
