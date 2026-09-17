# Artistic Frame Demo Fixture (Source#143)

Bounded cohort fixture for Issue #11 client demo. Consumes the deterministic manifest/payload/fingerprint from `Adversoup/RueIV-Source#143`.

## Expected files after Source#143 ingest

| File | Purpose |
|------|---------|
| `manifest.json` | Selection rules, Source#143 fingerprint, SHA256 checksum |
| `products.json` | Sanitized Hub-shaped records (≤50, Artistic Frame only) |

## Ingest from Source#143 export

```bash
node scripts/ingest_source143_af_cohort.js --from /path/to/source143/export
```

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
