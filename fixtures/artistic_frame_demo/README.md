# Artistic Frame Demo Fixture (Source#146)

Bounded cohort fixture for Issue #11 client demo. Consumes the text-enriched remote-media handoff from `Adversoup/RueIV-Source#146` after gate `ARTISTIC_FRAME_DEMO_TEXT_ENRICHED_READY_FOR_SHOPIFY_REMOTE_MEDIA_IMPORT`.

## Expected files after Source#146 ingest

| File | Purpose |
|------|---------|
| `manifest.json` | Website fixture manifest (written by ingest) |
| `products.json` | Sanitized Hub-shaped records (≤50, Artistic Frame only) |

## Source#146 upstream handoff (RueIV-Source)

Drop sanitized files into `source146_handoff/` (see that directory README).

Preferred names:

| File | Purpose |
|------|---------|
| `artistic_frame_demo_text_enriched_cohort_manifest.json` | Text-enriched cohort manifest + gate |
| `artistic_frame_demo_text_enriched_export.json` | 28-product export with `primary_image_source_url(s)` |

Legacy enriched/Source#143 file names are also accepted by `ingest_source146_af_cohort.js`.

Automatic exclusions: **2532A**, **2588S**.

## Ingest from Source#146 export

```bash
npm run af-demo:ingest:146
# or: node scripts/ingest_source146_af_cohort.js --from fixtures/artistic_frame_demo/source146_handoff
```

## Remote media (no manual JPEG handoff)

Live sync attaches images via `productCreateMedia` + `originalSource` (Shopify fetches AF URLs). Smoke SKU: **2505A**. Proxy staged-upload fallback runs automatically if Shopify remote fetch fails.

## Public-ref bootstrap (fallback when Source repo inaccessible)

```bash
npm run af-demo:bootstrap
```

Bootstrap is dry-run authorized only — not for live sync.

## Scaffold mode (machinery only)

`products.scaffold.json` (3 records) supports dry-run preflight with `--allow-scaffold`. **Do not use scaffold for live Shopify mutation.**

```bash
npm run af-demo:preflight:scaffold
```
