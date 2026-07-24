#!/usr/bin/env node
/**
 * import_shopify.js
 * ─────────────────
 * Bulk importer: reads local CSVs → creates/updates Shopify products,
 * variants, and metafields via the Admin GraphQL API.
 *
 * Usage:
 *   node scripts/import_shopify.js
 *
 * Env vars (see .env.example):
 *   SHOPIFY_STORE, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION
 *   DRY_RUN=true|false   LIMIT=<n>   DEFAULT_STATUS=DRAFT|ACTIVE
 */

'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// ─── Configuration ────────────────────────────────────────────────────────────
const STORE     = process.env.SHOPIFY_STORE;
const TOKEN     = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION   = process.env.SHOPIFY_API_VERSION || '2026-04';
const DRY_RUN   = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const LIMIT     = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const DEFAULT_STATUS = process.env.DEFAULT_STATUS || 'DRAFT';

const GQL_URL   = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const DATA_DIR  = path.resolve(__dirname, '..', 'data');
const OUT_DIR   = path.resolve(__dirname, '..', 'out');

const METAFIELD_NS = 'specs';

// Rate-limit: Shopify GraphQL gives 1000 cost points that refill at 50/sec.
// We track available points and pause when low.
let availablePoints = 1000;
let lastRefillTime  = Date.now();
const REFILL_RATE   = 50; // points per second
const MIN_THRESHOLD = 100;

// ─── Logging ──────────────────────────────────────────────────────────────────
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const logStream = fs.createWriteStream(path.join(OUT_DIR, 'import.log'), { flags: 'w' });

