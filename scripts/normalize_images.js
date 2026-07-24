#!/usr/bin/env node
/**
 * scripts/normalize_images.js
 * ───────────────────────────
 * AI-powered image normalization pipeline.
 *
 * For every product in the store:
 *   1. Download the featured image
 *   2. Analyze with OpenAI Vision (bbox + background classification)
 *   3. Solid/gradient background → EXPAND canvas to 1:1 with matching bg color
 *      Lifestyle/textured background → SMART CROP to 1:1 around the subject bbox
 *   4. Upload the processed square image to Shopify Files
 *   5. Write the image.square metafield referencing the uploaded file
 *
 * NON-NEGOTIABLE: No AI image generation / outpainting / content synthesis.
 * All operations are analysis + deterministic pixel transforms only.
 *
 * Usage:
 *   node scripts/normalize_images.js            # Process all products
 *   node scripts/normalize_images.js --limit 5  # Process first 5
 *   node scripts/normalize_images.js --dry-run  # Analyze only, no upload
 *   node scripts/normalize_images.js --skip-existing  # Skip products with existing square metafield
 */

'use strict';

require('dotenv').config();

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const { analyzeImage }        = require('../lib/vision');
const { fetchProductImages,
        uploadToShopifyFiles,
        setSquareMetafield }  = require('../lib/shopify_images');

// ─── Config ─────────────────────────────────────────────────────────────────
const TARGET_SIZE = 1200;  // Output square size in pixels
const OUTPUT_DIR  = path.join(__dirname, '..', 'tmp_squares');
const QUALITY     = 85;    // WebP quality

const args = process.argv.slice(2);
const DRY_RUN       = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const limitIdx       = args.indexOf('--limit');
const LIMIT          = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// ─── Helpers ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadImage(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Determine the dominant background color from corner samples.
 * Returns { r, g, b } used for canvas expansion.
 */
async function getBackgroundColor(buffer, width, height) {
  const sampleSize = Math.min(40, Math.floor(Math.min(width, height) * 0.08));
  if (sampleSize < 4) return { r: 255, g: 255, b: 255 };

  const corners = [
    { left: 0, top: 0 },
    { left: Math.max(0, width - sampleSize), top: 0 },
    { left: 0, top: Math.max(0, height - sampleSize) },
    { left: Math.max(0, width - sampleSize), top: Math.max(0, height - sampleSize) },
  ];

  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (const region of corners) {
    const stats = await sharp(buffer)
      .extract({ left: region.left, top: region.top, width: sampleSize, height: sampleSize })
      .stats();
    const [rCh, gCh, bCh] = stats.channels;
    rSum += rCh.mean; gSum += gCh.mean; bSum += bCh.mean;
    count++;
  }

  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

/**
 * EXPAND: Pad the image to a square canvas with the background color.
 * Used for solid/gradient backgrounds (product-on-white-bg style).
 */
async function expandToSquare(buffer, width, height, bgColor) {
  const size = Math.max(width, height);

  // Center the original image on a square canvas
  const padLeft = Math.floor((size - width) / 2);
  const padTop  = Math.floor((size - height) / 2);

  const square = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: bgColor,
    },
  })
    .composite([{ input: buffer, left: padLeft, top: padTop }])
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'fill' })
    .webp({ quality: QUALITY })
    .toBuffer();

  return square;
}

/**
 * SMART CROP: Crop to 1:1 centered on the subject bbox.
 * The crop region is the largest square that fits within the image
 * while keeping the subject centered (or as centered as possible).
 */
