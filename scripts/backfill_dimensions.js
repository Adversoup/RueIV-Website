#!/usr/bin/env node
/**
 * scripts/backfill_dimensions.js
 * ──────────────────────────────
 * Backfills dimensions from furniture_variants.csv into specs.dimensions metafield.
 * For products with multiple variants/sizes, creates a formatted dimension string.
 *
 * Usage:
 *   node scripts/backfill_dimensions.js              # apply
 *   node scripts/backfill_dimensions.js --dry-run     # preview only
 */
'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep   = ms => new Promise(r => setTimeout(r, ms));

const DRY_RUN = process.argv.includes('--dry-run');

// ─── GQL ──────────────────────────────────────────────────────────────────────
let pts = 1000, lastT = Date.now();
async function gql(query, variables = {}) {
  const now = Date.now(); pts = Math.min(1000, pts + (now - lastT) / 1000 * 50); lastT = now;
  if (pts < 100) { const w = Math.ceil((100 - pts) / 50) * 1000; await sleep(w); pts = Math.min(1000, pts + w / 1000 * 50); lastT = Date.now(); }
  for (let a = 1; a <= 3; a++) {
    const r = await fetch(GQL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN }, body: JSON.stringify({ query, variables }) });
    if (r.status === 429) { await sleep(parseFloat(r.headers.get('Retry-After') || '2') * 1000); continue; }
    const j = await r.json();
    if (j.extensions?.cost) pts = j.extensions.cost.throttleStatus?.currentlyAvailable ?? pts;
    if (j.errors?.some(e => e.message?.includes('Throttled')) && a < 3) { await sleep(2000); continue; }
    return j;
  }
  throw new Error('Max retries');
}

// ─── Load CSV data ────────────────────────────────────────────────────────────
function loadCSV(filename) {
  const p1 = path.resolve(__dirname, '..', 'mnt', 'data', filename);
  const p2 = path.resolve(__dirname, '..', 'data', filename);
  const p = fs.existsSync(p1) ? p1 : p2;
  return parse(fs.readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true });
}

