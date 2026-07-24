# Import Steps — Shopify Bulk Product Importer

## Prerequisites

- Node.js ≥ 18 (uses native `fetch`)
- Access to the Shopify store admin
- Store owner or staff account with API permissions

---

## Step 1: Create a Shopify Custom App

1. Open **Shopify Admin** → **Settings** → **Apps and sales channels**
2. Click **Develop apps** (top right)
3. Click **Create an app** → name it `RueIV Importer`
4. Go to **Configuration** → **Admin API integration**
5. Enable these **Admin API scopes**:
   - `write_products` — create/update products & variants
   - `read_products` — look up products by handle
   - `write_metafield_definitions` — (optional) define metafield schemas
   - `read_metafield_definitions` — read existing definitions
6. Click **Save** then **Install app**
7. Copy the **Admin API access token** (starts with `shpat_...`)
   - ⚠️ This is shown **only once**. Save it securely.

---

## Step 2: Set Environment Variables

Create a `.env` file in the project root (it's already in `.gitignore`):

```bash
cp .env.example .env
```

Edit `.env`:

```env
SHOPIFY_STORE=ruefour.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_your_token_here
SHOPIFY_API_VERSION=2024-10

# Options
DRY_RUN=true          # Set false for live import
LIMIT=                # Empty = all products; set a number to limit
DEFAULT_STATUS=DRAFT  # DRAFT or ACTIVE
```

---

## Step 3: Install Dependencies

```bash
cd /Users/Darkside/RueIV-platform
npm install
```

This installs `csv-parse` and `dotenv`.

---

## Step 4: Verify CSV Data

Ensure the CSV files are in `/data/`:

```bash
ls data/
# Expected:
# core_products.csv
# fabric_attributes.csv
# furniture_attributes.csv
# furniture_variants.csv
# lighting_attributes.csv
# wallpaper_attributes.csv
```

---

## Step 5: Dry Run

Always start with a dry run:

```bash
DRY_RUN=true node scripts/import_shopify.js
```

This will:
- Read all CSVs
- Build product models
- Log what it *would* create/update
- Write `out/summary.json` and `out/import.log`
- Make **zero** API calls

Review the output:

```bash
cat out/summary.json
```

---

## Step 6: Live Import (Small Batch First)

Start with a small batch:

```bash
DRY_RUN=false LIMIT=5 node scripts/import_shopify.js
```

Check the 5 products in Shopify Admin → **Products**.

---

## Step 7: Full Import

```bash
DRY_RUN=false node scripts/import_shopify.js
```

Monitor progress in the terminal. The script:
- Throttles to stay within Shopify's rate limits
- Retries transient failures (429s, network errors) with exponential backoff
- Logs every action to `out/import.log`

---

## Step 8: Verify in Shopify Admin

1. Go to **Products** — confirm products appear
2. Click a product → scroll to **Metafields** section
3. Verify specs data is populated (namespace: `specs`)
4. Check the storefront preview — the Specifications accordion on the
   product page should now show populated rows

---

## Step 9: Re-run (Idempotent)

Running the script again is safe:
- Products are looked up by **handle**
- If the handle exists → **update** core fields + **upsert** metafields
- If the handle is new → **create**

---

## Troubleshooting

### Authentication Errors

```
HTTP 401: Unauthorized
```

**Fix:** Double-check `SHOPIFY_ADMIN_ACCESS_TOKEN` in `.env`. Ensure the
Custom App is installed and the token hasn't been regenerated.

### Missing Scopes

```
Access denied - Required access: `write_products`
```

**Fix:** Go to the Custom App → Configuration → Admin API → enable the
missing scope → Save → Reinstall the app (this generates a new token).

### Rate Limiting

```
HTTP 429: Too Many Requests
```

The script handles this automatically with retry + backoff. If you see
persistent 429s, add a delay:

```bash
# The script already throttles, but you can reduce concurrency
# by increasing the sleep between products in the code (line ~340)
```

### CSV Parsing Errors

```
Invalid Record Length
```

**Fix:** Check for unescaped commas or quotes in the CSV. The parser uses
`relax_column_count: true` to be lenient, but severely malformed rows may
still fail. Fix the source CSV.

### Products Created as Draft

This is intentional — `DEFAULT_STATUS=DRAFT` by default. To create as
active:

```bash
DEFAULT_STATUS=ACTIVE DRY_RUN=false node scripts/import_shopify.js
```

### Metafields Not Showing in Theme

1. Confirm metafields exist: **Admin → Products → [product] → Metafields**
2. Ensure the metafield namespace is `specs` and keys are snake_case
3. The `specs-table.liquid` snippet only shows rows where `product.metafields.specs.<key>` is non-blank
4. You may need to define the metafield in **Settings → Custom data → Products** for it to be readable from Liquid (Shopify requires explicit definitions for storefront access)

### Store Domain Wrong

```
ENOTFOUND example.myshopify.com
```

**Fix:** Use the `*.myshopify.com` domain, not a custom domain.

---

## Output Files

| File | Contents |
|------|----------|
| `out/import.log` | Timestamped log of every action |
| `out/summary.json` | Counts: total, created, updated, failed, skipped |