async function smartCropToSquare(buffer, width, height, bbox) {
  // Determine the crop square size — use the larger of width/height of the
  // subject bbox, with some padding, but constrained to the image dimensions
  const subjectCenterX = bbox.x + bbox.w / 2;
  const subjectCenterY = bbox.y + bbox.h / 2;

  // The crop square side = largest dimension we can get while keeping subject
  const maxSide = Math.min(width, height);

  // Try to center the crop on the subject
  let cropX = Math.round(subjectCenterX - maxSide / 2);
  let cropY = Math.round(subjectCenterY - maxSide / 2);

  // Clamp to image bounds
  cropX = Math.max(0, Math.min(cropX, width - maxSide));
  cropY = Math.max(0, Math.min(cropY, height - maxSide));

  const square = await sharp(buffer)
    .extract({ left: cropX, top: cropY, width: maxSide, height: maxSide })
    .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'fill' })
    .webp({ quality: QUALITY })
    .toBuffer();

  return square;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RueIV Image Normalization Pipeline');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Target: ${TARGET_SIZE}×${TARGET_SIZE}px WebP (q${QUALITY})`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Skip existing: ${SKIP_EXISTING}`);
  console.log(`  Limit: ${LIMIT || 'all'}`);
  console.log('');

  // Ensure output directory
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Fetch products
  console.log('Fetching products from Shopify...');
  const products = await fetchProductImages(LIMIT);
  console.log(`  Found ${products.length} products\n`);

  const stats = { processed: 0, expanded: 0, cropped: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const label = `[${i + 1}/${products.length}] ${p.handle}`;
    console.log(`${label}`);

    // Skip if no image
    if (!p.featuredImageUrl) {
      console.log('  ⏭ No featured image, skipping');
      stats.skipped++;
      continue;
    }

    // Skip if already has square metafield
    if (SKIP_EXISTING && p.existingSquareMetafield) {
      console.log('  ⏭ Already has image.square metafield, skipping');
      stats.skipped++;
      continue;
    }

    try {
      // 1. Download
      console.log('  Downloading...');
      const imgBuffer = await downloadImage(p.featuredImageUrl);
      const meta = await sharp(imgBuffer).metadata();
      const { width, height } = meta;
      console.log(`  Dimensions: ${width}×${height}`);

      // Already square? Just resize
      if (width === height) {
        console.log('  Already square — resizing to target');
        const square = await sharp(imgBuffer)
          .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'fill' })
          .webp({ quality: QUALITY })
          .toBuffer();

        const filename = `${p.handle}_sq_${TARGET_SIZE}.webp`;
        const localPath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(localPath, square);
        console.log(`  Saved: ${filename} (${(square.length / 1024).toFixed(0)} KB)`);

        if (!DRY_RUN) {
          const uploaded = await uploadToShopifyFiles(localPath, filename, 'image/webp');
          if (uploaded) {
            await setSquareMetafield(p.id, uploaded.fileId);
            console.log(`  ✓ Uploaded & metafield set`);
          }
        }
        stats.processed++;
        stats.cropped++;
        await sleep(300);
        continue;
      }

      // 2. Analyze with AI Vision
      console.log('  Analyzing with AI vision...');
      const analysis = await analyzeImage(imgBuffer, width, height);
      console.log(`  BG type: ${analysis.bg_type} | Confidence: ${analysis.confidence.toFixed(2)}`);
      console.log(`  BBox: (${analysis.bbox.x},${analysis.bbox.y}) ${analysis.bbox.w}×${analysis.bbox.h}`);

      let squareBuffer;
      let method;

      // 3. Choose strategy based on background type
      if (analysis.bg_type === 'solid' || analysis.bg_type === 'gradient') {
        // EXPAND: Pad to square with matching background color
        const bgColor = await getBackgroundColor(imgBuffer, width, height);
        console.log(`  Strategy: EXPAND (bg color: rgb(${bgColor.r},${bgColor.g},${bgColor.b}))`);
        squareBuffer = await expandToSquare(imgBuffer, width, height, bgColor);
        method = 'expand';
        stats.expanded++;
      } else {
        // SMART CROP: Crop to square centered on subject
        console.log(`  Strategy: SMART CROP (centered on subject bbox)`);
        squareBuffer = await smartCropToSquare(imgBuffer, width, height, analysis.bbox);
        method = 'crop';
        stats.cropped++;
      }

      // 4. Save locally
      const filename = `${p.handle}_sq_${TARGET_SIZE}.webp`;
      const localPath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(localPath, squareBuffer);
      console.log(`  Saved: ${filename} (${(squareBuffer.length / 1024).toFixed(0)} KB) [${method}]`);

      // 5. Upload to Shopify & set metafield
      if (!DRY_RUN) {
        console.log('  Uploading to Shopify Files...');
        const uploaded = await uploadToShopifyFiles(localPath, filename, 'image/webp');
        if (uploaded) {
          await setSquareMetafield(p.id, uploaded.fileId);
          console.log(`  ✓ Uploaded & metafield set (${uploaded.fileId})`);
        } else {
          console.log('  ✗ Upload failed');
          stats.errors++;
        }
      }

      stats.processed++;
      await sleep(500); // Rate limit buffer

    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      stats.errors++;
    }

    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Expanded (solid bg): ${stats.expanded}`);
  console.log(`  Cropped (lifestyle): ${stats.cropped}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
