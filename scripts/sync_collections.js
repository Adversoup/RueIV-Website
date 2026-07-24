#!/usr/bin/env node
/**
 * scripts/sync_collections.js
 * ───────────────────────────
 * Checks which color×category collections need to be created
 * (new colors mapped by AI pipeline) and creates them.
 *
 * Usage:
 *   node scripts/sync_collections.js             # create missing
 *   node scripts/sync_collections.js --dry-run    # preview only
 */
'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep   = ms => new Promise(r => setTimeout(r, ms));

const DRY_RUN = process.argv.includes('--dry-run');

const colorTax = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config', 'color_taxonomy.json'), 'utf8'));

// ─── GQL helper ──────────────────────────────────────────────────────────────
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

// ─── Fetch existing collections ──────────────────────────────────────────────
async function fetchExistingCollections() {
  const handles = new Set();
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      collections(first: 100${after}) {
        edges { cursor node { handle title } }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of result.data.collections.edges) {
      handles.add(e.node.handle);
      cursor = e.cursor;
    }
    if (!result.data.collections.pageInfo.hasNextPage) break;
  }
  return handles;
}

// ─── Count products per color×category ───────────────────────────────────────
async function countColorCategory() {
  const counts = {}; // "color:category" → count
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50${after}) {
        edges { cursor node { productType tags } }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of result.data.products.edges) {
      const pType = e.node.productType || '';
      const colorTags = (e.node.tags || []).filter(t => t.startsWith('color:') && !t.startsWith('color-secondary:'));
      for (const ct of colorTags) {
        const colorSlug = ct.replace('color:', '');
        const key = `${colorSlug}:${pType.toLowerCase()}`;
        counts[key] = (counts[key] || 0) + 1;
      }
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
  }
  return counts;
}

// ─── Build color family slug → name lookup ──────────────────────────────────
const SLUG_TO_NAME = {};
for (const f of colorTax.families) {
  SLUG_TO_NAME[f.slug] = f.name;
}

// ─── Create smart collection ─────────────────────────────────────────────────
async function createSmartCollection(title, handle, rules, disjunctive = false) {
  const REST_URL = `https://${STORE}/admin/api/${VERSION}/smart_collections.json`;
  const body = {
    smart_collection: {
      title,
      handle,
      rules,
      disjunctive,
      published: true,
      sort_order: 'best-selling'
    }
  };
  const r = await fetch(REST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.smart_collection;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══ Collection Sync ═══');
  if (DRY_RUN) console.log('DRY RUN\n');

  const [existing, counts] = await Promise.all([
    fetchExistingCollections(),
    countColorCategory()
  ]);

  console.log(`Existing collections: ${existing.size}`);
  console.log(`Color×Category combos with products: ${Object.keys(counts).length}\n`);

  const categories = ['fabric', 'furniture', 'lighting', 'wallpaper'];
  const toCreate = [];

  for (const [key, count] of Object.entries(counts)) {
    const [colorSlug, category] = key.split(':');
    if (!categories.includes(category)) continue;
    if (count === 0) continue;

    const colorName = SLUG_TO_NAME[colorSlug] || colorSlug;
    const catTitle = category.charAt(0).toUpperCase() + category.slice(1);

    // Collection handle pattern: "{category}-{color}" e.g. "fabric-navy"
    const handle = `${category}-${colorSlug}`;
    const title = `${colorName} ${catTitle}`;

    if (existing.has(handle)) continue;

    toCreate.push({
      title,
      handle,
      rules: [
        { column: 'type', relation: 'equals', condition: catTitle },
        { column: 'tag', relation: 'equals', condition: `color:${colorSlug}` }
      ],
      count
    });
  }

  if (toCreate.length === 0) {
    console.log('All collections already exist — nothing to create.');
    return;
  }

  console.log(`New collections to create: ${toCreate.length}\n`);

  let created = 0, errors = 0;
  for (const c of toCreate) {
    const line = `  ${c.title.padEnd(30)} (${c.count} products) → ${c.handle}`;
    if (DRY_RUN) {
      console.log(`  [DRY] ${line}`);
      continue;
    }

    try {
      await createSmartCollection(c.title, c.handle, c.rules);
      console.log(`  ✓ ${line}`);
      created++;
      await sleep(500);
    } catch (err) {
      console.error(`  ✗ ${c.title}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n═══ Summary ═══`);
  console.log(`Created: ${created}`);
  console.log(`Errors:  ${errors}`);
  console.log(`Total collections: ${existing.size + created}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
