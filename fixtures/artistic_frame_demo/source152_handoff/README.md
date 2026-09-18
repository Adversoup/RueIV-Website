# Source#152 handoff slot (50-product cohort)

Checked-in bridge directory for `Adversoup/RueIV-Source#152` / PR #152.

## Required upstream gate

`ARTISTIC_FRAME_DEMO_TEXT_PRICE_HUB_PROCESSED_MEDIA_READY_FOR_SHOPIFY_SYNC`

## Expected fingerprints

| Artifact | SHA-256 |
|----------|---------|
| Cohort manifest | `665336f252075f07f77373df08c642973be11339fd2d3160a226ff77a393883a` |
| Export payload | `5846a10beb8a73da0380281694ce0fd91ee7af26667337c06fe0c233fea898ff` |

## Expected files

| Manifest | Export |
|----------|--------|
| `artistic_frame_showcase_cohort_manifest.json` | `artistic_frame_shopify_export_payload.json` |

## Export contract (exactly 50 products)

Each record must include:

- `sku`, `title`, `canonical_vendor: "Artistic Frame"`
- authoritative `price` and/or `variants[].price` (Website never invents prices)
- `media_handoff_mode: "hub_processed_media_sync_ready"`
- Hub-processed sync-ready media refs in `hub_processed_images[]`, `processed_media_refs[]`, or `images[]` (Hub refs only)
- `media_status: "sync_ready"` (or equivalent per Source manifest)
- raw `primary_image_source_url(s)` allowed as **lineage only** — MUST NOT be the sole media source

**Rejected at ingest/preflight:**

- `media_handoff_mode: "remote_source_url_import"` (raw Artistic Frame URLs as final media)
- Stale 28-product legacy payload fingerprints
- Cohort count ≠ 50

**Smoke SKU:** `2505A`

**Theme:** existing Modiva login-based price visibility — Website does not add price gating metafields/tags.

## Commands

```bash
npm run af-demo:bridge:152    # fetch from Source repo when accessible
npm run af-demo:ingest:152    # ingest checked-in handoff files
npm run af-demo:preflight
npm run af-demo:sync          # dry-run only until preflight READY + credentials
```

No live sync until Source#152 handoff is ingested and preflight is green.