// ─── Parse and group dimensions from furniture_variants.csv ───────────────────
function parseDimensions() {
  const variants = loadCSV('furniture_variants.csv');
  const coreProducts = loadCSV('core_products.csv');

  // Map SKU → product name
  const skuToName = {};
  for (const row of coreProducts) {
    if (row.category?.toLowerCase() === 'furniture') {
      skuToName[row.sku?.trim()] = row.name?.trim();
    }
  }

  // Group by SKU
  const byProduct = {};
  for (const v of variants) {
    const sku = v.sku?.trim();
    if (!sku) continue;
    if (!byProduct[sku]) byProduct[sku] = { name: skuToName[sku] || sku, variants: [] };

    const clean = val => {
      if (!val) return '';
      return val.replace(/"/g, '').replace(/^"|"$/g, '').trim();
    };

    byProduct[sku].variants.push({
      variantName: clean(v.variant_name),
      width: clean(v.width),
      depth: clean(v.depth),
      height: clean(v.height),
      seatHeight: clean(v.seat_height),
      armHeight: clean(v.arm_height)
    });
  }

  return byProduct;
}

// ─── Format dimensions as readable string ─────────────────────────────────────
function formatDimensions(variants) {
  if (variants.length === 0) return null;

  if (variants.length === 1) {
    const v = variants[0];
    const parts = [];
    if (v.width) parts.push(`W ${v.width}`);
    if (v.depth) parts.push(`D ${v.depth}`);
    if (v.height) parts.push(`H ${v.height}`);
    if (v.seatHeight && v.seatHeight !== v.height) parts.push(`SH ${v.seatHeight}`);
    if (v.armHeight) parts.push(`AH ${v.armHeight}`);
    return parts.join(' × ');
  }

  // Multiple variants — format each on its own line
  const lines = [];
  for (const v of variants) {
    const parts = [];
    if (v.width) parts.push(`W ${v.width}`);
    if (v.depth) parts.push(`D ${v.depth}`);
    if (v.height) parts.push(`H ${v.height}`);
    if (v.seatHeight && v.seatHeight !== v.height) parts.push(`SH ${v.seatHeight}`);
    if (v.armHeight) parts.push(`AH ${v.armHeight}`);
    const label = v.variantName ? `${v.variantName}: ` : '';
    lines.push(`${label}${parts.join(' × ')}`);
  }
  return lines.join('\n');
}

// ─── Fetch furniture products from Shopify ────────────────────────────────────
async function fetchFurniture() {
  const products = [];
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50, query: "product_type:Furniture"${after}) {
        edges { cursor node {
          id handle title
          metafields(first: 30) {
            edges { node { namespace key value } }
          }
        }}
        pageInfo { hasNextPage }
      }
    }`);

    for (const e of result.data.products.edges) {
      const mf = {};
      for (const m of e.node.metafields.edges) {
        mf[`${m.node.namespace}.${m.node.key}`] = m.node.value;
      }
      products.push({
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        existingDimensions: mf['specs.dimensions'] || '',
        existingWidth: mf['specs.width'] || '',
        existingHeight: mf['specs.height'] || '',
        allMeta: mf
      });
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
    await sleep(200);
  }
  return products;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══ Backfill Furniture Dimensions ═══');
  if (DRY_RUN) console.log('DRY RUN\n');

  const dimData = parseDimensions();
  const products = await fetchFurniture();

  console.log(`Furniture products in Shopify: ${products.length}`);
  console.log(`SKUs with dimension data in CSV: ${Object.keys(dimData).length}\n`);

  // Build name → SKU lookup for matching
  const coreProducts = loadCSV('core_products.csv');
  const nameToSku = {};
  for (const row of coreProducts) {
    if (row.category?.toLowerCase() === 'furniture') {
      nameToSku[row.name?.trim().toLowerCase()] = row.sku?.trim();
    }
  }

  let updated = 0, skipped = 0, noData = 0;

  for (const p of products) {
    const sku = nameToSku[p.title.toLowerCase()];
    const dim = sku ? dimData[sku] : null;

    if (!dim || dim.variants.length === 0) {
      console.log(`  ${p.title.padEnd(40)} — no dimension data in CSV`);
      noData++;
      continue;
    }

    const formatted = formatDimensions(dim.variants);
    if (!formatted) {
      noData++;
      continue;
    }

    // Check if already has good dimension data
    if (p.existingDimensions && p.existingDimensions.length > 5) {
      console.log(`  ${p.title.padEnd(40)} — already has dimensions: ${p.existingDimensions.substring(0, 50)}`);
      skipped++;
      continue;
    }

    const preview = formatted.split('\n')[0];
    const more = dim.variants.length > 1 ? ` (+${dim.variants.length - 1} variants)` : '';
    console.log(`  ${p.title.padEnd(40)} → ${preview}${more}`);

    if (!DRY_RUN) {
      const metafields = [
        { ownerId: p.id, namespace: 'specs', key: 'dimensions', value: formatted, type: 'multi_line_text_field' }
      ];

      // Also write individual width/depth/height from first variant for structured access
      const v0 = dim.variants[0];
      if (v0.width) metafields.push({ ownerId: p.id, namespace: 'specs', key: 'width', value: v0.width, type: 'single_line_text_field' });
      if (v0.height) metafields.push({ ownerId: p.id, namespace: 'specs', key: 'height', value: v0.height, type: 'single_line_text_field' });
      if (v0.depth) metafields.push({ ownerId: p.id, namespace: 'specs', key: 'depth', value: v0.depth, type: 'single_line_text_field' });
      if (v0.seatHeight) metafields.push({ ownerId: p.id, namespace: 'specs', key: 'seat_height', value: v0.seatHeight, type: 'single_line_text_field' });
      if (v0.armHeight) metafields.push({ ownerId: p.id, namespace: 'specs', key: 'arm_height', value: v0.armHeight, type: 'single_line_text_field' });

      try {
        await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { metafields { id } userErrors { message } }
        }`, { metafields });
        updated++;
        await sleep(300);
      } catch (err) {
        console.error(`  ERR: ${err.message}`);
      }
    } else {
      updated++;
    }
  }

  console.log(`\n═══ Summary ═══`);
  console.log(`Updated:  ${updated}`);
  console.log(`Skipped:  ${skipped} (already have dimensions)`);
  console.log(`No data:  ${noData} (not in CSV)`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
