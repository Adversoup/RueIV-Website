#!/usr/bin/env node
/**
 * scripts/set_hero_products.js
 * ────────────────────────────
 * Sets override.grid_weight on select products for visual prominence.
 *   1 = normal (default), 2 = featured (subtle elevation, priority sort), 3 = hero (2× width)
 *
 * Strategy: Pick 1 hero per category collection (the product with the best image/most representative)
 * The selection is manual — curated for visual impact.
 *
 * Usage:
 *   node scripts/set_hero_products.js              # apply weights
 *   node scripts/set_hero_products.js --dry-run     # preview only
 *   node scripts/set_hero_products.js --reset       # reset all to 1
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep   = ms => new Promise(r => setTimeout(r, ms));

const DRY_RUN = process.argv.includes('--dry-run');
const RESET   = process.argv.includes('--reset');

// ─── Curated selection ──────────────────────────────────────────────────────
// handle → grid_weight
// These are hand-picked for visual impact as hero (3) or featured (2) products.
const HERO_MAP = {
  // ── Fabric heroes ──
  'wind-chime-matte-ivory-3170002':        3,  // Fabricut hero — beautiful abstract linen
  'bamboo-11043884':                       2,  // ZR featured — striking blue weave
  'parallel-universe-raspberry-2478811':   2,  // Fabricut featured — bold red

  // ── Furniture heroes ──
  'charlotte-chair-cha-1000':              3,  // Verellen hero — elegant dining chair
  'brisbane-desk-bri-desk':                2,  // Verellen featured — wood desk
  'ella-sectional-ver-fur-79702a0d':       2,  // Verellen featured — sectional

  // ── Lighting heroes ──
  'origami-lamp-vlb89':                    3,  // Porta Romana hero — iconic folded form
  'helix-ceiling-light-mcl111':            2,  // Porta Romana featured — sculptural ceiling
  'como-floor-lamp-com-9010':              2,  // Verellen featured — natural wood base

  // ── Wallpaper heroes ──
  'floraison-97870':                       3,  // Arte hero — dramatic floral
  'mandu-18340':                           2,  // Arte featured — warm rust pattern
  'collines-97900':                        2,  // Arte featured — indigo landscape
};

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

// ─── Fetch products ──────────────────────────────────────────────────────────
async function fetchAll() {
  const products = [];
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50${after}) {
        edges { cursor node { id handle title productType
          metafields(first: 5, keys: ["override.grid_weight"]) {
            edges { node { namespace key value } }
          }
        }}
        pageInfo { hasNextPage }
      }
    }`);

    // Handle the case where keys filter may not work
    if (!result.data) {
      console.error('Query failed:', JSON.stringify(result.errors || result));
      break;
    }

    for (const e of result.data.products.edges) {
      let currentWeight = 1;
      for (const m of e.node.metafields.edges) {
        if (m.node.namespace === 'override' && m.node.key === 'grid_weight') {
          currentWeight = parseInt(m.node.value, 10) || 1;
        }
      }
      products.push({
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        productType: e.node.productType,
        currentWeight
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
  console.log('═══ Set Hero Products ═══');
  if (DRY_RUN) console.log('DRY RUN\n');
  if (RESET) console.log('RESET MODE — all weights → 1\n');

  const products = await fetchAll();
  console.log(`Total products: ${products.length}\n`);

  let updated = 0, skipped = 0, errors = 0;

  for (const p of products) {
    const targetWeight = RESET ? 1 : (HERO_MAP[p.handle] || 1);
    const weightLabel = targetWeight === 3 ? 'HERO' : targetWeight === 2 ? 'FEATURED' : 'normal';

    if (targetWeight === p.currentWeight) {
      if (targetWeight > 1) {
        console.log(`  ${p.title.padEnd(40)} → ${weightLabel} (already set)`);
      }
      skipped++;
      continue;
    }

    console.log(`  ${p.title.padEnd(40)} → ${weightLabel} (${p.currentWeight} → ${targetWeight})`);

    if (!DRY_RUN) {
      try {
        await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { metafields { id } userErrors { message } }
        }`, {
          metafields: [{
            ownerId: p.id,
            namespace: 'override',
            key: 'grid_weight',
            value: String(targetWeight),
            type: 'number_integer'
          }]
        });
        updated++;
        await sleep(300);
      } catch (err) {
        console.error(`  ERR: ${err.message}`);
        errors++;
      }
    } else {
      updated++;
    }
  }

  console.log(`\n═══ Summary ═══`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors:  ${errors}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
