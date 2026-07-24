#!/usr/bin/env node
/**
 * scripts/_fix_wallpaper_images.js
 * ─────────────────────────────────
 * Finds wallpaper collections with stretched/uncropped images,
 * downloads the original image, smart-crops it to a 16:9 banner ratio
 * using vision analysis, and re-uploads to Shopify.
 *
 * Usage:
 *   node scripts/_fix_wallpaper_images.js              # apply
 *   node scripts/_fix_wallpaper_images.js --dry-run    # preview only
 */
'use strict';
require('dotenv').config();

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');
const { analyzeImage } = require('../lib/vision');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const DRY_RUN = process.argv.includes('--dry-run');
const sleep   = ms => new Promise(r => setTimeout(r, ms));

const TMP_DIR = path.join(__dirname, '..', 'tmp_wallpaper_crops');

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) console.error('GQL errors:', JSON.stringify(json.errors, null, 2));
  return json;
}

// ─── Step 1: Find wallpaper collections ─────────────────────────────────────
async function findWallpaperCollections() {
  const collections = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      collections(first: 50, query: "title:wallpaper*"${afterClause}) {
        edges {
          cursor
          node {
            id
            title
            handle
            image { url width height }
          }
        }
        pageInfo { hasNextPage }
      }
    }`;
    const { data } = await gql(query);
    if (!data?.collections) break;
    for (const edge of data.collections.edges) {
      collections.push(edge.node);
      cursor = edge.cursor;
    }
    hasNext = data.collections.pageInfo.hasNextPage;
  }
  return collections;
}

// ─── Step 2: Download image ──────────────────────────────────────────────────
async function downloadImage(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${url}`);
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ─── Step 3: Smart crop to 16:9 banner ──────────────────────────────────────
async function smartCrop(buffer, title) {
  const meta = await sharp(buffer).metadata();
  const { width, height } = meta;
  console.log(`  Original: ${width}×${height} (ratio ${(width/height).toFixed(2)})`);

  // Target ratio: 16:9 (collection banner)
  const TARGET_RATIO = 16 / 9;
  const currentRatio = width / height;

  // If already close to 16:9, skip
  if (Math.abs(currentRatio - TARGET_RATIO) < 0.15) {
    console.log('  Already close to 16:9, skipping crop');
    return null;
  }

  // Use vision to find subject area
  const analysis = await analyzeImage(buffer, width, height);
  console.log(`  Vision bbox: x=${analysis.bbox.x} y=${analysis.bbox.y} w=${analysis.bbox.w} h=${analysis.bbox.h} (${analysis.bg_type})`);

  // Calculate crop region centered on subject bbox
  const subjectCenterX = analysis.bbox.x + analysis.bbox.w / 2;
  const subjectCenterY = analysis.bbox.y + analysis.bbox.h / 2;

  let cropW, cropH;

  if (currentRatio < TARGET_RATIO) {
    // Image is taller than 16:9 — use full width, crop height
    cropW = width;
    cropH = Math.round(width / TARGET_RATIO);
  } else {
    // Image is wider than 16:9 — use full height, crop width
    cropH = height;
    cropW = Math.round(height * TARGET_RATIO);
  }

  // Ensure crop doesn't exceed image bounds
  cropW = Math.min(cropW, width);
  cropH = Math.min(cropH, height);

  // Center crop on subject
  let cropX = Math.round(subjectCenterX - cropW / 2);
  let cropY = Math.round(subjectCenterY - cropH / 2);

  // Clamp to image bounds
  cropX = Math.max(0, Math.min(cropX, width - cropW));
  cropY = Math.max(0, Math.min(cropY, height - cropH));

  console.log(`  Crop: ${cropW}×${cropH} at (${cropX},${cropY})`);

  const cropped = await sharp(buffer)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(1600, 900, { fit: 'fill' }) // standardize to 1600×900
    .jpeg({ quality: 90 })
    .toBuffer();

  return cropped;
}

