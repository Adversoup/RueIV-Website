#!/usr/bin/env node
/**
 * backfill_filter_tags.js
 * ───────────────────────
 * Backfills filter-related tags on products based on their metafields
 * and existing data. This powers the smart collection rules.
 *
 * Tags added:
 *   material:{value}       — from specs.material / taxonomy.material_type
 *   design:{value}         — from specs.pattern / taxonomy.design
 *   style:{value}          — from taxonomy.style
 *   room:{value}           — from taxonomy.room
 *   subcat:{value}         — from taxonomy.subcategory
 *   size:{value}           — from taxonomy.size_group
 *   lead-time:{value}      — from taxonomy.lead_time / specs.lead_time
 *   color-family:{group}   — derived from taxonomy.color_family → group mapping
 *
 * Usage:
 *   node scripts/backfill_filter_tags.js
 *   DRY_RUN=true node scripts/backfill_filter_tags.js
 *   LIMIT=10 node scripts/backfill_filter_tags.js
 */

require('dotenv').config();
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const DRY_RUN = process.env.DRY_RUN === 'true';
const LIMIT   = process.env.LIMIT ? parseInt(process.env.LIMIT) : Infinity;

/* ── Color family group mapping ─────────────────────── */
const COLOR_TO_GROUP = {};
const familyConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'navigation_v2.json'), 'utf8')
).color_families;

for (const [group, colors] of Object.entries(familyConfig)) {
  const groupName = group.charAt(0).toUpperCase() + group.slice(1);
  for (const color of colors) {
    COLOR_TO_GROUP[color.toLowerCase()] = groupName;
  }
}

/* ── Material extraction heuristics ──────────────────── */
const MATERIAL_KEYWORDS = [
  'linen', 'cotton', 'silk', 'velvet', 'wool', 'polyester', 'nylon',
  'acrylic', 'viscose', 'rayon', 'leather', 'performance',
  'paper', 'vinyl', 'grasscloth', 'textile', 'natural',
  'wood', 'metal', 'glass', 'stone', 'ceramic', 'marble', 'brass',
  'iron', 'steel', 'aluminum', 'copper', 'concrete', 'rattan', 'cane',
];

function extractMaterials(materialStr) {
  if (!materialStr) return [];
  const lower = materialStr.toLowerCase();
  const found = [];
  for (const kw of MATERIAL_KEYWORDS) {
    if (lower.includes(kw)) {
      found.push(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
  }
  return [...new Set(found)];
}

/* ── Design extraction ────────────────────────────────── */
const DESIGN_KEYWORDS = {
  'floral': 'Floral', 'botanical': 'Floral', 'flower': 'Floral',
  'geometric': 'Geometric', 'geo': 'Geometric',
  'texture': 'Texture', 'textured': 'Texture',
  'scenic': 'Scenic', 'toile': 'Scenic', 'landscape': 'Scenic',
  'animal': 'Animal', 'skin': 'Animal', 'leopard': 'Animal', 'zebra': 'Animal',
  'abstract': 'Abstract',
  'stripe': 'Stripe', 'striped': 'Stripe',
  'solid': 'Solid', 'plain': 'Solid',
};

function extractDesign(patternStr) {
  if (!patternStr) return null;
  const lower = patternStr.toLowerCase();
  for (const [kw, design] of Object.entries(DESIGN_KEYWORDS)) {
    if (lower.includes(kw)) return design;
  }
  return null;
}

/* ── GraphQL helper ───────────────────────────────────── */
function gql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: STORE,
      path: `/admin/api/${VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (json.errors) reject(new Error(JSON.stringify(json.errors)));
          else resolve(json.data);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Fetch all products with metafields ───────────────── */
async function fetchProducts() {
  const products = [];
  let cursor = null;

  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      products(first: 50${after}) {
        edges {
          cursor
          node {
            id
            title
            productType
            tags
            metafields(first: 30) {
              edges {
                node {
                  namespace key value
                }
              }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }`);

    for (const { cursor: c, node } of data.products.edges) {
      cursor = c;
      const mf = {};
      for (const { node: m } of node.metafields.edges) {
        mf[`${m.namespace}.${m.key}`] = m.value;
      }
      products.push({ ...node, mf, existingTags: new Set(node.tags) });
    }

    if (!data.products.pageInfo.hasNextPage) break;
    if (products.length >= LIMIT) break;
    await sleep(200);
  }

  return products.slice(0, LIMIT);
}

