#!/usr/bin/env node
/**
 * setup_navigation_v2.js
 * ──────────────────────
 * Creates all Shopify navigation menus for the v2 category-first architecture.
 *
 * Creates:
 *  - main-menu (7 category items + The Vibe Studio)
 *  - 18 mega-menu data menus (3 per category)
 *  - footer menu
 *  - footer-secondary menu
 *
 * Uses GraphQL menuCreate/menuUpdate mutations.
 * Idempotent — skips menus that already exist with correct items.
 *
 * Usage:
 *   node scripts/setup_navigation_v2.js
 *   DRY_RUN=true node scripts/setup_navigation_v2.js
 */

require('dotenv').config();
const https = require('https');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const DRY_RUN = process.env.DRY_RUN === 'true';

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

/* ── Menu definitions ─────────────────────────────────── */
const NAV_CONFIG = require('../config/navigation_v2.json');

function buildMenuItems(items) {
  return items.map((item, idx) => ({
    title: item.title,
    type: 'HTTP',
    url: `https://${STORE.replace('.myshopify.com', '.com')}${item.url}`,
    position: idx,
  }));
}

/* ── List existing menus ──────────────────────────────── */
async function listMenus() {
  const data = await gql(`{
    menus(first: 100) {
      edges { node { id handle title itemsCount } }
    }
  }`);
  const map = {};
  for (const { node } of data.menus.edges) {
    map[node.handle] = node;
  }
  return map;
}

/* ── Create or update a menu ──────────────────────────── */
async function upsertMenu(handle, title, items, existingMenus) {
  const menuItems = buildMenuItems(items);

  if (existingMenus[handle]) {
    console.log(`  ✓ Menu "${handle}" already exists (${existingMenus[handle].itemsCount} items) — skipping`);
    return;
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would create menu "${handle}" with ${menuItems.length} items`);
    return;
  }

  const mutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }
  `;

  try {
    const data = await gql(mutation, { title, handle, items: menuItems });
    const result = data.menuCreate;
    if (result.userErrors?.length) {
      console.log(`  ✗ Error creating "${handle}":`, result.userErrors);
    } else {
      console.log(`  ✓ Created menu "${handle}" → ${result.menu.id}`);
    }
  } catch (err) {
    console.log(`  ✗ Failed to create "${handle}":`, err.message);
  }

  await sleep(300);
}

/* ── Main ─────────────────────────────────────────────── */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  RueIV Navigation v2 Setup                             ║');
  console.log('║  Category-first · No vendor links in nav               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  if (DRY_RUN) console.log('⚠  DRY RUN mode — no mutations\n');

  console.log('→ Listing existing menus…');
  const existingMenus = await listMenus();
  console.log(`  Found ${Object.keys(existingMenus).length} existing menus\n`);

  /* ── 1. Create mega menu data menus ──────────────────── */
  console.log('── Creating Mega Menu Data Menus ──');
  for (const [handle, menuDef] of Object.entries(NAV_CONFIG.mega_menus)) {
    await upsertMenu(handle, menuDef.title, menuDef.items, existingMenus);
  }

  /* ── 2. Create main menu ─────────────────────────────── */
  console.log('\n── Creating Main Menu ──');
  const mainItems = NAV_CONFIG.main_menu.items.map(item => ({
    title: item.title,
    url: item.url,
  }));
  await upsertMenu('main-menu', 'Main Navigation', mainItems, existingMenus);

  /* ── 3. Create footer menus ──────────────────────────── */
  console.log('\n── Creating Footer Menus ──');
  await upsertMenu(
    NAV_CONFIG.footer.handle,
    'Footer',
    NAV_CONFIG.footer.items,
    existingMenus
  );
  await upsertMenu(
    NAV_CONFIG.footer_secondary.handle,
    'Footer Secondary',
    NAV_CONFIG.footer_secondary.items,
    existingMenus
  );
  await upsertMenu(
    NAV_CONFIG.footer_company.handle,
    'Company',
    NAV_CONFIG.footer_company.items,
    existingMenus
  );
  await upsertMenu(
    NAV_CONFIG.footer_resources.handle,
    'Resources',
    NAV_CONFIG.footer_resources.items,
    existingMenus
  );

  /* ── Summary ─────────────────────────────────────────── */
  console.log('\n── Summary ──');
  const totalMenus = Object.keys(NAV_CONFIG.mega_menus).length + 3; // mega + main + 2 footers
  console.log(`  Total menus to create: ${totalMenus}`);
  console.log('  Main nav items: ' + NAV_CONFIG.main_menu.items.map(i => i.title).join(' · '));
  console.log('  Mega menus: ' + Object.keys(NAV_CONFIG.mega_menus).join(', '));
  console.log('\n✓ Navigation v2 setup complete');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
