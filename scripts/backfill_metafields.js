#!/usr/bin/env node
/**
 * backfill_metafields.js
 * ──────────────────────
 * Reads local CSVs, builds metafields, then writes them to existing Shopify
 * products matched by handle. Use this if products were created without
 * metafields (bug fix for the missing upsertMetafields call in create path).
 */

'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// ─── Configuration ────────────────────────────────────────────────────────────
const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const METAFIELD_NS = 'specs';

// ─── CSV reader ───────────────────────────────────────────────────────────────
function readCSV(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) { console.log(`  CSV not found: ${filename}`); return []; }
  return parse(fs.readFileSync(filepath, 'utf-8'), {
    columns: true, skip_empty_lines: true, relax_column_count: true, trim: true,
  });
}

// ─── Handle generation (same as import_shopify.js) ────────────────────────────
function toHandle(name, sku) {
  const slug = (name || sku || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const skuSlug = (sku || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return skuSlug ? `${slug}-${skuSlug}` : slug;
}

// ─── Build metafields from attributes (same logic as importer) ────────────────
function buildMetafields(attrs, category) {
  if (!attrs) return [];
  const mf = [];
  const skip = new Set(['sku', 'details_json']);

  for (const [key, value] of Object.entries(attrs)) {
    if (skip.has(key)) continue;
    const val = (value || '').trim();
    if (!val) continue;
    const mfType = val.includes('\n') ? 'multi_line_text_field' : 'single_line_text_field';
    mf.push({ namespace: METAFIELD_NS, key, value: val, type: mfType });
  }

  // Furniture details_json → separate metafields
  if (category === 'furniture' && attrs.details_json) {
    try {
      const details = typeof attrs.details_json === 'string'
        ? JSON.parse(attrs.details_json) : attrs.details_json;
      if (details && typeof details === 'object') {
        for (const [dk, dv] of Object.entries(details)) {
          const detailVal = (dv || '').trim();
          if (!detailVal) continue;
          const detailKey = dk.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
          const detailType = detailVal.includes('\n') ? 'multi_line_text_field' : 'single_line_text_field';
          mf.push({ namespace: METAFIELD_NS, key: detailKey, value: detailVal, type: detailType });
        }
      }
    } catch (e) { /* skip */ }
  }
  return mf;
}

function buildCoreMetafields(row) {
  const mf = [];
  const metaColumns = { material: 'material', color: 'color', lead_time: 'lead_time', country_of_origin: 'country_of_origin' };
  for (const [csvCol, mfKey] of Object.entries(metaColumns)) {
    const val = (row[csvCol] || '').trim();
    if (!val) continue;
    mf.push({ namespace: METAFIELD_NS, key: mfKey, value: val, type: 'single_line_text_field' });
  }
  return mf;
}

// ─── GraphQL helpers ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let availablePoints = 1000;
let lastRefillTime = Date.now();

async function gqlFetch(query, variables) {
  // Refill throttle points
  const now = Date.now();
  const elapsed = (now - lastRefillTime) / 1000;
  availablePoints = Math.min(1000, availablePoints + elapsed * 50);
  lastRefillTime = now;

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
      console.log(`  Rate limited, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }

    const json = await resp.json();
    // Track cost
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

// ─── Fetch all products from Shopify ──────────────────────────────────────────
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
          }
        }
        pageInfo { hasNextPage }
      }
    }`;

    const result = await gqlFetch(query, {});
    const edges = result.data.products.edges;
    for (const e of edges) {
      products.push(e.node);
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
    await sleep(200);
  }

  return products;
}

// ─── Upsert metafields on a product ──────────────────────────────────────────
async function upsertMetafields(ownerId, metafields) {
  if (!metafields || metafields.length === 0) return 0;

  const query = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key namespace }
        userErrors { field message }
      }
    }
  `;

  let written = 0;
  const BATCH_SIZE = 25;
  for (let i = 0; i < metafields.length; i += BATCH_SIZE) {
    const batch = metafields.slice(i, i + BATCH_SIZE).map(mf => ({
      ownerId,
      namespace: mf.namespace,
      key: mf.key,
      value: mf.value,
      type: mf.type,
    }));

    const result = await gqlFetch(query, { metafields: batch });
    const errs = result?.data?.metafieldsSet?.userErrors || [];
    if (errs.length > 0) {
      console.error(`  ⚠ Metafield errors for ${ownerId}:`, errs);
    }
    written += batch.length - errs.length;
  }
  return written;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Metafield Backfill — existing products    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Store: ${STORE} | API: ${VERSION}`);
  console.log();

  // 1. Read CSVs
  console.log('Reading CSVs...');
  const coreRows        = readCSV('core_products.csv');
  const fabricAttrs     = readCSV('fabric_attributes.csv');
  const furnitureAttrs  = readCSV('furniture_attributes.csv');
  const lightingAttrs   = readCSV('lighting_attributes.csv');
  const wallpaperAttrs  = readCSV('wallpaper_attributes.csv');

  console.log(`  core: ${coreRows.length}, fabric: ${fabricAttrs.length}, furniture: ${furnitureAttrs.length}, lighting: ${lightingAttrs.length}, wallpaper: ${wallpaperAttrs.length}`);

  // 2. Index attributes by SKU
  const indexBySku = (rows) => {
    const map = {};
    for (const r of rows) { const sku = (r.sku || '').trim(); if (sku) map[sku] = r; }
    return map;
  };
  const attrMaps = {
    fabric: indexBySku(fabricAttrs),
    furniture: indexBySku(furnitureAttrs),
    lighting: indexBySku(lightingAttrs),
    wallpaper: indexBySku(wallpaperAttrs),
  };

  // 3. Build handle → metafields map
  const handleToMeta = {};
  const seenHandles = new Set();

  for (const row of coreRows) {
    const sku = (row.sku || '').trim();
    if (!sku) continue;
    const name = (row.name || '').trim();
    const category = (row.category || '').toLowerCase();

    let handle = toHandle(name, sku);
    if (seenHandles.has(handle)) {
      let suffix = 2;
      while (seenHandles.has(`${handle}-${suffix}`)) suffix++;
      handle = `${handle}-${suffix}`;
    }
    seenHandles.add(handle);

    const mfList = [];
    mfList.push(...buildCoreMetafields(row));
    const attrMap = attrMaps[category];
    if (attrMap && attrMap[sku]) {
      mfList.push(...buildMetafields(attrMap[sku], category));
    }

    // Deduplicate by namespace+key
    const mfMap = new Map();
    for (const mf of mfList) mfMap.set(`${mf.namespace}.${mf.key}`, mf);
    handleToMeta[handle] = Array.from(mfMap.values());
  }

  console.log(`Built metafield sets for ${Object.keys(handleToMeta).length} handles.`);

  // 4. Fetch existing products from Shopify
  console.log('Fetching products from Shopify...');
  const shopifyProducts = await fetchAllProducts();
  console.log(`Found ${shopifyProducts.length} products in store.`);

  // 5. Match and write metafields
  let matched = 0, written = 0, skipped = 0, failed = 0;

  for (let i = 0; i < shopifyProducts.length; i++) {
    const sp = shopifyProducts[i];
    const meta = handleToMeta[sp.handle];
    const progress = `[${i + 1}/${shopifyProducts.length}]`;

    if (!meta || meta.length === 0) {
      console.log(`${progress} SKIP (no meta): ${sp.handle}`);
      skipped++;
      continue;
    }

    try {
      const count = await upsertMetafields(sp.id, meta);
      console.log(`${progress} ✓ ${sp.title} — ${count} metafields`);
      matched++;
      written += count;
      await sleep(200);
    } catch (err) {
      console.error(`${progress} ✗ FAILED: ${sp.title} — ${err.message}`);
      failed++;
    }
  }

  console.log();
  console.log('═════════════════════════════════════════');
  console.log(`Done. matched=${matched} written=${written} skipped=${skipped} failed=${failed}`);
  console.log('═════════════════════════════════════════');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