function log(level, msg, data) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}` + (data ? ' ' + JSON.stringify(data) : '');
  logStream.write(line + '\n');
  if (level === 'ERROR' || level === 'WARN') {
    console.error(line);
  } else if (!['DEBUG'].includes(level)) {
    console.log(line);
  }
}

// ─── Summary tracking ────────────────────────────────────────────────────────
const summary = {
  total_csv_products: 0,
  processed: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  dry_run: DRY_RUN,
  failures: [],
  started_at: new Date().toISOString(),
  finished_at: null,
};

// ─── CSV readers ──────────────────────────────────────────────────────────────
function readCSV(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    log('WARN', `CSV not found, skipping: ${filename}`);
    return [];
  }
  const raw = fs.readFileSync(filepath, 'utf-8');
  return parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true });
}

// ─── Handle generation ───────────────────────────────────────────────────────
function toHandle(name, sku) {
  // Deterministic: slugify the product name, append sku to guarantee uniqueness.
  const slug = (name || sku || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const skuSlug = (sku || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return skuSlug ? `${slug}-${skuSlug}` : slug;
}

// ─── Map category to Shopify product_type ─────────────────────────────────────
function toProductType(category) {
  const map = { fabric: 'Fabric', furniture: 'Furniture', lighting: 'Lighting', wallpaper: 'Wallpaper' };
  return map[(category || '').toLowerCase()] || category || '';
}

// ─── Build metafields from attributes ─────────────────────────────────────────
function buildMetafields(attrs, category) {
  if (!attrs) return [];
  const mf = [];
  const skip = new Set(['sku', 'details_json']); // these aren't metafields

  for (const [key, value] of Object.entries(attrs)) {
    if (skip.has(key)) continue;
    const val = (value || '').trim();
    if (!val) continue;

    const mfType = val.includes('\n') ? 'multi_line_text_field' : 'single_line_text_field';
    mf.push({
      namespace: METAFIELD_NS,
      key: key,
      value: val,
      type: mfType,
    });
  }

  // Handle details_json for furniture — flatten into separate metafields
  if (category === 'furniture' && attrs.details_json) {
    try {
      const details = typeof attrs.details_json === 'string'
        ? JSON.parse(attrs.details_json)
        : attrs.details_json;
      if (details && typeof details === 'object' && Object.keys(details).length > 0) {
        for (const [dk, dv] of Object.entries(details)) {
          const detailVal = (dv || '').trim();
          if (!detailVal) continue;
          const detailKey = dk.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
          const detailType = detailVal.includes('\n') ? 'multi_line_text_field' : 'single_line_text_field';
          mf.push({
            namespace: METAFIELD_NS,
            key: detailKey,
            value: detailVal,
            type: detailType,
          });
        }
      }
    } catch (e) {
      log('DEBUG', `Could not parse details_json`, { error: e.message });
    }
  }

  return mf;
}

// ─── Build common metafields from core_products columns ───────────────────────
function buildCoreMetafields(row) {
  const mf = [];
  const metaColumns = {
    material: 'material',
    color: 'color',
    lead_time: 'lead_time',
    country_of_origin: 'country_of_origin',
  };
  for (const [csvCol, mfKey] of Object.entries(metaColumns)) {
    const val = (row[csvCol] || '').trim();
    if (!val) continue;
    mf.push({
      namespace: METAFIELD_NS,
      key: mfKey,
      value: val,
      type: 'single_line_text_field',
    });
  }
  return mf;
}

// ─── Build variants from furniture_variants ───────────────────────────────────
function buildVariants(variantRows, defaultPrice) {
  if (!variantRows || variantRows.length === 0) {
    // Single default variant
    return [{
      sku: null, // will be set at product level
      price: defaultPrice,
      options: ['Default'],
      inventoryPolicy: 'DENY',
    }];
  }

  return variantRows.map(vr => {
    const price = vr.price ? parseFloat(vr.price) : defaultPrice;
    const optionName = vr.variant_name || 'Default';
    return {
      sku: null,
      price: isNaN(price) ? 0 : price,
      options: [optionName],
      inventoryPolicy: 'DENY',
      // store dimension metafields at variant level if needed
      _dimensions: {
        width: vr.width || '',
        depth: vr.depth || '',
        height: vr.height || '',
        seat_height: vr.seat_height || '',
        arm_height: vr.arm_height || '',
      },
    };
  });
}

// ─── Collect images ───────────────────────────────────────────────────────────
function normalizeImageUrl(url) {
  // 1. Decode URL-encoded paths (e.g. %2F → /)
  let normalized = decodeURIComponent(url);
  // 2. Strip query strings — Shopify uses the URL path to detect file extension
  //    e.g. ...jpg?v=12345 → Shopify can't see the .jpg
  const qIdx = normalized.indexOf('?');
  if (qIdx > 0) normalized = normalized.substring(0, qIdx);
  // 3. Ensure https
  if (normalized.startsWith('http://')) {
    normalized = 'https://' + normalized.slice(7);
  }
  return normalized;
}

function collectImages(row) {
  const images = [];
  for (let i = 1; i <= 10; i++) {
    const url = (row[`image_url_${i}`] || '').trim();
    if (url && url.startsWith('http')) images.push(normalizeImageUrl(url));
  }
  return images;
}

// ─── GraphQL fetch with throttle + retry ──────────────────────────────────────
async function gqlFetch(query, variables = {}, retries = 3) {
  if (DRY_RUN) {
    log('DEBUG', 'DRY_RUN: would execute GraphQL', { query: query.slice(0, 80) });
    return { data: null, extensions: null };
  }

  // Refill available points based on elapsed time
  const now = Date.now();
  const elapsed = (now - lastRefillTime) / 1000;
  availablePoints = Math.min(1000, availablePoints + elapsed * REFILL_RATE);
  lastRefillTime = now;

  // Throttle if running low
  if (availablePoints < MIN_THRESHOLD) {
    const waitMs = ((MIN_THRESHOLD - availablePoints) / REFILL_RATE) * 1000 + 200;
    log('DEBUG', `Throttling ${Math.round(waitMs)}ms (available: ${Math.round(availablePoints)} pts)`);
    await sleep(waitMs);
    availablePoints = Math.min(1000, availablePoints + waitMs / 1000 * REFILL_RATE);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(GQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
        log('WARN', `Rate limited (429), waiting ${retryAfter}s`, { attempt });
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = await res.json();

      // Update available cost points from response
      if (json.extensions && json.extensions.cost) {
        availablePoints = json.extensions.cost.throttleStatus.currentlyAvailable;
      }

      // Check for user errors in the response
      if (json.errors) {
        log('ERROR', 'GraphQL errors', { errors: json.errors });
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
      }

      return json;
    } catch (err) {
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt) * 500;
        log('WARN', `Attempt ${attempt} failed, retrying in ${backoff}ms`, { error: err.message });
        await sleep(backoff);
      } else {
        throw err;
      }
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Shopify GraphQL: find product by handle ──────────────────────────────────
async function findProductByHandle(handle) {
  const query = `
    query findProduct($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            title
            handle
            variants(first: 100) {
              edges { node { id sku } }
            }
          }
        }
      }
    }
  `;
  const result = await gqlFetch(query, { query: `handle:${handle}` });
  const edges = result?.data?.products?.edges || [];
  return edges.length > 0 ? edges[0].node : null;
}

// ─── Shopify GraphQL: create or update product via productSet ─────────────────
// The 2026-04 API uses the new product model — images, variants, and options
// are NOT part of ProductInput. We use productSet (synchronous) which supports
// productOptions + variants in ProductSetInput, then add media separately.
async function createProduct(product) {
  const query = `
    mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(input: $input, synchronous: $synchronous) {
        product {
          id
          handle
          title
          variants(first: 100) {
            edges { node { id sku } }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  // Build productOptions + variant option values
  const isMultiVariant = product.variants.length > 1
    || (product.variants[0] && product.variants[0].options[0] !== 'Default');

  const optionName = product.optionName || 'Size';
  const optionValues = isMultiVariant
    ? [...new Set(product.variants.map(v => v.options[0]))]
    : ['Default Title'];

  const variants = product.variants.map(v => {
    const variantInput = {
      optionValues: isMultiVariant
        ? [{ optionName, name: v.options[0] }]
        : [{ optionName: 'Title', name: 'Default Title' }],
      price: parseFloat(v.price) || 0,
      inventoryPolicy: 'DENY',
    };
    // Set SKU (use product SKU as fallback)
    if (v.sku || product.sku) {
      variantInput.sku = v.sku || product.sku;
    }
    return variantInput;
  });

  const productOptions = isMultiVariant
    ? [{ name: optionName, values: optionValues.map(v => ({ name: v })) }]
    : [{ name: 'Title', values: [{ name: 'Default Title' }] }];

  const input = {
    title: product.title,
    handle: product.handle,
    descriptionHtml: product.descriptionHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: product.tags || [],
    status: product.status || DEFAULT_STATUS,
    productOptions,
    variants,
  };

  const result = await gqlFetch(query, { input, synchronous: true });
  if (result?.data?.productSet?.userErrors?.length > 0) {
    const errs = result.data.productSet.userErrors;
    throw new Error(`productSet failed: ${JSON.stringify(errs)}`);
  }
  const created = result?.data?.productSet?.product;

  // Add images via productCreateMedia (separate call)
  if (created && product.images.length > 0) {
    await addProductMedia(created.id, product.images);
  }

  return created;
}

// ─── Shopify GraphQL: add media (images) to a product ─────────────────────────
async function addProductMedia(productId, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return;

  const query = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage { id }
        }
        mediaUserErrors {
          field
          message
          code
        }
      }
    }
  `;

  const media = imageUrls.map(url => ({
    mediaContentType: 'IMAGE',
    originalSource: url,
  }));

  const result = await gqlFetch(query, { productId, media });
  if (result?.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
    log('WARN', 'Media creation had errors', {
      errors: result.data.productCreateMedia.mediaUserErrors,
      productId,
    });
  }
  return result?.data?.productCreateMedia?.media;
}

// ─── Shopify GraphQL: update product (basic fields only) ──────────────────────
async function updateProduct(shopifyId, product) {
  const query = `
    mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(input: $input, synchronous: $synchronous) {
        product {
          id
          handle
          title
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const input = {
    id: shopifyId,
    title: product.title,
    descriptionHtml: product.descriptionHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: product.tags || [],
    status: product.status || DEFAULT_STATUS,
  };

  const result = await gqlFetch(query, { input, synchronous: true });
  if (result?.data?.productSet?.userErrors?.length > 0) {
    const errs = result.data.productSet.userErrors;
    throw new Error(`Update failed: ${JSON.stringify(errs)}`);
  }
  return result?.data?.productSet?.product;
}

// ─── Shopify GraphQL: upsert metafields on a product ─────────────────────────
async function upsertMetafields(ownerId, metafields) {
  if (!metafields || metafields.length === 0) return;

  const query = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          namespace
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Batch metafields in groups of 25 (API limit per call)
  const BATCH_SIZE = 25;
  for (let i = 0; i < metafields.length; i += BATCH_SIZE) {
    const batch = metafields.slice(i, i + BATCH_SIZE).map(mf => ({
      ownerId: ownerId,
      namespace: mf.namespace,
      key: mf.key,
      value: mf.value,
      type: mf.type,
    }));

    const result = await gqlFetch(query, { metafields: batch });
    if (result?.data?.metafieldsSet?.userErrors?.length > 0) {
      log('WARN', 'Metafield upsert had user errors', {
        errors: result.data.metafieldsSet.userErrors,
        ownerId,
      });
    }
  }
}

// ─── Build product model ──────────────────────────────────────────────────────
function buildProductModels(coreRows, attrMaps, variantMap) {
  const products = [];
  const seenHandles = new Set();

  for (const row of coreRows) {
    const sku = (row.sku || '').trim();
    if (!sku) continue;

    const name = (row.name || '').trim();
    const category = (row.category || '').toLowerCase();

    // Generate deterministic handle
    let handle = toHandle(name, sku);
    // Guarantee uniqueness in this batch
    if (seenHandles.has(handle)) {
      let suffix = 2;
      while (seenHandles.has(`${handle}-${suffix}`)) suffix++;
      handle = `${handle}-${suffix}`;
    }
    seenHandles.add(handle);

    // Core product fields
    const price = row.price ? parseFloat(row.price) : 0;
    const status = row.status === 'APPROVED' ? (DEFAULT_STATUS || 'DRAFT') : 'DRAFT';

    const product = {
      sku,
      title: name || sku,
      handle,
      descriptionHtml: row.description || '',
      vendor: row.vendor || '',
      productType: toProductType(category),
      tags: [category].filter(Boolean),
      status,
      images: collectImages(row),
      variants: [],
      metafields: [],
      optionName: 'Size',
      _category: category,
    };

    // Build variants from furniture_variants (or single default)
    const furnitureVariants = variantMap[sku] || [];
    if (category === 'furniture' && furnitureVariants.length > 0) {
      product.variants = buildVariants(furnitureVariants, price);
    } else {
      product.variants = buildVariants(null, price);
    }

    // Build metafields from core columns
    product.metafields.push(...buildCoreMetafields(row));

    // Build metafields from category-specific attributes
    const attrMap = attrMaps[category];
    if (attrMap && attrMap[sku]) {
      product.metafields.push(...buildMetafields(attrMap[sku], category));
    }

    // Deduplicate metafields by namespace+key (last wins)
    const mfMap = new Map();
    for (const mf of product.metafields) {
      mfMap.set(`${mf.namespace}.${mf.key}`, mf);
    }
    product.metafields = Array.from(mfMap.values());

    products.push(product);
  }

  return products;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('INFO', '═══════════════════════════════════════════════════');
  log('INFO', 'Shopify Bulk Importer starting', {
    store: STORE,
    api_version: VERSION,
    dry_run: DRY_RUN,
    limit: LIMIT,
    default_status: DEFAULT_STATUS,
  });
  log('INFO', '═══════════════════════════════════════════════════');

  if (!DRY_RUN && (!STORE || !TOKEN)) {
    log('ERROR', 'SHOPIFY_STORE and SHOPIFY_ADMIN_ACCESS_TOKEN are required for live runs.');
    process.exit(1);
  }

  // 1. Read CSVs
  log('INFO', 'Reading CSV files...');
  const coreRows = readCSV('core_products.csv');
  const fabricAttrs = readCSV('fabric_attributes.csv');
  const furnitureAttrs = readCSV('furniture_attributes.csv');
  const furnitureVars = readCSV('furniture_variants.csv');
  const lightingAttrs = readCSV('lighting_attributes.csv');
  const wallpaperAttrs = readCSV('wallpaper_attributes.csv');

  log('INFO', 'CSV row counts', {
    core: coreRows.length,
    fabric_attrs: fabricAttrs.length,
    furniture_attrs: furnitureAttrs.length,
    furniture_vars: furnitureVars.length,
    lighting_attrs: lightingAttrs.length,
    wallpaper_attrs: wallpaperAttrs.length,
  });

  // 2. Index attributes by SKU
  const indexBySku = (rows) => {
    const map = {};
    for (const r of rows) {
      const sku = (r.sku || '').trim();
      if (sku) map[sku] = r;
    }
    return map;
  };

  const attrMaps = {
    fabric: indexBySku(fabricAttrs),
    furniture: indexBySku(furnitureAttrs),
    lighting: indexBySku(lightingAttrs),
    wallpaper: indexBySku(wallpaperAttrs),
  };

  // Index furniture variants by SKU (one SKU → many variant rows)
  const variantMap = {};
  for (const vr of furnitureVars) {
    const sku = (vr.sku || '').trim();
    if (!sku) continue;
    if (!variantMap[sku]) variantMap[sku] = [];
    variantMap[sku].push(vr);
  }

  // 3. Build product models
  let products = buildProductModels(coreRows, attrMaps, variantMap);
  summary.total_csv_products = products.length;
  log('INFO', `Built ${products.length} product models from CSV data.`);

  // Apply LIMIT
  if (LIMIT && LIMIT > 0) {
    products = products.slice(0, LIMIT);
    log('INFO', `LIMIT=${LIMIT}, processing only first ${products.length} products.`);
  }

  // 4. Process each product
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const progress = `[${i + 1}/${products.length}]`;

    try {
      log('INFO', `${progress} Processing: ${product.title} (${product.sku})`);
      log('DEBUG', `  handle=${product.handle}, variants=${product.variants.length}, metafields=${product.metafields.length}`);

      if (DRY_RUN) {
        log('INFO', `${progress} DRY_RUN: would create/update "${product.title}"`, {
          handle: product.handle,
          variants: product.variants.length,
          metafields: product.metafields.map(m => `${m.namespace}.${m.key}`),
          images: product.images.length,
          status: product.status,
        });
        summary.processed++;
        summary.created++; // assume create in dry-run
        continue;
      }

      // Check if product already exists
      const existing = await findProductByHandle(product.handle);

      if (existing) {
        // Update existing product
        log('INFO', `${progress} Updating existing product: ${existing.id}`);
        await updateProduct(existing.id, product);
        await upsertMetafields(existing.id, product.metafields);
        summary.updated++;
      } else {
        // Create new product
        log('INFO', `${progress} Creating new product: ${product.handle}`);
        const created = await createProduct(product);
        if (created) {
          log('INFO', `${progress} Created: ${created.id} → ${created.handle}`);
          // Set metafields on newly created product
          await upsertMetafields(created.id, product.metafields);
        }
        summary.created++;
      }

      summary.processed++;

      // Small delay between products to be gentle on rate limits
      await sleep(250);

    } catch (err) {
      log('ERROR', `${progress} FAILED: ${product.title} (${product.sku})`, { error: err.message });
      summary.failed++;
      summary.failures.push({
        sku: product.sku,
        handle: product.handle,
        error: err.message,
      });
      summary.processed++;
    }
  }

  // 5. Write summary
  summary.finished_at = new Date().toISOString();
  summary.skipped = summary.total_csv_products - summary.processed;

  const summaryPath = path.join(OUT_DIR, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  log('INFO', '═══════════════════════════════════════════════════');
  log('INFO', 'Import complete.', {
    processed: summary.processed,
    created: summary.created,
    updated: summary.updated,
    failed: summary.failed,
    skipped: summary.skipped,
  });
  log('INFO', `Summary written to ${summaryPath}`);
  log('INFO', `Log written to ${path.join(OUT_DIR, 'import.log')}`);
  log('INFO', '═══════════════════════════════════════════════════');

  logStream.end();
}

main().catch(err => {
  log('ERROR', 'Fatal error', { error: err.message, stack: err.stack });
  summary.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  logStream.end();
  process.exit(1);
});
