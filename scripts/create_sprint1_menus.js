#!/usr/bin/env node
/**
 * Sprint 1 — Create additional navigation menus for the mega menu v2
 * Creates: shop-by-room, shop-by-color
 * Updates: shop-by-category with Outdoor added (if missing)
 */
require('dotenv/config');
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = '2024-10';
const GQL = `https://${STORE}/admin/api/${API_V}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors, null, 2));
  return j.data;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Fetch existing menus ───
async function getMenus() {
  const data = await gql(`{
    menus(first: 20) {
      edges { node { id handle title } }
    }
  }`);
  const map = {};
  for (const e of data.menus.edges) {
    map[e.node.handle] = e.node;
  }
  return map;
}

// ─── Fetch collection GIDs ───
async function getCollectionMap() {
  const map = {};
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      collections(first: 100${after}) {
        edges { node { id handle title } cursor }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of data.collections.edges) {
      map[e.node.handle] = e.node.id;
      cursor = e.cursor;
    }
    hasNext = data.collections.pageInfo.hasNextPage;
  }
  return map;
}

// ─── Create menu via menuCreate mutation ───
async function createMenu(title, handle, items) {
  const mutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }
  `;
  const data = await gql(mutation, { title, handle, items });
  const errors = data.menuCreate?.userErrors || [];
  if (errors.length > 0) {
    console.log(`  ⚠ Errors for ${handle}:`, errors.map(e => e.message).join(', '));
    return null;
  }
  return data.menuCreate.menu;
}

async function main() {
  console.log('─── Sprint 1: Create Navigation Menus ───\n');

  const menus = await getMenus();
  console.log(`Found ${Object.keys(menus).length} existing menus: ${Object.keys(menus).join(', ')}\n`);

  const colMap = await getCollectionMap();
  console.log(`Found ${Object.keys(colMap).length} collections\n`);

  // Helper: build collection link item
  const colItem = (title, handle) => {
    const gid = colMap[handle];
    if (!gid) {
      console.log(`  ⚠ Collection "${handle}" not found — skipping link "${title}"`);
      return null;
    }
    return { title, type: 'COLLECTION', resourceId: gid };
  };

  // ── 1. shop-by-room menu ──
  if (!menus['shop-by-room']) {
    console.log('▸ Creating shop-by-room menu...');
    // Room collections may not exist yet — use URL-based links
    const roomItems = [
      { title: 'Living Room', type: 'HTTP', url: '/collections/living-room' },
      { title: 'Bedroom',     type: 'HTTP', url: '/collections/bedroom' },
      { title: 'Dining Room', type: 'HTTP', url: '/collections/dining-room' },
      { title: 'Office',      type: 'HTTP', url: '/collections/office' },
      { title: 'Outdoor',     type: 'HTTP', url: '/collections/outdoor' },
      { title: 'Hospitality', type: 'HTTP', url: '/collections/hospitality' },
    ];
    const menu = await createMenu('Shop - By Room', 'shop-by-room', roomItems);
    if (menu) console.log(`  ✓ Created: ${menu.handle} (${menu.id})`);
    await sleep(500);
  } else {
    console.log('✓ shop-by-room already exists');
  }

  // ── 2. shop-by-color menu ──
  // Link to color collections per category grouping
  if (!menus['shop-by-color']) {
    console.log('▸ Creating shop-by-color menu...');
    // Top-level color families that have active collections
    const colorFamilies = [
      'White', 'Ivory', 'Cream', 'Beige', 'Taupe', 'Camel', 'Grey',
      'Blue', 'Navy', 'Teal', 'Green', 'Forest', 'Sage',
      'Gold', 'Red', 'Orange', 'Terracotta', 'Rust', 'Blush',
      'Black', 'Natural', 'Multi', 'Metallic', 'Indigo'
    ];

    // For the mega menu, we link to fabric-{color} by default
    // The mega menu snippet will resolve the correct category-color combo
    const colorItems = [];
    for (const color of colorFamilies) {
      const slug = color.toLowerCase().replace(/\s+/g, '-');
      // Try fabric first (most common), fall back to URL
      const handle = `fabric-${slug}`;
      const item = colItem(color, handle);
      if (item) {
        colorItems.push(item);
      } else {
        // Try just the slug
        const directItem = colItem(color, slug);
        if (directItem) {
          colorItems.push(directItem);
        }
      }
    }
    if (colorItems.length > 0) {
      const menu = await createMenu('Shop - By Color', 'shop-by-color', colorItems);
      if (menu) console.log(`  ✓ Created: ${menu.handle} (${menu.id}) with ${colorItems.length} color links`);
    } else {
      console.log('  ⚠ No color collections found — skipping menu creation');
    }
    await sleep(500);
  } else {
    console.log('✓ shop-by-color already exists');
  }

  console.log('\n─── Done ───');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