/* ── Compute tags for a product ───────────────────────── */
function computeNewTags(product) {
  const newTags = [];
  const mf = product.mf;
  const existing = product.existingTags;

  // 1. Material tags
  const materialType = mf['taxonomy.material_type'];
  const specsMaterial = mf['specs.material'];
  const materials = materialType
    ? (materialType.startsWith('[') ? JSON.parse(materialType) : [materialType])
    : extractMaterials(specsMaterial);

  for (const mat of materials) {
    const tag = `material:${mat}`;
    if (!existing.has(tag)) newTags.push(tag);
  }

  // 2. Design/Pattern tags
  const design = mf['taxonomy.design'] || extractDesign(mf['specs.pattern']);
  if (design) {
    const tag = `design:${design}`;
    if (!existing.has(tag)) newTags.push(tag);
  }

  // 3. Style tags
  const style = mf['taxonomy.style'];
  if (style) {
    const tag = `style:${style}`;
    if (!existing.has(tag)) newTags.push(tag);
  }

  // 4. Room tags
  const room = mf['taxonomy.room'];
  if (room) {
    const rooms = room.startsWith('[') ? JSON.parse(room) : [room];
    for (const r of rooms) {
      const slug = r.toLowerCase().replace(/\s+/g, '-');
      const tag = `room:${slug}`;
      if (!existing.has(tag)) newTags.push(tag);
    }
  }

  // 5. Subcategory tags
  const subcat = mf['taxonomy.subcategory'];
  if (subcat) {
    const tag = `subcat:${subcat}`;
    if (!existing.has(tag)) newTags.push(tag);
  }

  // 6. Size tags
  const sizeGroup = mf['taxonomy.size_group'];
  if (sizeGroup) {
    const tag = `size:${sizeGroup}`;
    if (!existing.has(tag)) newTags.push(tag);
  }

  // 7. Lead time tags
  const leadTime = mf['taxonomy.lead_time'] || mf['specs.lead_time'];
  if (leadTime) {
    const lt = leadTime.toLowerCase().includes('quick') ? 'Quick Ship' : 'Standard';
    const tag = `lead-time:${lt}`;
    if (!existing.has(tag)) newTags.push(tag);
  }

  // 8. Color family group tags
  const colorFamily = mf['taxonomy.color_family'];
  if (colorFamily) {
    const group = COLOR_TO_GROUP[colorFamily.toLowerCase()];
    if (group) {
      const tag = `color-family:${group}`;
      if (!existing.has(tag)) newTags.push(tag);
    }
  }

  return newTags;
}

/* ── Update product tags ──────────────────────────────── */
async function updateTags(productId, allTags) {
  const mutation = `
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }
  `;
  return gql(mutation, { id: productId, tags: allTags });
}

/* ── Main ─────────────────────────────────────────────── */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  RueIV Filter Tag Backfill                             ║');
  console.log('║  material · design · style · room · subcat · lead-time ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  if (DRY_RUN) console.log('⚠  DRY RUN mode — no mutations\n');

  console.log('→ Fetching products…');
  const products = await fetchProducts();
  console.log(`  Found ${products.length} products\n`);

  let updated = 0, skipped = 0, failed = 0;
  const tagStats = {};

  for (const product of products) {
    const newTags = computeNewTags(product);

    if (newTags.length === 0) {
      skipped++;
      continue;
    }

    // Track stats
    for (const tag of newTags) {
      const prefix = tag.split(':')[0];
      tagStats[prefix] = (tagStats[prefix] || 0) + 1;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${product.title} → +${newTags.length} tags: ${newTags.join(', ')}`);
      updated++;
      continue;
    }

    try {
      await updateTags(product.id, newTags);
      console.log(`  ✓ ${product.title} → +${newTags.length} tags`);
      updated++;
    } catch (err) {
      console.log(`  ✗ ${product.title}: ${err.message}`);
      failed++;
    }

    await sleep(250);
  }

  console.log('\n── Summary ──');
  console.log(`  Products processed: ${products.length}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped} (no new tags)`);
  console.log(`  Failed:  ${failed}`);
  console.log('\n── Tag distribution ──');
  for (const [prefix, count] of Object.entries(tagStats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${prefix}: ${count} tags added`);
  }

  console.log('\n✓ Filter tag backfill complete');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
