#!/usr/bin/env node
/**
 * scripts/image_normalize.js
 * ──────────────────────────
 * Production image normalization pipeline for Shopify product images.
 *
 * Produces consistent 1:1 square images without ever clipping the product.
 * If a square crop would cut the subject, the canvas is expanded instead.
 *
 * Usage:
 *   node scripts/image_normalize.js [options]
 *
 * Options:
 *   --limit N        Process only first N products (default: all)
 *   --force          Reprocess even if already in manifest
 *   --upload         Upload results to Shopify Files + set metafield (Sprint 2)
 *   --dry-run        Analyze only, don't write files
 *   --product <id>   Process a single product by Shopify GID
 *   --help           Show this help text
 *
 * Environment:
 *   SHOPIFY_STORE, SHOPIFY_ADMIN_ACCESS_TOKEN  — required
 *   OPENAI_API_KEY                              — optional (enables AI vision)
 */

'use strict';

require('dotenv').config();

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

const { analyzeImage }               = require('../lib/vision');
const { fetchProductImages,
        uploadToShopifyFiles,
        setSquareMetafield }         = require('../lib/shopify_images');

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  // Decision thresholds
  PADDING_THRESHOLD: 0.10,      // 10% — min margin for safe crop
  PADDING_FACTOR:    1.15,      // 15% breathing room around product
  MIN_CONFIDENCE:    0.50,      // Below → flag for manual review

  // Background fill
  EDGE_SAMPLE_WIDTH:   5,       // px — for solid bg median color
  MIRROR_STRIP_WIDTH: 15,       // px — for mirror-reflect fill
  BLUR_SIGMA:         30,       // Gaussian blur sigma for reflected fill
  NOISE_SIGMA:         3,       // Subtle noise for texture

  // Output
  OUTPUT_SIZES: [1200, 600],
  WEBP_QUALITY: 85,
  JPG_QUALITY:  88,

  // Paths
  OUT_DIR:       path.resolve(__dirname, '..', 'out', 'images'),
  MANIFEST_PATH: path.resolve(__dirname, '..', 'out', 'image_manifest.json'),
  REPORT_PATH:   path.resolve(__dirname, '..', 'out', 'image_report.json'),
};

// ─── CLI Parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: null, force: false, upload: false, dryRun: false, productId: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit':    opts.limit = parseInt(args[++i], 10); break;
      case '--force':    opts.force = true; break;
      case '--upload':   opts.upload = true; break;
      case '--dry-run':  opts.dryRun = true; break;
      case '--product':  opts.productId = args[++i]; break;
      case '--help':
        console.log(`
Image Normalization Pipeline
────────────────────────────
Usage: node scripts/image_normalize.js [options]

Options:
  --limit N        Process only first N products
  --force          Reprocess even if already in manifest
  --upload         Upload to Shopify Files + set metafield
  --dry-run        Analyze only, don't write files
  --product <id>   Process single product by GID
  --help           Show this help
`);
        process.exit(0);
    }
  }
  return opts;
}

// ─── Manifest (idempotency) ──────────────────────────────────────────────────

function loadManifest() {
  if (fs.existsSync(CONFIG.MANIFEST_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG.MANIFEST_PATH, 'utf-8'));
  }
  return {};
}

