#!/usr/bin/env node
/**
 * scripts/recrop_wallpapers.js
 * ─────────────────────────────
 * Re-crops ALL wallpaper product images using a center-crop strategy.
 *
 * Why: The vision pipeline's decideStrategy falls back to FIT_AND_PAD_MIRROR
 * for room-shot / full-bleed wallpaper images because the subject fills the
 * entire frame (no margins). This creates ugly blur-expanded top/bottom bars.
 *
 * Fix: For wallpaper, the correct strategy is always center-crop — take the
 * largest possible square from the center of each image and resize to 1200.
 *
 * Steps per product:
 *   1. Download the ORIGINAL (non-square) source from Shopify media[1+]
 *      (media[0] is the current 1200x1200 square upload; originals are after)
 *   2. Center-crop to square
 *   3. Resize to 1200x1200
 *   4. Save to out/images/{handle}/
 *   5. Upload as new featured (product media) + reorder to position 0
 *
 * Usage:
 *   node scripts/recrop_wallpapers.js              # process all
 *   node scripts/recrop_wallpapers.js --dry-run    # preview only
 *   node scripts/recrop_wallpapers.js --limit 3    # first N only
 */

'use strict';
require('dotenv').config();

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const OUT_DIR = path.resolve(__dirname, '..', 'out', 'images');
const sleep   = ms => new Promise(r => setTimeout(r, ms));

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT   = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();

// ─── GraphQL ─────────────────────────────────────────────────────────────────
async function gql(query, variables = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(GQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query, variables }),
    });
    if (resp.status === 429) {
      const wait = parseFloat(resp.headers.get('Retry-After') || '2');
      console.log(`  ⏳ Throttled, waiting ${wait}s...`);
      await sleep(wait * 1000);
      continue;
    }
    const json = await resp.json();
    if (json.errors) console.error('GQL errors:', JSON.stringify(json.errors, null, 2));
    return json;
  }
  throw new Error('GQL failed after 3 attempts');
}

// ─── Fetch wallpaper products with all media ─────────────────────────────────
async function fetchWallpaperProducts() {
  const products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const { data } = await gql(`{
      products(first: 50, query: "product_type:Wallpaper"${afterClause}) {
        edges {
          cursor
          node {
            id handle title
            media(first: 20) {
              edges { node {
                id
                mediaContentType
                ... on MediaImage {
                  image { url width height }
                  mimeType
                }
              }}
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }`);

    if (!data?.products) break;
    for (const edge of data.products.edges) {
      products.push(edge.node);
      cursor = edge.cursor;
    }
    hasNext = data.products.pageInfo.hasNextPage;
  }

  return products;
}

// ─── Download image to buffer ────────────────────────────────────────────────
async function downloadImage(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} — ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ─── Center crop to square ───────────────────────────────────────────────────
async function centerCropSquare(buffer) {
  const meta = await sharp(buffer).metadata();
  const { width, height } = meta;
  const side = Math.min(width, height);

  const left = Math.floor((width - side) / 2);
  const top  = Math.floor((height - side) / 2);

  const cropped = await sharp(buffer)
    .extract({ left, top, width: side, height: side })
    .resize(1200, 1200, { kernel: 'lanczos3' })
    .toBuffer();

  return { cropped, originalDims: `${width}x${height}`, cropRegion: `${left},${top},${side}x${side}` };
}

// ─── Save outputs ────────────────────────────────────────────────────────────
async function saveOutputs(squareBuffer, handle) {
  const dir = path.join(OUT_DIR, handle);
  fs.mkdirSync(dir, { recursive: true });

  const jpg1200  = path.join(dir, `${handle}_sq_1200.jpg`);
  const webp1200 = path.join(dir, `${handle}_sq_1200.webp`);
  const jpg600   = path.join(dir, `${handle}_sq_600.jpg`);
  const webp600  = path.join(dir, `${handle}_sq_600.webp`);

  await sharp(squareBuffer).jpeg({ quality: 88 }).toFile(jpg1200);
  await sharp(squareBuffer).webp({ quality: 85 }).toFile(webp1200);
  await sharp(squareBuffer).resize(600, 600).jpeg({ quality: 88 }).toFile(jpg600);
  await sharp(squareBuffer).resize(600, 600).webp({ quality: 85 }).toFile(webp600);

  return { jpg_1200: jpg1200, webp_1200: webp1200, jpg_600: jpg600, webp_600: webp600 };
}

