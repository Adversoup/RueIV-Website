#!/usr/bin/env node
/**
 * scripts/upload_square_images.js
 * ────────────────────────────────
 * Uploads normalized 1200×1200 square images from out/images/{handle}/
 * directly to each Shopify product as the new featured image.
 *
 * Uses:
 *   - stagedUploadsCreate (resource: PRODUCT_IMAGE)
 *   - productCreateMedia  (attach to product)
 *   - productReorderMedia  (move new image to position 1 → featured)
 *
 * Requires: write_products scope (already granted).
 *
 * Usage:
 *   node scripts/upload_square_images.js [--limit N] [--dry-run]
 */

'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const IMAGES_DIR = path.resolve(__dirname, '..', 'out', 'images');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Rate-limited GraphQL fetch ──────────────────────────────────────────────
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

// ─── Fetch all products with media info ──────────────────────────────────────

async function fetchAllProducts() {
  const products = [];
  let cursor = null;

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      products(first: 50${afterClause}) {
        edges {
          cursor
          node {
            id
            handle
            title
            media(first: 10) {
              edges {
                node {
                  ... on MediaImage {
                    id
                    image { url }
                    mediaContentType
                  }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }`;

    const result = await gql(query);
    const edges  = result.data.products.edges;
    for (const e of edges) {
      const mediaList = e.node.media.edges
        .filter(m => m.node.mediaContentType === 'IMAGE')
        .map(m => ({ id: m.node.id, url: m.node.image?.url }));
      products.push({
        id:     e.node.id,
        handle: e.node.handle,
        title:  e.node.title,
        media:  mediaList,
      });
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
    await sleep(200);
  }
  return products;
}

// ─── Upload a single product's square image ──────────────────────────────────

async function uploadSquareImage(product, localPath) {
  const filename = `${product.handle}_sq_1200.jpg`;
  const fileSize = fs.statSync(localPath).size;

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
  const stageErrors = stageResult.data?.stagedUploadsCreate?.userErrors;
  if (stageErrors?.length) { console.error('  Stage errors:', stageErrors); return null; }
  if (!targets?.length) { console.error('  No staged target'); return null; }

  const target = targets[0];

  // 2. Upload file
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  const blob = new Blob([fs.readFileSync(localPath)], { type: 'image/jpeg' });
  form.append('file', blob, filename);

  const uploadResp = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    console.error('  Upload failed:', uploadResp.status, text.substring(0, 200));
    return null;
  }

  // 3. Create product media
  const createResult = await gql(`
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage { id }
        }
        mediaUserErrors { field message code }
      }
    }
  `, {
    productId: product.id,
    media: [{
      alt: `${product.title} – square`,
      mediaContentType: 'IMAGE',
      originalSource: target.resourceUrl,
    }],
  });

  const createErrors = createResult.data?.productCreateMedia?.mediaUserErrors;
  if (createErrors?.length) { console.error('  createMedia errors:', createErrors); return null; }

  const newMedia = createResult.data?.productCreateMedia?.media?.[0];
  if (!newMedia) { console.error('  No media returned'); return null; }

  return newMedia.id;
}

// ─── Reorder so the new image is first (featured) ────────────────────────────

async function reorderMedia(productId, newMediaId, existingMediaIds) {
  // New image first, then the rest
  const orderedIds = [newMediaId, ...existingMediaIds.filter(id => id !== newMediaId)];

  const result = await gql(`
    mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        userErrors { field message }
      }
    }
  `, {
    id: productId,
    moves: orderedIds.map((mediaId, index) => ({
      id: mediaId,
      newPosition: String(index),
    })),
  });

  const errors = result.data?.productReorderMedia?.userErrors;
  if (errors?.length) {
    console.error('  Reorder errors:', errors);
    return false;
  }
  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  let limit     = null;
  let dryRun    = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[++i], 10); }
    if (args[i] === '--dry-run') { dryRun = true; }
  }

  console.log('─── Upload Square Images to Shopify ───');
  console.log(`Store: ${STORE}`);
  console.log(`Images dir: ${IMAGES_DIR}`);
  if (dryRun) console.log('DRY RUN — no uploads will happen');
  console.log('');

  // 1. Fetch products
  console.log('Fetching products from Shopify...');
  let products = await fetchAllProducts();
  console.log(`Found ${products.length} products`);

  if (limit) {
    products = products.slice(0, limit);
    console.log(`Limited to ${products.length} products`);
  }

  // 2. Match with local images
  let uploaded = 0;
  let skipped  = 0;
  let failed   = 0;
  let noImage  = 0;

  for (const product of products) {
    const dir = path.join(IMAGES_DIR, product.handle);

    // Find the 1200 JPG
    const jpgPath = path.join(dir, `${product.handle}_sq_1200.jpg`);
    if (!fs.existsSync(jpgPath)) {
      // Also try finding any *_sq_1200.jpg
      if (!fs.existsSync(dir)) {
        noImage++;
        continue;
      }
      const files = fs.readdirSync(dir).filter(f => f.endsWith('_sq_1200.jpg'));
      if (files.length === 0) {
        noImage++;
        continue;
      }
    }

    const finalPath = fs.existsSync(jpgPath)
      ? jpgPath
      : path.join(dir, fs.readdirSync(dir).find(f => f.endsWith('_sq_1200.jpg')));

    console.log(`\n[${uploaded + skipped + failed + 1}/${products.length}] ${product.title} (${product.handle})`);

    if (dryRun) {
      console.log(`  Would upload: ${path.basename(finalPath)}`);
      uploaded++;
      continue;
    }

    try {
      // Upload
      console.log(`  Uploading ${path.basename(finalPath)} (${(fs.statSync(finalPath).size / 1024).toFixed(0)} KB)...`);
      const newMediaId = await uploadSquareImage(product, finalPath);

      if (!newMediaId) {
        console.log(`  FAILED — upload returned null`);
        failed++;
        continue;
      }

      console.log(`  New media ID: ${newMediaId}`);

      // Wait for Shopify to process
      await sleep(1000);

      // Reorder: new image first
      const existingIds = product.media.map(m => m.id);
      const allIds = [newMediaId, ...existingIds];
      console.log(`  Reordering ${allIds.length} media items (new image → position 0)...`);
      const reordered = await reorderMedia(product.id, newMediaId, existingIds);

      if (reordered) {
        console.log(`  ✓ Featured image updated`);
        uploaded++;
      } else {
        console.log(`  ⚠ Uploaded but reorder failed`);
        uploaded++;
      }

      // Throttle between products
      await sleep(500);

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log('\n─── Summary ───');
  console.log(`Total:    ${products.length}`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`No image: ${noImage}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Failed:   ${failed}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
