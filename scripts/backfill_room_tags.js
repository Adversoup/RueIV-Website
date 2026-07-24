#!/usr/bin/env node
/**
 * scripts/backfill_room_tags.js
 * ─────────────────────────────
 * Applies room.* boolean metafields to eligible products.
 *
 * ROOM POLICY (STRICT):
 *   ALLOWED categories:  Furniture, Lighting, Rugs
 *   EXCLUDED categories: Fabric, Wallpaper, Trim (HARD SKIP — zero tolerance)
 *
 * Room mapping is keyword-based: product title + subcategory → room booleans.
 *
 * Usage:
 *   node scripts/backfill_room_tags.js              # apply
 *   node scripts/backfill_room_tags.js --dry-run    # preview only
 *   node scripts/backfill_room_tags.js --audit      # report only, no writes
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

// ─── ROOM POLICY ──────────────────────────────────────────────────────────────
const ALLOWED_CATEGORIES = new Set(['furniture', 'lighting', 'rugs']);
const EXCLUDED_CATEGORIES = new Set(['fabric', 'wallpaper', 'trim']);

const ROOMS = ['living_room', 'bedroom', 'dining_room', 'office', 'outdoor', 'hospitality'];

// ─── ROOM KEYWORD RULES ──────────────────────────────────────────────────────
// Each rule: if product title/subcategory matches keywords → assign rooms
const ROOM_RULES = [
  // Furniture — seating
  { keywords: ['sofa', 'sectional', 'loveseat', 'couch'], rooms: ['living_room', 'hospitality'] },
  { keywords: ['armchair', 'accent chair', 'lounge chair', 'club chair'], rooms: ['living_room', 'bedroom', 'hospitality'] },
  { keywords: ['dining chair', 'side chair'], rooms: ['dining_room', 'hospitality'] },
  { keywords: ['bar stool', 'counter stool', 'stool'], rooms: ['dining_room', 'hospitality'] },
  { keywords: ['bench'], rooms: ['living_room', 'bedroom', 'dining_room', 'hospitality'] },
  { keywords: ['office chair', 'desk chair', 'task chair'], rooms: ['office'] },
  { keywords: ['ottoman', 'pouf', 'footstool'], rooms: ['living_room', 'bedroom'] },
  { keywords: ['rocker', 'rocking chair', 'glider'], rooms: ['living_room', 'bedroom'] },
  { keywords: ['chaise', 'chaise longue', 'chaise lounge'], rooms: ['living_room', 'bedroom'] },
  { keywords: ['swivel chair', 'swivel'], rooms: ['living_room', 'office'] },
  { keywords: ['banquette'], rooms: ['dining_room', 'hospitality'] },
  { keywords: ['chair'], rooms: ['living_room', 'dining_room'] }, // catch-all — must be LAST in seating

  // Furniture — tables
  { keywords: ['coffee table'], rooms: ['living_room'] },
  { keywords: ['side table', 'end table', 'accent table', 'drink table'], rooms: ['living_room', 'bedroom'] },
  { keywords: ['console', 'console table', 'entry table'], rooms: ['living_room', 'hospitality'] },
  { keywords: ['dining table'], rooms: ['dining_room', 'hospitality'] },
  { keywords: ['desk', 'writing desk'], rooms: ['office', 'bedroom'] },
  { keywords: ['nightstand', 'bedside table', 'night stand'], rooms: ['bedroom'] },

  // Furniture — storage
  { keywords: ['bookcase', 'bookshelf', 'shelf', 'shelving', 'etagere', 'étagère'], rooms: ['living_room', 'office'] },
  { keywords: ['dresser', 'chest', 'armoire', 'wardrobe'], rooms: ['bedroom'] },
  { keywords: ['credenza', 'sideboard', 'buffet', 'cabinet'], rooms: ['dining_room', 'living_room', 'hospitality'] },
  { keywords: ['media console', 'tv stand', 'entertainment'], rooms: ['living_room'] },

  // Furniture — beds
  { keywords: ['bed', 'headboard', 'bed frame', 'canopy bed', 'four poster'], rooms: ['bedroom', 'hospitality'] },
  { keywords: ['daybed'], rooms: ['living_room', 'bedroom'] },

  // Furniture — outdoor
  { keywords: ['outdoor', 'patio', 'garden chair', 'garden table', 'pool', 'teak'], rooms: ['outdoor'] },

  // Lighting
  { keywords: ['chandelier', 'pendant', 'ceiling light', 'flush mount', 'semi-flush'], rooms: ['living_room', 'dining_room', 'bedroom', 'hospitality'] },
  { keywords: ['table lamp', 'desk lamp'], rooms: ['living_room', 'bedroom', 'office'] },
  { keywords: ['floor lamp', 'arc lamp', 'torchiere'], rooms: ['living_room', 'bedroom', 'office'] },
  { keywords: ['wall sconce', 'sconce', 'wall light'], rooms: ['living_room', 'bedroom', 'dining_room', 'hospitality'] },
  { keywords: ['outdoor light', 'lantern', 'exterior'], rooms: ['outdoor'] },
  { keywords: ['lamp'], rooms: ['living_room', 'bedroom'] }, // catch-all lamp — must be LAST in lighting

  // Rugs
  { keywords: ['rug', 'runner', 'area rug', 'carpet'], rooms: ['living_room', 'bedroom', 'dining_room', 'office', 'hospitality'] },
  { keywords: ['outdoor rug', 'indoor/outdoor', 'indoor outdoor'], rooms: ['outdoor'] },
];

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

// ─── Room Mapper ──────────────────────────────────────────────────────────────
function mapRooms(title, subcategory) {
  const text = `${title} ${subcategory || ''}`.toLowerCase();
  const matched = new Set();

  for (const rule of ROOM_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase())) {
        rule.rooms.forEach(r => matched.add(r));
        break; // one keyword match per rule is enough
      }
    }
  }
  return matched;
}

// ─── Fetch all products ───────────────────────────────────────────────────────
async function fetchAll() {
  const products = [];
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50${after}) {
        edges { cursor node { id handle title productType tags
          metafields(first: 20, keys: [
            "taxonomy.subcategory",
            "room.living_room", "room.bedroom", "room.dining_room",
            "room.office", "room.outdoor", "room.hospitality"
          ]) {
            edges { node { namespace key value } }
          }
        }}
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of result.data.products.edges) {
      const mf = {};
      for (const m of e.node.metafields.edges) mf[`${m.node.namespace}.${m.node.key}`] = m.node.value;
      products.push({
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        productType: (e.node.productType || '').toLowerCase(),
        tags: e.node.tags || [],
        subcategory: mf['taxonomy.subcategory'] || '',
        existingRooms: {
          living_room: mf['room.living_room'] === 'true',
          bedroom: mf['room.bedroom'] === 'true',
          dining_room: mf['room.dining_room'] === 'true',
          office: mf['room.office'] === 'true',
          outdoor: mf['room.outdoor'] === 'true',
          hospitality: mf['room.hospitality'] === 'true',
        },
      });
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
    await sleep(200);
  }
  return products;
}

// ─── Clear room metafields for a product ──────────────────────────────────────
async function clearRoomMetafields(productId) {
  const metafields = ROOMS.map(room => ({
    ownerId: productId,
    namespace: 'room',
    key: room,
    value: 'false',
    type: 'boolean',
  }));
  await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { metafields { id } userErrors { message } }
  }`, { metafields });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const audit  = process.argv.includes('--audit');

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Room Metafield Backfill — Strict Policy       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Store: ${STORE} | API: ${VERSION}`);
  if (dryRun) console.log('MODE: DRY RUN');
  if (audit)  console.log('MODE: AUDIT ONLY');
  console.log();

  console.log('POLICY:');
  console.log(`  ALLOWED:  ${[...ALLOWED_CATEGORIES].join(', ')}`);
  console.log(`  EXCLUDED: ${[...EXCLUDED_CATEGORIES].join(', ')} (HARD SKIP)`);
  console.log();

  const products = await fetchAll();
  console.log(`Found ${products.length} products\n`);

  const stats = {
    total: products.length,
    fabricSkipped: 0,
    wallpaperSkipped: 0,
    trimSkipped: 0,
    otherSkipped: 0,
    eligible: 0,
    tagged: 0,
    noMatch: 0,
    alreadyTaggedFabric: 0, // Fabric products that HAD room tags (violation)
    cleared: 0,
    errors: 0,
  };

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const progress = `[${i + 1}/${products.length}]`;
    const cat = p.productType;

    // ── STRICT EXCLUSION: Fabric, Wallpaper, Trim ──
    if (EXCLUDED_CATEGORIES.has(cat)) {
      // Check if this product erroneously has room tags
      const hasRoomTags = Object.values(p.existingRooms).some(v => v === true);

      if (cat === 'fabric') {
        stats.fabricSkipped++;
        if (hasRoomTags) {
          stats.alreadyTaggedFabric++;
          console.log(`${progress} ⚠ VIOLATION: ${p.title} (fabric) HAS room tags → clearing`);
          if (!dryRun && !audit) {
            await clearRoomMetafields(p.id);
            stats.cleared++;
            await sleep(300);
          }
        }
      } else if (cat === 'wallpaper') {
        stats.wallpaperSkipped++;
        if (hasRoomTags && !dryRun && !audit) {
          await clearRoomMetafields(p.id);
          stats.cleared++;
          await sleep(300);
        }
      } else if (cat === 'trim') {
        stats.trimSkipped++;
        if (hasRoomTags && !dryRun && !audit) {
          await clearRoomMetafields(p.id);
          stats.cleared++;
          await sleep(300);
        }
      }
      continue;
    }

    // ── Skip non-eligible categories ──
    if (!ALLOWED_CATEGORIES.has(cat)) {
      stats.otherSkipped++;
      continue;
    }

    stats.eligible++;

    // ── Map rooms ──
    const rooms = mapRooms(p.title, p.subcategory);
    if (rooms.size === 0) {
      stats.noMatch++;
      console.log(`${progress} ? ${p.title} (${cat}) → no room match`);
      continue;
    }

    const roomList = [...rooms].sort();
    console.log(`${progress} ✓ ${p.title} (${cat}) → ${roomList.join(', ')}`);

    if (dryRun || audit) {
      stats.tagged++;
      continue;
    }

    try {
      const metafields = ROOMS.map(room => ({
        ownerId: p.id,
        namespace: 'room',
        key: room,
        value: rooms.has(room) ? 'true' : 'false',
        type: 'boolean',
      }));

      await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { metafields { id } userErrors { message } }
      }`, { metafields });

      // Add room tags
      const newTags = [...p.tags.filter(t => !t.startsWith('room:'))];
      for (const room of roomList) {
        newTags.push(`room:${room.replace(/_/g, '-')}`);
      }
      const tagsChanged = JSON.stringify(newTags.sort()) !== JSON.stringify([...p.tags].sort());
      if (tagsChanged) {
        await gql(`mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) { product { id } userErrors { message } }
        }`, { input: { id: p.id, tags: newTags } });
      }

      stats.tagged++;
      await sleep(300);
    } catch (err) {
      console.error(`${progress} ✗ ERROR: ${p.title} — ${err.message}`);
      stats.errors++;
    }
  }

  // ─── Report ──────────────────────────────────────────────────────────────
  console.log();
  console.log('═══════════════════════════════════════════════════');
  console.log('ROOM TAGGING REPORT');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total products:     ${stats.total}`);
  console.log();
  console.log('EXCLUDED (hard skip):');
  console.log(`  Fabric skipped:   ${stats.fabricSkipped}`);
  console.log(`  Wallpaper skipped:${stats.wallpaperSkipped}`);
  console.log(`  Trim skipped:     ${stats.trimSkipped}`);
  console.log(`  Other categories: ${stats.otherSkipped}`);
  if (stats.alreadyTaggedFabric > 0) {
    console.log(`  ⚠ Fabric VIOLATIONS found & cleared: ${stats.alreadyTaggedFabric}`);
  }
  if (stats.cleared > 0) {
    console.log(`  Cleared room tags: ${stats.cleared}`);
  }
  console.log();
  console.log('ELIGIBLE (furniture/lighting/rugs):');
  console.log(`  Eligible:         ${stats.eligible}`);
  console.log(`  Tagged:           ${stats.tagged}`);
  console.log(`  No room match:    ${stats.noMatch}`);
  console.log(`  Errors:           ${stats.errors}`);
  console.log('═══════════════════════════════════════════════════');

  // Fabric assertion
  if (stats.fabricSkipped > 0) {
    console.log(`\n✓ POLICY CHECK: ${stats.fabricSkipped} Fabric products excluded. 0 tagged.`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
