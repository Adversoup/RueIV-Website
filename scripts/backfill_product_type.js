#!/usr/bin/env node
/**
 * scripts/backfill_product_type.js
 * ────────────────────────────────
 * Sets product_type on all products based on their category from CSV.
 * Also preserves taxonomy.color_raw from the existing specs.color metafield.
 *
 * Usage: node scripts/backfill_product_type.js
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

const CATEGORY_MAP = {
  fabric:    'Fabric',
  wallpaper: 'Wallpaper',
  furniture: 'Furniture',
  lighting:  'Lighting',
};

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

// ─── Load CSV for category lookup ─────────────────────────────────────────────
function loadCSV() {
  const csvPath = path.resolve(__dirname, '..', 'mnt', 'data', 'core_products.csv');
  if (!fs.existsSync(csvPath)) {
    // try data/ fallback
    const alt = path.resolve(__dirname, '..', 'data', 'core_products.csv');
    if (fs.existsSync(alt)) return parse(fs.readFileSync(alt, 'utf8'), { columns: true, skip_empty_lines: true });
  }
  return parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true });
}

// ─── Fetch all products ───────────────────────────────────────────────────────
async function fetchAll() {
  const products = [];
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50${after}) {
        edges { cursor node { id handle title productType
          metafields(first: 5, keys: ["specs.color"]) {
            edges { node { namespace key value } }
          }
        }}
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of result.data.products.edges) {
      const colorMf = e.node.metafields.edges.find(m => m.node.namespace === 'specs' && m.node.key === 'color');
      products.push({ id: e.node.id, handle: e.node.handle, title: e.node.title, productType: e.node.productType, rawColor: colorMf?.node?.value || '' });
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
    await sleep(200);
  }
  return products;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('─── Backfill Product Type & Color Raw ───');
  
  // Load CSV
  const rows = loadCSV();
  const skuToCategory = {};
  const nameToCategory = {};
  for (const row of rows) {
    skuToCategory[row.sku?.trim()] = row.category?.trim();
    nameToCategory[row.name?.trim().toLowerCase()] = row.category?.trim();
  }

  // Fetch products
  const products = await fetchAll();
  console.log(`Found ${products.length} products\n`);

  let updated = 0, skipped = 0, failed = 0;

  for (const p of products) {
    // Determine category
    let cat = null;
    // Try matching by handle patterns or title
    for (const row of rows) {
      if (row.name?.trim().toLowerCase() === p.title.toLowerCase()) {
        cat = row.category?.trim();
        break;
      }
    }
    if (!cat) {
      // Guess from handle
      if (p.handle.includes('ver-fur') || p.handle.includes('otto') || p.handle.includes('banq') ||
          p.handle.includes('desk') || p.handle.includes('console') || p.handle.includes('coffee') ||
          p.handle.includes('chair') || p.handle.includes('bed') || p.handle.includes('sofa') ||
          p.handle.includes('daybed') || p.handle.includes('rock')) {
        cat = 'furniture';
      }
    }

    const productType = CATEGORY_MAP[cat] || p.productType || '';
    
    if (!productType) {
      console.log(`  SKIP ${p.title} — no category found`);
      skipped++;
      continue;
    }

    // Check if already correct
    if (p.productType === productType) {
      // Still write color_raw if we have it
      if (p.rawColor && p.rawColor.length > 0) {
        await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { metafields { id } userErrors { message } }
        }`, { metafields: [{ ownerId: p.id, namespace: 'taxonomy', key: 'color_raw', value: p.rawColor, type: 'single_line_text_field' }] });
      }
      console.log(`  OK   ${p.title} — already ${productType}`);
      skipped++;
      continue;
    }

    // Update product type
    try {
      const result = await gql(`mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id productType }
          userErrors { field message }
        }
      }`, { input: { id: p.id, productType } });

      const errors = result.data?.productUpdate?.userErrors || [];
      if (errors.length > 0) {
        console.log(`  FAIL ${p.title}: ${errors[0].message}`);
        failed++;
      } else {
        // Also write color_raw metafield
        if (p.rawColor && p.rawColor.length > 0) {
          await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) { metafields { id } userErrors { message } }
          }`, { metafields: [{ ownerId: p.id, namespace: 'taxonomy', key: 'color_raw', value: p.rawColor, type: 'single_line_text_field' }] });
        }
        console.log(`  SET  ${p.title} → ${productType}`);
        updated++;
      }
      await sleep(300);
    } catch (err) {
      console.log(`  ERR  ${p.title}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n─── Summary ───');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped} (already correct)`);
  console.log(`Failed:  ${failed}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
