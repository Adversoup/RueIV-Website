# Artistic Frame Demo Fixture (Source#146)

Bounded cohort fixture for Issue #11 client demo. Consumes the enriched/polished payload from `Adversoup/RueIV-Source#146` after gate `ARTISTIC_FRAME_DEMO_POPULATED_ENRICHED_READY_FOR_SHOPIFY_SYNC`.

## Expected files after Source#146 ingest

| File | Purpose |
|------|---------|
| `manifest.json` | Website fixture manifest (written by ingest) |
| `products.json` | Sanitized Hub-shaped records (≤50, Artistic Frame only) |

## Source#146 upstream export (RueIV-Source)

| File | Purpose |
|------|---------|
| `artistic_frame_demo_enriched_cohort_manifest.json` | Enriched cohort manifest + gate |
| `artistic_frame_demo_enriched_export.json` | 28 text-ready Hub-shaped export |

Legacy Source#143 file names are also accepted by `ingest_source146_af_cohort.js`.

Automatic exclusions: **2532A**, **2588S**.

## Ingest from Source#146 export

```bash
node scripts/ingest_source146_af_cohort.js --from /path/to/source146/export \
  [--manifest-fingerprint <hash>] [--export-fingerprint <hash>]
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
