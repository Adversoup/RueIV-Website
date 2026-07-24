#!/usr/bin/env node
/**
 * create_collections.js
 * ---------------------
 * Creates Shopify smart collections for the RueIV catalog:
 *   1. Category collections (Fabric, Wallpaper, Furniture, Lighting)
 *   2. Brand collections (Fabricut, Verellen, Arte, Porta Romana, ZR)
 *   3. End-use collections (Fabric × Upholstery, etc.)
 *   4. Color × Category collections (e.g., Navy Fabrics, Ivory Wallpapers)
 *
 * Uses SmartCollection REST API (GraphQL doesn't support smart-collection creation).
 */

require('dotenv/config');
const fs = require('fs');

const STORE  = process.env.SHOPIFY_STORE;
const TOKEN  = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V  = process.env.SHOPIFY_API_VERSION || '2024-04';
const DRY    = process.env.DRY_RUN === 'true';

const BASE   = `https://${STORE}/admin/api/${API_V}`;

// ─── Color taxonomy ───
const colorTax  = JSON.parse(fs.readFileSync('config/color_taxonomy.json', 'utf8'));
const endUseTax = JSON.parse(fs.readFileSync('config/end_use_taxonomy.json', 'utf8'));
const navConfig = JSON.parse(fs.readFileSync('config/navigation.json', 'utf8'));

// ─── Helpers ───

async function shopifyRest(method, endpoint, body) {
  const url = `${BASE}${endpoint}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  // Handle rate limiting
  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
    console.log(`  ⏳ Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return shopifyRest(method, endpoint, body);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${endpoint}: ${res.status} ${JSON.stringify(data.errors || data)}`);
  }
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Fetch existing collections to avoid duplicates ───

async function getExistingCollections() {
  const collections = [];
  let url = '/smart_collections.json?limit=250';
  while (url) {
    const data = await shopifyRest('GET', url);
    collections.push(...(data.smart_collections || []));
    // Check for pagination via Link header — simplified, likely < 250
    url = null;
  }
  // Also fetch custom collections
  const custom = await shopifyRest('GET', '/custom_collections.json?limit=250');
  collections.push(...(custom.custom_collections || []));
  return collections;
}

// ─── Create smart collection ───

async function createSmartCollection({ title, handle, rules, disjunctive = false, sort_order = 'best-selling', body_html = '' }) {
  if (DRY) {
    console.log(`  [DRY] Would create: ${handle} — "${title}"`);
    return { id: 'dry', handle };
  }
  const payload = {
    smart_collection: {
      title,
      handle,
      rules,
      disjunctive,
      sort_order,
      body_html,
      published: true,
    }
  };
  const data = await shopifyRest('POST', '/smart_collections.json', payload);
  return data.smart_collection;
}

// ─── Main ───

async function main() {
  console.log('─── Create Collections ───\n');

  // Get existing to skip duplicates
  const existing = await getExistingCollections();
  const existingHandles = new Set(existing.map(c => c.handle));
  console.log(`Found ${existing.length} existing collections\n`);

  const created = [];
  const skipped = [];
  const failed  = [];

  async function ensure(config) {
    if (existingHandles.has(config.handle)) {
      skipped.push(config.handle);
      console.log(`  ✓ skip   ${config.handle.padEnd(30)} (exists)`);
      return;
    }
    try {
      const col = await createSmartCollection(config);
      created.push(config.handle);
      console.log(`  ✚ create ${config.handle.padEnd(30)} — "${config.title}"`);
      await sleep(500); // Be nice to API
    } catch (err) {
      failed.push({ handle: config.handle, error: err.message });
      console.log(`  ✗ FAIL   ${config.handle.padEnd(30)} — ${err.message}`);
    }
  }

  // ─── 1. Category Collections ───
  console.log('▸ Category Collections');
  const categories = ['Fabric', 'Wallpaper', 'Furniture', 'Lighting'];
  for (const cat of categories) {
    await ensure({
      title: cat,
      handle: cat.toLowerCase(),
      rules: [{ column: 'type', relation: 'equals', condition: cat }],
      body_html: `<p>Explore our curated ${cat.toLowerCase()} collection.</p>`,
    });
  }

  // ─── 2. Brand Collections ───
  console.log('\n▸ Brand Collections');
  const brands = navConfig.collection_handles.brand_handles;
  for (const [vendor, handle] of Object.entries(brands)) {
    await ensure({
      title: vendor,
      handle,
      rules: [{ column: 'vendor', relation: 'equals', condition: vendor }],
      body_html: `<p>Shop ${vendor} at Rue IV.</p>`,
    });
  }

  // ─── 3. End-Use Collections (Fabric × EndUse) ───
  console.log('\n▸ End-Use Collections');
  const endUses = endUseTax.end_uses;
  for (const eu of endUses) {
    const handle = `fabric-${eu.slug}`;
    await ensure({
      title: `${eu.name} Fabrics`,
      handle,
      disjunctive: false, // ALL rules must match
      rules: [
        { column: 'type', relation: 'equals', condition: 'Fabric' },
        { column: 'tag', relation: 'equals', condition: `end-use:${eu.name}` },
      ],
      body_html: `<p>${eu.description}</p>`,
    });
  }

  // ─── 4. Color × Category Collections ───
  console.log('\n▸ Color × Category Collections');

  // First, discover which color:* tags actually exist on products
  // We fetch all products and check tags
  const productTags = await fetchAllProductTags();
  const activeColors = new Set();
  const activeColorsByCategory = {};

  for (const { type, tags } of productTags) {
    const cat = type;
    if (!activeColorsByCategory[cat]) activeColorsByCategory[cat] = new Set();
    for (const tag of tags) {
      if (tag.startsWith('color:')) {
        const color = tag.replace('color:', '');
        activeColors.add(color);
        activeColorsByCategory[cat].add(color);
      }
    }
  }

  console.log(`  Found ${activeColors.size} active color families across products`);

  // Only create color×category collections where products actually exist
  for (const cat of categories) {
    const colorsInCat = activeColorsByCategory[cat] || new Set();
    for (const colorSlug of colorsInCat) {
      const colorFamily = colorTax.families.find(f => f.slug === colorSlug);
      const colorName = colorFamily ? colorFamily.name : colorSlug.charAt(0).toUpperCase() + colorSlug.slice(1);
      const handle = `${cat.toLowerCase()}-${colorSlug}`;
      await ensure({
        title: `${colorName} ${cat}`,
        handle,
        disjunctive: false,
        rules: [
          { column: 'type', relation: 'equals', condition: cat },
          { column: 'tag', relation: 'equals', condition: `color:${colorSlug}` },
        ],
        body_html: `<p>${colorName} ${cat.toLowerCase()} from our curated collection.</p>`,
      });
    }
  }

  // ─── Summary ───
  console.log('\n─── Summary ───');
  console.log(`Created: ${created.length}`);
  console.log(`Skipped: ${skipped.length} (already existed)`);
  console.log(`Failed:  ${failed.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) {
      console.log(`  ${f.handle}: ${f.error}`);
    }
  }
}

// ─── Fetch all product tags + types ───

async function fetchAllProductTags() {
  const products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      products(first: 50${afterClause}) {
        edges {
          node {
            productType
            tags
          }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }`;

    const res = await fetch(`https://${STORE}/admin/api/${API_V}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    const edges = json.data.products.edges;
    for (const e of edges) {
      products.push({
        type: e.node.productType,
        tags: e.node.tags,
      });
      cursor = e.cursor;
    }
    hasNext = json.data.products.pageInfo.hasNextPage;
  }
  return products;
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
