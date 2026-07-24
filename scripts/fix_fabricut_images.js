#!/usr/bin/env node
/**
 * fix_fabricut_images.js
 * ──────────────────────
 * Downloads Fabricut product images from S3, normalizes to 1200×1200 square,
 * and uploads them to Shopify as featured product images.
 *
 * Reads image_url_1 from core_products.csv for vendor=Fabricut,
 * downloads, crops/pads to 1200×1200 using sharp, then uploads via Shopify API.
 */

'use strict';
require('dotenv').config();

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');
const { parse } = require('csv-parse/sync');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const TARGET_SIZE = 1200;
const TEMP_DIR = path.resolve(__dirname, '..', 'out', 'images', '_fabricut_temp');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Rate-limited GraphQL ────────────────────────────────────────────────────
let availablePoints = 1000;
let lastRefillTime  = Date.now();

async function gql(query, variables = {}) {
  const now     = Date.now();
  const elapsed = (now - lastRefillTime) / 1000;
  availablePoints = Math.min(1000, availablePoints + elapsed * 50);
  lastRefillTime  = now;

  if (availablePoints < 100) {
    const wait = Math.ceil((100 - availablePoints) / 50) * 1000;
    await sleep(wait);
    availablePoints = Math.min(1000, availablePoints + wait / 1000 * 50);
    lastRefillTime = Date.now();
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(GQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query, variables }),
    });

    if (resp.status === 429) {
      const retryAfter = parseFloat(resp.headers.get('Retry-After') || '2');
      console.log(`  Throttled, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }

    const json = await resp.json();
    const cost = json.extensions?.cost;
    if (cost) availablePoints = cost.throttleStatus?.currentlyAvailable ?? availablePoints;

    if (json.errors) {
      const isThrottled = json.errors.some(e => e.message?.includes('Throttled'));
      if (isThrottled && attempt < 3) { await sleep(2000); continue; }
      throw new Error(JSON.stringify(json.errors));
    }
    return json;
  }
  throw new Error('Max retries exceeded');
}

// ─── Download image ──────────────────────────────────────────────────────────

async function downloadImage(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ─── Normalize to 1200×1200 square ──────────────────────────────────────────

async function normalizeToSquare(inputBuffer) {
  const meta = await sharp(inputBuffer).metadata();
  const { width, height } = meta;

  // Determine crop to square (center crop)
  const side = Math.min(width, height);
  const left = Math.floor((width - side) / 2);
  const top  = Math.floor((height - side) / 2);

  const result = await sharp(inputBuffer)
    .extract({ left, top, width: side, height: side })
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'fill' })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90 })
    .toBuffer();

  return result;
}

// ─── Upload image to Shopify product ─────────────────────────────────────────

async function uploadToProduct(productId, productHandle, imageBuffer) {
  const filename = `${productHandle}_sq_1200.jpg`;
  const fileSize = imageBuffer.length;

  // 1. Stage upload
  const stageResult = await gql(`
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `, {
    input: [{
      filename,
      mimeType: 'image/jpeg',
      httpMethod: 'POST',
      resource: 'PRODUCT_IMAGE',
      fileSize: String(fileSize),
    }],
  });

  const targets = stageResult.data?.stagedUploadsCreate?.stagedTargets;
  if (!targets?.length) throw new Error('No staged target returned');
  const target = targets[0];

  // 2. Upload
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  form.append('file', blob, filename);

  const uploadResp = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new Error(`Upload failed: ${uploadResp.status} ${text.substring(0, 200)}`);
  }

  // 3. Attach to product
  const createResult = await gql(`
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id } }
        mediaUserErrors { field message code }
      }
    }
  `, {
    productId,
    media: [{
      alt: `${productHandle} – square`,
      mediaContentType: 'IMAGE',
      originalSource: target.resourceUrl,
    }],
  });

  const createErrors = createResult.data?.productCreateMedia?.mediaUserErrors;
  if (createErrors?.length) throw new Error(`createMedia: ${JSON.stringify(createErrors)}`);

  const newMediaId = createResult.data?.productCreateMedia?.media?.[0]?.id;
  if (!newMediaId) throw new Error('No media ID returned');

  // 4. Reorder to position 0 (featured)
  await sleep(1000);
  await gql(`
    mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        userErrors { field message }
      }
    }
  `, {
    id: productId,
    moves: [{ id: newMediaId, newPosition: '0' }],
  });

  return newMediaId;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('─── Fix Fabricut Images ───\n');

  // 1. Read CSV to get image URLs
  const csvPath = path.resolve(__dirname, '..', 'mnt', 'data', 'core_products.csv');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  const fabricutRows = rows.filter(r => r.vendor === 'Fabricut' && r.image_url_1);
  console.log(`Found ${fabricutRows.length} Fabricut products with image URLs in CSV\n`);

  // 2. Fetch Fabricut products from Shopify (to get GIDs)
  const shopifyProducts = [];
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50, query: "vendor:Fabricut"${after}) {
        edges {
          node { id handle title }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of result.data.products.edges) {
      shopifyProducts.push(e.node);
      cursor = e.cursor;
    }
    hasNext = result.data.products.pageInfo.hasNextPage;
  }
  console.log(`Found ${shopifyProducts.length} Fabricut products in Shopify\n`);

  // 3. Match CSV rows to Shopify products by SKU (handle contains SKU)
  // Build handle → shopify product map
  const handleMap = {};
  for (const p of shopifyProducts) {
    handleMap[p.handle] = p;
  }

  // Build sku → image_url map from CSV
  const skuImageMap = {};
  for (const row of fabricutRows) {
    skuImageMap[row.sku] = row.image_url_1;
  }

  // Create temp dir  
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  let success = 0, failed = 0, skipped = 0;

  for (const row of fabricutRows) {
    const sku = row.sku;
    const imageUrl = row.image_url_1;

    // Skip the "Fabricut" brand page product (no real image)
    if (row.name === 'Fabricut' || !imageUrl) {
      skipped++;
      continue;
    }

    // Find matching Shopify product
    // Handle format: name-slugified + possible sku suffix
    const product = shopifyProducts.find(p => {
      // Try handle matching or title matching
      return p.title === row.name;
    });

    if (!product) {
      console.log(`  ✗ No Shopify match for: ${row.name} (${sku})`);
      failed++;
      continue;
    }

    console.log(`[${success + failed + skipped + 1}/${fabricutRows.length}] ${product.title}`);

    try {
      // Download
      console.log(`  ↓ Downloading ${imageUrl}`);
      const imgBuffer = await downloadImage(imageUrl);
      console.log(`  ↓ Downloaded ${(imgBuffer.length / 1024).toFixed(0)} KB`);

      // Normalize to 1200×1200
      const squareBuffer = await normalizeToSquare(imgBuffer);
      console.log(`  ◻ Normalized to ${TARGET_SIZE}×${TARGET_SIZE} (${(squareBuffer.length / 1024).toFixed(0)} KB)`);

      // Save locally for reference
      const localPath = path.join(TEMP_DIR, `${product.handle}_sq_1200.jpg`);
      fs.writeFileSync(localPath, squareBuffer);

      // Upload to Shopify
      const mediaId = await uploadToProduct(product.id, product.handle, squareBuffer);
      console.log(`  ✓ Uploaded → ${mediaId}\n`);
      success++;
      await sleep(500);

    } catch (err) {
      console.error(`  ✗ ERROR: ${err.message}\n`);
      failed++;
    }
  }

  console.log('─── Summary ───');
  console.log(`Success: ${success}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