// ─── Upload as product media (featured) ──────────────────────────────────────
async function uploadAsFeatured(productId, jpgPath, handle) {
  // 1. Staged upload
  const fileSize = fs.statSync(jpgPath).size;
  const filename = path.basename(jpgPath);

  const { data: stageData } = await gql(`mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }`, {
    input: [{
      resource: 'PRODUCT_IMAGE',
      filename,
      mimeType: 'image/jpeg',
      fileSize: String(fileSize),
      httpMethod: 'POST',
    }],
  });

  const target = stageData?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error('Staged upload failed');

  // 2. Upload to staged URL
  const formData = new FormData();
  for (const p of target.parameters) {
    formData.append(p.name, p.value);
  }
  const fileBuffer = fs.readFileSync(jpgPath);
  formData.append('file', new Blob([fileBuffer], { type: 'image/jpeg' }), filename);

  const uploadResp = await fetch(target.url, { method: 'POST', body: formData });
  if (!uploadResp.ok && uploadResp.status !== 201) {
    throw new Error(`Upload HTTP ${uploadResp.status}`);
  }

  // 3. Create product media
  const { data: mediaData } = await gql(`mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { id }
      mediaUserErrors { field message code }
    }
  }`, {
    productId,
    media: [{
      alt: `${handle} square crop`,
      mediaContentType: 'IMAGE',
      originalSource: target.resourceUrl,
    }],
  });

  const newMedia = mediaData?.productCreateMedia?.media?.[0];
  const mediaErrors = mediaData?.productCreateMedia?.mediaUserErrors;
  if (mediaErrors?.length) {
    console.error(`  Media errors:`, mediaErrors);
    return null;
  }
  if (!newMedia) return null;

  // 4. Wait for media to be ready
  await sleep(2000);

  // 5. Reorder: new media to position 0 (= featured)
  // First get all media IDs
  const { data: prodData } = await gql(`{
    product(id: "${productId}") {
      media(first: 20) { edges { node { id } } }
    }
  }`);

  const allMediaIds = prodData?.product?.media?.edges?.map(e => e.node.id) || [];

  // Move new media to front
  const reordered = [newMedia.id, ...allMediaIds.filter(id => id !== newMedia.id)];

  await gql(`mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      userErrors { field message }
    }
  }`, {
    id: productId,
    moves: reordered.map((mid, idx) => ({ id: mid, newPosition: String(idx) })),
  });

  return newMedia.id;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🖼  Wallpaper Re-Crop (Center-Crop → 1200×1200)`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${LIMIT < Infinity ? ` (limit: ${LIMIT})` : ''}\n`);

  const products = await fetchWallpaperProducts();
  console.log(`   Found ${products.length} wallpaper products\n`);

  let processed = 0, skipped = 0, errors = 0;

  for (const p of products.slice(0, LIMIT)) {
    console.log(`── ${p.handle} (${p.title})`);

    // Find the best original (non-square) image
    // Look for the tallest/widest image that ISN'T 1200x1200 (those are our old squares)
    const allImages = p.media.edges
      .filter(e => e.node.mediaContentType === 'IMAGE' && e.node.image)
      .map(e => ({ id: e.node.id, ...e.node.image }));

    if (allImages.length === 0) {
      console.log(`   ✗ No images found — skipping`);
      skipped++;
      continue;
    }

    // Prefer non-square originals; fall back to largest image
    const originals = allImages.filter(i => i.width !== i.height);
    const source = originals.length > 0
      ? originals.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b))
      : allImages.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));

    console.log(`   Source: ${source.width}x${source.height} ${source.url.split('?')[0].split('/').pop()}`);

    if (source.width === source.height) {
      console.log(`   ⚠ Only square images available — will re-crop but result may be same`);
    }

    if (DRY_RUN) {
      const side = Math.min(source.width, source.height);
      console.log(`   → Would center-crop ${side}x${side} → resize 1200x1200`);
      processed++;
      continue;
    }

    try {
      // Download
      const buffer = await downloadImage(source.url);
      console.log(`   Downloaded ${(buffer.length / 1024).toFixed(0)} KB`);

      // Center crop
      const { cropped, originalDims, cropRegion } = await centerCropSquare(buffer);
      console.log(`   Cropped: ${originalDims} → center ${cropRegion} → 1200x1200`);

      // Save outputs
      const outputs = await saveOutputs(cropped, p.handle);
      const sizes = Object.entries(outputs).map(([k, f]) =>
        `${k}: ${(fs.statSync(f).size / 1024).toFixed(0)}KB`
      ).join(', ');
      console.log(`   Saved: ${sizes}`);

      // Upload as featured
      console.log(`   Uploading as featured...`);
      const mediaId = await uploadAsFeatured(p.id, outputs.jpg_1200, p.handle);
      if (mediaId) {
        console.log(`   ✓ Featured image updated: ${mediaId}`);
      } else {
        console.log(`   ✗ Upload/reorder failed`);
        errors++;
        continue;
      }

      processed++;
      await sleep(500); // rate limit between products

    } catch (err) {
      console.error(`   ✗ Error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n   Done: ${processed} processed, ${skipped} skipped, ${errors} errors\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
