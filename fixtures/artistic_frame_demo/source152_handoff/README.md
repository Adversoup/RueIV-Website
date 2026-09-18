# Source#152 handoff slot (50-product cohort)

Checked-in bridge directory for merged `Adversoup/RueIV-Source#152` artifacts on main.

## Source paths (RueIV-Source main)

| Artifact | Path |
|----------|------|
| Cohort manifest | `docs/ai/readiness/issue-146/artistic_frame_demo_cohort_50_manifest.json` |
| Enriched payload | `docs/ai/readiness/issue-146/artistic_frame_demo_enriched_payload.json` |

## Embedded fingerprints (do not recompute whole-document JSON hashes)

| Artifact | Field | SHA-256 |
|----------|-------|---------|
| Manifest | `fingerprint_sha256` | `665336f252075f07f77373df08c642973be11339fd2d3160a226ff77a393883a` |
| Payload | `payload_fingerprint_sha256` | `5846a10beb8a73da0380281694ce0fd91ee7af26667337c06fe0c233fea898ff` |
| Payload | `cohort_manifest_fingerprint` | `665336f252075f07f77373df08c642973be11339fd2d3160a226ff77a393883a` |

There is **no top-level `gate`** field in the merged artifacts.

## Checked-in file names

| Manifest | Export |
|----------|--------|
| `artistic_frame_demo_cohort_manifest.json` | `artistic_frame_demo_enriched_payload.json` |

## Export contract (exactly 50 products)

Top-level payload fields:

- `product_count: 50`
- `media_handoff_mode: "hub_processed_media"`
- `price_policy: "authenticated_only_display"`

Each product must include:

- `vendor_sku`, `title`, `brand: "Artistic Frame"`
- authoritative numeric `price` + `price_source`
- `media_sync_ready: true`
- `primary_image_hub_url` (e.g. `/media/images/artistic-frame/2505A.jpg`) and/or `primary_image_processed_ref`
- raw `primary_image_source_url(s)` are **lineage only** — never the final Shopify media source

Optional checked-in processed assets (fallback when Hub public URL is unavailable):

`media/processed/artistic-frame/{SKU}.jpg`

## Hub media resolution

1. `CONSORTIUM_HUB_PUBLIC_ORIGIN` + `primary_image_hub_url` (Shopify `productCreateMedia.originalSource`)
2. Local checked-in processed asset under this directory → staged upload (no manual JPEG handoff)
3. Raw Artistic Frame URLs are never used as final media

## Commands

```bash
npm run af-demo:ingest:152
npm run af-demo:preflight
npm run af-demo:sync          # dry-run
npm run af-demo:verify:152    # ingest + preflight + sync + rollback dry-run
```

Live sync requires preflight READY, fetchable Hub/local media, and Shopify credentials.
