# Artistic Frame Demo Fixture (Source#143)

Bounded cohort fixture for Issue #11 client demo. Consumes the deterministic manifest/payload/fingerprint from `Adversoup/RueIV-Source#143`.

## Expected files after Source#143 ingest

| File | Purpose |
|------|---------|
| `manifest.json` | Website fixture manifest (written by ingest) |
| `products.json` | Sanitized Hub-shaped records (≤50, Artistic Frame only) |

## Source#143 upstream export (RueIV-Source)

| File | Purpose |
|------|---------|
| `artistic_frame_showcase_cohort_manifest.json` | Cohort selection + manifest fingerprint |
| `artistic_frame_shopify_export_payload.json` | 30-product Hub-shaped export + export fingerprint |

Expected fingerprints (Issue #143 / PR #144):

- Manifest: `c07ee64f47fc0dc9359389cc52f1d7a1e06de6bc0528dade8715a78f3d632989`
- Export: `23fe31223434e84d9e677a2bc0efccb41c43e4a6ed6e0f500b833168ffcba434`

## Ingest from Source#143 export

```bash
node scripts/ingest_source143_af_cohort.js --from /path/to/source143/export \
  --manifest-fingerprint c07ee64f47fc0dc9359389cc52f1d7a1e06de6bc0528dade8715a78f3d632989 \
  --export-fingerprint 23fe31223434e84d9e677a2bc0efccb41c43e4a6ed6e0f500b833168ffcba434
```

## Public-ref bootstrap (fallback when Source repo inaccessible)

```bash
npm run af-demo:bootstrap
```

Image resolver pattern: `https://www.artisticframe.com/public/img/items/3/{filename}`. Bootstrap is dry-run authorized only.

The ingest script validates:

- vendor is exclusively `Artistic Frame`
- record count ≤ 50
- required fields present (sku, title, canonical_vendor)
- checksum matches `products.json`

## Scaffold mode (machinery only)

Until Source#143 lands, `products.scaffold.json` (3 records) supports dry-run preflight when passed `--allow-scaffold`. **Do not use scaffold for live Shopify mutation.**

```bash
npm run af-demo:preflight -- --allow-scaffold
```