function saveManifest(manifest) {
  fs.writeFileSync(CONFIG.MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// ─── Download image ──────────────────────────────────────────────────────────

/**
 * Download an image from URL and return the buffer + metadata.
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, width: number, height: number, md5: string}>}
 */
async function downloadImage(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${url}`);
  const arrayBuf = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  const metadata = await sharp(buffer).metadata();
  return {
    buffer,
    width: metadata.width,
    height: metadata.height,
    md5,
  };
}

// ─── Strategy Decision ───────────────────────────────────────────────────────

/**
 * @typedef {'CROP_SQUARE'|'FIT_AND_PAD_SOLID'|'FIT_AND_PAD_MIRROR'|'FIT_AND_PAD_EDGE'} Strategy
 *
 * NON-NEGOTIABLE: NO AI generation, NO outpainting, NO content synthesis.
 * All output pixels derived from original via crop, scale, or non-generative padding.
 */

/**
 * Decide whether to crop or expand.
 *
 * @param {number} W - Image width
 * @param {number} H - Image height
 * @param {import('../lib/vision').BBox} bbox
 * @param {number} confidence
 * @returns {{ strategy: Strategy, cropRegion?: {x:number,y:number,w:number,h:number}, padding?: {top:number,bottom:number,left:number,right:number}, targetSide: number }}
 */
function decideStrategy(W, H, bbox, confidence, bgType) {
  const marginTop    = bbox.y / H;
  const marginBottom = (H - bbox.y - bbox.h) / H;
  const marginLeft   = bbox.x / W;
  const marginRight  = (W - bbox.x - bbox.w) / W;

  const safe = marginTop    >= CONFIG.PADDING_THRESHOLD
            && marginBottom >= CONFIG.PADDING_THRESHOLD
            && marginLeft   >= CONFIG.PADDING_THRESHOLD
            && marginRight  >= CONFIG.PADDING_THRESHOLD;

  if (safe) {
    // Subject-aware square crop centered on bbox
    const side = Math.ceil(Math.max(bbox.w, bbox.h) * CONFIG.PADDING_FACTOR);
    const centerX = bbox.x + bbox.w / 2;
    const centerY = bbox.y + bbox.h / 2;

    // Compute crop region, clamped to image bounds
    let x = Math.round(centerX - side / 2);
    let y = Math.round(centerY - side / 2);

    // Clamp so we don't go outside the image
    const maxSide = Math.min(side, W, H);
    x = Math.max(0, Math.min(x, W - maxSide));
    y = Math.max(0, Math.min(y, H - maxSide));

    return {
      strategy: 'CROP_SQUARE',
      cropRegion: { x, y, w: maxSide, h: maxSide },
      targetSide: maxSide,
    };
  }

  // Expand strategy — make a square out of the larger dimension
  // NO outpainting / NO generative fill — real-pixel methods only.
  const targetSide = Math.max(W, H);
  const deltaX = targetSide - W;
  const deltaY = targetSide - H;

  const padding = {
    left:   Math.floor(deltaX / 2),
    right:  deltaX - Math.floor(deltaX / 2),
    top:    Math.floor(deltaY / 2),
    bottom: deltaY - Math.floor(deltaY / 2),
  };

  // Pick padding method based on background type (all non-generative)
  let strategy;
  if (bgType === 'solid')             strategy = 'FIT_AND_PAD_SOLID';
  else if (bgType === 'gradient')     strategy = 'FIT_AND_PAD_EDGE';
  else                                strategy = 'FIT_AND_PAD_MIRROR';

  return { strategy, padding, targetSide, bgType };
}

// ─── CROP execution ──────────────────────────────────────────────────────────

/**
 * Extract a square crop from the image.
 * @param {Buffer} buffer
 * @param {{x:number,y:number,w:number,h:number}} region
 * @returns {Promise<Buffer>}
 */
async function executeCrop(buffer, region) {
  return sharp(buffer)
    .extract({ left: region.x, top: region.y, width: region.w, height: region.h })
    .toBuffer();
}

// ─── EXPAND_PAD execution ────────────────────────────────────────────────────

/**
 * Expand canvas to a square, filling new regions with background-aware padding.
 *
 * @param {Buffer}              buffer     - Original image
 * @param {number}              W          - Original width
 * @param {number}              H          - Original height
 * @param {{top:number,bottom:number,left:number,right:number}} padding
 * @param {import('../lib/vision').BgType} bgType
 * @returns {Promise<Buffer>}
 */
async function executeExpandPad(buffer, W, H, padding, bgType) {
  if (bgType === 'solid') {
    return expandWithSolidFill(buffer, W, H, padding);
  }
  if (bgType === 'gradient') {
    return expandWithEdgeExtend(buffer, W, H, padding);
  }
  return expandWithBlurredMirror(buffer, W, H, padding);
}

/**
 * Expand by replicating border pixels outward (edge-extend).
 * Best for gradient backgrounds where solid fill would create harsh lines.
 */
async function expandWithEdgeExtend(buffer, W, H, padding) {
  const targetW = W + padding.left + padding.right;
  const targetH = H + padding.top + padding.bottom;

  // First extend with solid fill using edge median
  const edgeColors = await sampleEdgeColors(buffer, W, H, padding);
  const avgColor = {
    r: Math.round(edgeColors.reduce((s, c) => s + c.r, 0) / edgeColors.length),
    g: Math.round(edgeColors.reduce((s, c) => s + c.g, 0) / edgeColors.length),
    b: Math.round(edgeColors.reduce((s, c) => s + c.b, 0) / edgeColors.length),
  };

  let canvasBuffer = await sharp({
    create: { width: targetW, height: targetH, channels: 3, background: avgColor },
  }).jpeg().toBuffer();

  canvasBuffer = await sharp(canvasBuffer)
    .composite([{ input: buffer, left: padding.left, top: padding.top }])
    .toBuffer();

  // Replicate edge strips outward into padding zones
  const composites = [];
  const stripW = 1; // single-pixel edge replication

  if (padding.left > 0) {
    const strip = await sharp(buffer)
      .extract({ left: 0, top: 0, width: stripW, height: H })
      .resize(padding.left, H, { fit: 'fill', kernel: 'nearest' })
      .toBuffer();
    composites.push({ input: strip, left: 0, top: padding.top });
  }

  if (padding.right > 0) {
    const strip = await sharp(buffer)
      .extract({ left: W - stripW, top: 0, width: stripW, height: H })
      .resize(padding.right, H, { fit: 'fill', kernel: 'nearest' })
      .toBuffer();
    composites.push({ input: strip, left: padding.left + W, top: padding.top });
  }

  if (padding.top > 0) {
    const strip = await sharp(buffer)
      .extract({ left: 0, top: 0, width: W, height: stripW })
      .resize(targetW, padding.top, { fit: 'fill', kernel: 'nearest' })
      .toBuffer();
    composites.push({ input: strip, left: 0, top: 0 });
  }

  if (padding.bottom > 0) {
    const strip = await sharp(buffer)
      .extract({ left: 0, top: H - stripW, width: W, height: stripW })
      .resize(targetW, padding.bottom, { fit: 'fill', kernel: 'nearest' })
      .toBuffer();
    composites.push({ input: strip, left: 0, top: padding.top + H });
  }

  if (composites.length > 0) {
    canvasBuffer = await sharp(canvasBuffer).composite(composites).toBuffer();
  }

  // Subtle noise to break banding
  canvasBuffer = await addSubtleNoise(canvasBuffer, targetW, targetH, W, H, padding);

  // Soft seam blend: blur whole, then paste original back
  const softened = await sharp(canvasBuffer).blur(3).toBuffer();
  canvasBuffer = await sharp(softened)
    .composite([{ input: buffer, left: padding.left, top: padding.top }])
    .toBuffer();

  return canvasBuffer;
}

/**
 * Expand by filling with the dominant edge color (best for solid backgrounds).
 */
async function expandWithSolidFill(buffer, W, H, padding) {
  // Sample edge strips to find dominant color
  const edgeColors = await sampleEdgeColors(buffer, W, H, padding);
  // Use the overall average as the fill color
  const avgColor = {
    r: Math.round(edgeColors.reduce((s, c) => s + c.r, 0) / edgeColors.length),
    g: Math.round(edgeColors.reduce((s, c) => s + c.g, 0) / edgeColors.length),
    b: Math.round(edgeColors.reduce((s, c) => s + c.b, 0) / edgeColors.length),
  };

  return sharp(buffer)
    .extend({
      top:    padding.top,
      bottom: padding.bottom,
      left:   padding.left,
      right:  padding.right,
      background: avgColor,
    })
    .toBuffer();
}

/**
 * Sample edge colors from the sides that are being extended.
 */
async function sampleEdgeColors(buffer, W, H, padding) {
  const results = [];
  const sw = CONFIG.EDGE_SAMPLE_WIDTH;

  const extractAndStat = async (left, top, width, height) => {
    if (width <= 0 || height <= 0) return null;
    const stats = await sharp(buffer)
      .extract({ left, top, width, height })
      .stats();
    return {
      r: Math.round(stats.channels[0].mean),
      g: Math.round(stats.channels[1].mean),
      b: Math.round(stats.channels[2].mean),
    };
  };

  // Sample from the edges that face the padding direction
  if (padding.left > 0) {
    const c = await extractAndStat(0, 0, Math.min(sw, W), H);
    if (c) results.push(c);
  }
  if (padding.right > 0) {
    const c = await extractAndStat(Math.max(0, W - sw), 0, Math.min(sw, W), H);
    if (c) results.push(c);
  }
  if (padding.top > 0) {
    const c = await extractAndStat(0, 0, W, Math.min(sw, H));
    if (c) results.push(c);
  }
  if (padding.bottom > 0) {
    const c = await extractAndStat(0, Math.max(0, H - sw), W, Math.min(sw, H));
    if (c) results.push(c);
  }

  if (results.length === 0) results.push({ r: 245, g: 245, b: 245 });
  return results;
}

/**
 * Add subtle noise to padded regions to break banding.
 * Non-generative: noise is random but applied only to padding zones.
 */
async function addSubtleNoise(canvasBuffer, targetW, targetH, W, H, padding) {
  if (CONFIG.NOISE_SIGMA <= 0) return canvasBuffer;

  const noiseRaw = Buffer.alloc(targetW * targetH * 3);
  for (let i = 0; i < noiseRaw.length; i++) {
    noiseRaw[i] = Math.round(128 + (Math.random() - 0.5) * CONFIG.NOISE_SIGMA * 2);
  }
  const noiseBuffer = await sharp(noiseRaw, { raw: { width: targetW, height: targetH, channels: 3 } })
    .png()
    .toBuffer();

  const maskRaw = Buffer.alloc(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const inOriginal = x >= padding.left && x < padding.left + W
                      && y >= padding.top  && y < padding.top + H;
      maskRaw[y * targetW + x] = inOriginal ? 0 : 30;
    }
  }
  const maskBuffer = await sharp(maskRaw, { raw: { width: targetW, height: targetH, channels: 1 } })
    .png()
    .toBuffer();

  const noiseMasked = await sharp(noiseBuffer)
    .ensureAlpha()
    .composite([{ input: maskBuffer, blend: 'dest-in' }])
    .toBuffer();

  return sharp(canvasBuffer)
    .composite([{ input: noiseMasked, blend: 'soft-light' }])
    .toBuffer();
}

/**
 * Expand by mirror-reflecting edges + blur + noise (for textured/lifestyle backgrounds).
 * 100% non-generative: all pixels derived from the original via mirror + blur + noise.
 */
async function expandWithBlurredMirror(buffer, W, H, padding) {
  const targetW = W + padding.left + padding.right;
  const targetH = H + padding.top + padding.bottom;

  // Step 1: Create the base canvas with solid fill (edge color)
  const edgeColors = await sampleEdgeColors(buffer, W, H, padding);
  const avgColor = {
    r: Math.round(edgeColors.reduce((s, c) => s + c.r, 0) / edgeColors.length),
    g: Math.round(edgeColors.reduce((s, c) => s + c.g, 0) / edgeColors.length),
    b: Math.round(edgeColors.reduce((s, c) => s + c.b, 0) / edgeColors.length),
  };

  // Create canvas with solid fill
  let canvas = sharp({
    create: {
      width: targetW,
      height: targetH,
      channels: 3,
      background: avgColor,
    },
  }).jpeg();
  let canvasBuffer = await canvas.toBuffer();

  // Step 2: Composite the original image into center
  canvasBuffer = await sharp(canvasBuffer)
    .composite([{
      input: buffer,
      left: padding.left,
      top: padding.top,
    }])
    .toBuffer();

  // Step 3: For each padded edge, create a blurred mirror strip and composite
  const composites = [];
  const stripW = CONFIG.MIRROR_STRIP_WIDTH;

  if (padding.left > 0) {
    // Take left edge strip of original, flip, blur, resize to fill padding
    const strip = await sharp(buffer)
      .extract({ left: 0, top: 0, width: Math.min(stripW, W), height: H })
      .flop() // horizontal flip
      .resize(padding.left, H, { fit: 'fill' })
      .blur(CONFIG.BLUR_SIGMA)
      .toBuffer();
    composites.push({ input: strip, left: 0, top: padding.top });
  }

  if (padding.right > 0) {
    const strip = await sharp(buffer)
      .extract({ left: Math.max(0, W - stripW), top: 0, width: Math.min(stripW, W), height: H })
      .flop()
      .resize(padding.right, H, { fit: 'fill' })
      .blur(CONFIG.BLUR_SIGMA)
      .toBuffer();
    composites.push({ input: strip, left: padding.left + W, top: padding.top });
  }

  if (padding.top > 0) {
    const strip = await sharp(buffer)
      .extract({ left: 0, top: 0, width: W, height: Math.min(stripW, H) })
      .flip() // vertical flip
      .resize(W, padding.top, { fit: 'fill' })
      .blur(CONFIG.BLUR_SIGMA)
      .toBuffer();
    composites.push({ input: strip, left: padding.left, top: 0 });
  }

  if (padding.bottom > 0) {
    const strip = await sharp(buffer)
      .extract({ left: 0, top: Math.max(0, H - stripW), width: W, height: Math.min(stripW, H) })
      .flip()
      .resize(W, padding.bottom, { fit: 'fill' })
      .blur(CONFIG.BLUR_SIGMA)
      .toBuffer();
    composites.push({ input: strip, left: padding.left, top: padding.top + H });
  }

  if (composites.length > 0) {
    canvasBuffer = await sharp(canvasBuffer)
      .composite(composites)
      .toBuffer();
  }

  // Step 4: Add subtle noise overlay to break up banding
  canvasBuffer = await addSubtleNoise(canvasBuffer, targetW, targetH, W, H, padding);

  // Step 5: Apply gentle Gaussian feather at seams (3 px blur on full image)
  // This helps blend the transitions
  // Skip if no padding was applied
  if (padding.top > 0 || padding.bottom > 0 || padding.left > 0 || padding.right > 0) {
    // apply a very mild blur to just soften seam lines
    // We keep the center sharp by compositing original back over
    const softened = await sharp(canvasBuffer).blur(2).toBuffer();
    canvasBuffer = await sharp(softened)
      .composite([{
        input: buffer,
        left: padding.left,
        top: padding.top,
      }])
      .toBuffer();
  }

  return canvasBuffer;
}

// ─── Output generation ───────────────────────────────────────────────────────

/**
 * Generate all output files from a square buffer.
 *
 * @param {Buffer} squareBuffer - The square image buffer
 * @param {string} handle       - Product handle for naming
 * @param {number} sourceDim    - Source square dimension (to avoid upscaling)
 * @returns {Promise<Object>}   - Map of output keys to file paths
 */
async function generateOutputs(squareBuffer, handle, sourceDim) {
  const outDir = path.join(CONFIG.OUT_DIR, handle);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outputs = {};
  const warnings = [];

  for (const size of CONFIG.OUTPUT_SIZES) {
    // Always resize to exact target for grid uniformity.
    // Log a warning if upscaling beyond source.
    if (size > sourceDim) {
      warnings.push(`Upscaling from ${sourceDim} to ${size}`);
    }

    const resized = await sharp(squareBuffer)
      .resize(size, size, { fit: 'fill' })
      .toBuffer();

    // WebP
    const webpPath = path.join(outDir, `${handle}_sq_${size}.webp`);
    await sharp(resized)
      .webp({ quality: CONFIG.WEBP_QUALITY })
      .toFile(webpPath);
    outputs[`webp_${size}`] = webpPath;

    // JPG fallback
    const jpgPath = path.join(outDir, `${handle}_sq_${size}.jpg`);
    await sharp(resized)
      .jpeg({ quality: CONFIG.JPG_QUALITY })
      .toFile(jpgPath);
    outputs[`jpg_${size}`] = jpgPath;
  }

  return { outputs, warnings };
}

// ─── Process a single product ────────────────────────────────────────────────

/**
 * Full pipeline for one product image.
 *
 * @param {Object} product - { id, handle, title, featuredImageUrl }
 * @param {Object} manifest - Idempotency manifest
 * @param {Object} opts - CLI options
 * @returns {Promise<Object>} - Report entry for this product
 */
async function processProduct(product, manifest, opts) {
  const reportEntry = {
    product_id: product.id,
    handle: product.handle,
    title: product.title,
    image_url: product.featuredImageUrl,
    strategy: null,
    bbox: null,
    confidence: null,
    bg_type: null,
    margins: null,
    output_files: null,
    shopify_file_id: null,
    metafield_id: null,
    warnings: [],
    error: null,
  };

  try {
    if (!product.featuredImageUrl) {
      reportEntry.warnings.push('No featured image — skipped.');
      return reportEntry;
    }

    // 1. Download
    console.log(`  Downloading image...`);
    const { buffer, width, height, md5 } = await downloadImage(product.featuredImageUrl);
    console.log(`  Downloaded: ${width}×${height} (${(buffer.length / 1024).toFixed(0)} KB)`);

    // 2. Check idempotency
    const manifestKey = product.id;
    if (!opts.force && manifest[manifestKey] && manifest[manifestKey].source_md5 === md5) {
      console.log(`  Already processed (same md5) — skipping.`);
      reportEntry.warnings.push('Skipped — already processed, same source image.');
      reportEntry.strategy = manifest[manifestKey].strategy;
      reportEntry.output_files = manifest[manifestKey].outputs;
      return reportEntry;
    }

    // 3. Vision analysis
    console.log(`  Analyzing image...`);
    const analysis = await analyzeImage(buffer, width, height);
    reportEntry.bbox = analysis.bbox;
    reportEntry.confidence = analysis.confidence;
    reportEntry.bg_type = analysis.bg_type;

    if (analysis.confidence < CONFIG.MIN_CONFIDENCE) {
      reportEntry.warnings.push(`Low confidence (${analysis.confidence.toFixed(2)}) — results may need manual review.`);
    }

    // 4. Compute margins
    const margins = {
      top:    (analysis.bbox.y / height * 100).toFixed(1) + '%',
      bottom: (((height - analysis.bbox.y - analysis.bbox.h) / height) * 100).toFixed(1) + '%',
      left:   (analysis.bbox.x / width * 100).toFixed(1) + '%',
      right:  (((width - analysis.bbox.x - analysis.bbox.w) / width) * 100).toFixed(1) + '%',
    };
    reportEntry.margins = margins;
    console.log(`  Margins: T=${margins.top} B=${margins.bottom} L=${margins.left} R=${margins.right} | bg=${analysis.bg_type}`);

    // 5. Decision (no-generate policy enforced)
    const decision = decideStrategy(width, height, analysis.bbox, analysis.confidence, analysis.bg_type);
    reportEntry.strategy = decision.strategy;
    console.log(`  Strategy: ${decision.strategy} → target ${decision.targetSide}px`);

    if (opts.dryRun) {
      console.log(`  DRY-RUN: would generate outputs for ${product.handle}`);
      return reportEntry;
    }

    // 6. Execute strategy (NO generative methods — real pixels only)
    let squareBuffer;

    if (decision.strategy === 'CROP_SQUARE') {
      squareBuffer = await executeCrop(buffer, decision.cropRegion);
    } else {
      // FIT_AND_PAD_SOLID, FIT_AND_PAD_EDGE, FIT_AND_PAD_MIRROR
      squareBuffer = await executeExpandPad(buffer, width, height, decision.padding, analysis.bg_type);
    }

    // 7. Generate outputs
    console.log(`  Generating outputs...`);
    const { outputs, warnings: genWarnings } = await generateOutputs(squareBuffer, product.handle, decision.targetSide);
    reportEntry.output_files = outputs;
    if (genWarnings.length > 0) reportEntry.warnings.push(...genWarnings);

    // Log file sizes
    for (const [key, filePath] of Object.entries(outputs)) {
      const size = (fs.statSync(filePath).size / 1024).toFixed(1);
      console.log(`    ${key}: ${size} KB`);
    }

    // 8. Upload to Shopify (Sprint 2)
    if (opts.upload) {
      console.log(`  Uploading to Shopify Files...`);
      const webp1200 = outputs.webp_1200;
      if (webp1200 && fs.existsSync(webp1200)) {
        const filename = path.basename(webp1200);
        const uploadResult = await uploadToShopifyFiles(webp1200, filename, 'image/webp');
        if (uploadResult) {
          reportEntry.shopify_file_id = uploadResult.fileId;
          console.log(`  Uploaded: ${uploadResult.fileId}`);

          // Set metafield
          const mfId = await setSquareMetafield(product.id, uploadResult.fileId);
          reportEntry.metafield_id = mfId;
          console.log(`  Metafield set: ${mfId}`);
        } else {
          reportEntry.warnings.push('Shopify upload failed.');
        }
      }
    }

    // 9. Update manifest
    manifest[manifestKey] = {
      source_url: product.featuredImageUrl,
      source_md5: md5,
      strategy: reportEntry.strategy,
      processed_at: new Date().toISOString(),
      outputs,
      shopify_file_id: reportEntry.shopify_file_id,
      metafield_id: reportEntry.metafield_id,
    };
    saveManifest(manifest);

  } catch (err) {
    reportEntry.error = err.message;
    reportEntry.warnings.push(`Processing failed: ${err.message}`);
    console.error(`  ERROR: ${err.message}`);
  }

  return reportEntry;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Image Normalization Pipeline                   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Store:    ${process.env.SHOPIFY_STORE}`);
  console.log(`Limit:    ${opts.limit || 'all'}`);
  console.log(`Force:    ${opts.force}`);
  console.log(`Upload:   ${opts.upload}`);
  console.log(`Dry-run:  ${opts.dryRun}`);
  console.log(`Vision:   ${process.env.OPENAI_API_KEY ? 'OpenAI GPT-4o' : 'Local saliency'}`);
  console.log();

  // Ensure output directory
  if (!fs.existsSync(CONFIG.OUT_DIR)) fs.mkdirSync(CONFIG.OUT_DIR, { recursive: true });

  // Load manifest
  const manifest = loadManifest();

  // Fetch products
  console.log('Fetching product images from Shopify...');
  const products = await fetchProductImages(opts.limit);
  console.log(`Found ${products.length} products.\n`);

  // Filter to single product if specified
  let toProcess = products;
  if (opts.productId) {
    toProcess = products.filter(p => p.id === opts.productId);
    if (toProcess.length === 0) {
      console.error(`Product not found: ${opts.productId}`);
      process.exit(1);
    }
  }

  // Process each product
  const report = [];
  const stats = { total: toProcess.length, processed: 0, skipped: 0, failed: 0, crop: 0, expand: 0 };

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] ${product.title} (${product.handle})`);

    const entry = await processProduct(product, manifest, opts);
    report.push(entry);

    if (entry.error) {
      stats.failed++;
    } else if (entry.warnings.some(w => w.includes('Skipped'))) {
      stats.skipped++;
    } else {
      stats.processed++;
      if (entry.strategy === 'CROP_SQUARE') stats.crop++;
      else stats.expand++;
    }

    console.log();
  }

  // Write report
  const reportData = {
    generated_at: new Date().toISOString(),
    stats,
    entries: report,
  };
  fs.writeFileSync(CONFIG.REPORT_PATH, JSON.stringify(reportData, null, 2));

  // Summary
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total:     ${stats.total}`);
  console.log(`Processed: ${stats.processed} (crop: ${stats.crop}, expand: ${stats.expand})`);
  console.log(`Skipped:   ${stats.skipped}`);
  console.log(`Failed:    ${stats.failed}`);
  console.log(`Report:    ${CONFIG.REPORT_PATH}`);
  console.log(`Manifest:  ${CONFIG.MANIFEST_PATH}`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