// ─── Step 4: Set collection image via REST API with base64 ──────────────────
async function setCollectionImageBase64(collectionGid, buffer, filename) {
  // Extract numeric ID from GID
  const numericId = collectionGid.replace('gid://shopify/Collection/', '');
  
  const base64 = buffer.toString('base64');
  
  // Try custom_collections first, then smart_collections
  for (const endpoint of ['custom_collections', 'smart_collections']) {
    const REST_URL = `https://${STORE}/admin/api/2024-10/${endpoint}/${numericId}.json`;
    const bodyKey = endpoint === 'custom_collections' ? 'custom_collection' : 'smart_collection';
    
    const resp = await fetch(REST_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
      body: JSON.stringify({
        [bodyKey]: {
          id: parseInt(numericId),
          image: {
            attachment: base64,
            filename: filename,
          }
        }
      }),
    });

    if (resp.ok) {
      const json = await resp.json();
      const img = json[bodyKey]?.image;
      return img;
    }
    
    // 404 means wrong collection type, try next
    if (resp.status === 404) continue;
    
    // Other errors
    const text = await resp.text();
    console.error(`  REST error ${resp.status}: ${text.substring(0, 200)}`);
    return null;
  }
  
  console.error('  Collection not found in custom or smart collections');
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🖼  Wallpaper Collection Image Fixer`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  // Ensure tmp directory exists
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const collections = await findWallpaperCollections();
  console.log(`   Found ${collections.length} wallpaper collections\n`);

  if (collections.length === 0) {
    console.log('   No wallpaper collections found. Searching broader...');
    // Also look for collections with "wallpaper" anywhere
    const broader = await gql(`{
      collections(first: 100) {
        edges { node { id title handle image { url width height } } }
      }
    }`);
    const all = broader.data?.collections?.edges || [];
    const wp = all.filter(e => 
      e.node.title.toLowerCase().includes('wallpaper') || 
      e.node.handle.includes('wallpaper')
    );
    if (wp.length > 0) {
      console.log(`   Found ${wp.length} via broad search:`);
      for (const { node } of wp) {
        collections.push(node);
      }
    }
  }

  let fixed = 0, skipped = 0, errors = 0;

  for (const col of collections) {
    console.log(`\n── ${col.title} (${col.handle}) ──`);

    if (!col.image?.url) {
      console.log('  No image set, skipping');
      skipped++;
      continue;
    }

    console.log(`  Image: ${col.image.url.substring(0, 80)}...`);
    console.log(`  Size: ${col.image.width || '?'}×${col.image.height || '?'}`);

    try {
      // Download
      console.log('  Downloading...');
      const buffer = await downloadImage(col.image.url);

      // Smart crop
      console.log('  Analyzing & cropping...');
      const cropped = await smartCrop(buffer, col.title);

      if (!cropped) {
        console.log('  ✓ Image OK, no crop needed');
        skipped++;
        continue;
      }

      // Save locally for inspection
      const localPath = path.join(TMP_DIR, `${col.handle}_cropped.jpg`);
      fs.writeFileSync(localPath, cropped);
      console.log(`  Saved: ${localPath}`);

      if (DRY_RUN) {
        console.log('  [DRY RUN] Would upload and set as collection image');
        fixed++;
        continue;
      }

      // Upload via REST API with base64
      console.log('  Uploading to Shopify...');
      const filename = `${col.handle}-banner-cropped.jpg`;
      const result = await setCollectionImageBase64(col.id, cropped, filename);

      if (!result) {
        console.log('  ✗ Upload failed');
        errors++;
      } else {
        console.log(`  ✓ Updated: ${result.width}×${result.height}`);
        fixed++;
      }

      await sleep(500);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n   Done: ${fixed} fixed, ${skipped} skipped, ${errors} errors\n`);

  // Cleanup tmp if empty
  try {
    const files = fs.readdirSync(TMP_DIR);
    if (files.length === 0) fs.rmdirSync(TMP_DIR);
  } catch {}
}

main().catch(err => { console.error(err); process.exit(1); });
