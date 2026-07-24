#!/usr/bin/env node
/**
 * fix_vendors.js — Three operations:
 *  1. Normalize duplicate vendor names (arte→Arte, porta-romana→Porta Romana, etc.)
 *  2. Create missing vendor collections (automated smart collections by vendor)
 *  3. Update Designers menu with all 10 unique vendors
 */
require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER   = process.env.SHOPIFY_API_VERSION;
const GQL   = `https://${STORE}/admin/api/${VER}/graphql.json`;
const REST  = `https://${STORE}/admin/api/${VER}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await r.json();
  if (json.errors) {
    console.error('GQL errors:', JSON.stringify(json.errors, null, 2));
    throw new Error('GraphQL error');
  }
  return json.data;
}

async function restPost(path, body) {
  const r = await fetch(`${REST}${path}`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function restGet(path) {
  const r = await fetch(`${REST}${path}`, {
    headers: { 'X-Shopify-Access-Token': TOKEN }
  });
  return r.json();
}

/* ══════════════════════════════════════════════════════════════
   STEP 1 — Normalize duplicate vendor names
   ══════════════════════════════════════════════════════════════ */

// Map of wrong vendor name → correct vendor name
const VENDOR_FIXES = {
  'arte':          'Arte',
  'porta-romana':  'Porta Romana',
  'verellen':      'Verellen',
  'alexander_lamont': 'Alexander Lamont',
  'cc-milano':     'CC Milano',
  'chase-erwin':   'Chase Erwin',
  'altura':        'Altura',
};

async function fixVendorNames() {
  console.log('\n━━━ STEP 1: Normalize vendor names ━━━');

  for (const [wrong, correct] of Object.entries(VENDOR_FIXES)) {
    // Collect all product IDs with wrong vendor
    let cursor = null;
    const ids = [];

    for (let page = 0; page < 50; page++) {
      const after = cursor ? `, after: "${cursor}"` : '';
      const escapedVendor = wrong.replace(/"/g, '\\"');
      const data = await gql(`{
        products(first: 100, query: "vendor:\\"${escapedVendor}\\""${after}) {
          edges {
            cursor
            node { id vendor }
          }
          pageInfo { hasNextPage }
        }
      }`);

      const edges = data.products.edges;
      if (edges.length === 0) break;

      for (const edge of edges) {
        if (edge.node.vendor === wrong) ids.push(edge.node.id);
      }

      cursor = edges[edges.length - 1]?.cursor;
      if (!data.products.pageInfo.hasNextPage) break;
    }

    if (ids.length === 0) {
      console.log(`  · "${wrong}" — no products to fix`);
      continue;
    }

    console.log(`  … "${wrong}" → "${correct}" — updating ${ids.length} products`);

    // Update in batches of 10 concurrently
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      await Promise.all(batch.map(id =>
        gql(`mutation { productUpdate(input: { id: "${id}", vendor: ${JSON.stringify(correct)} }) { product { id } userErrors { message } } }`)
      ));
      process.stdout.write(`    ${Math.min(i + 10, ids.length)}/${ids.length}\r`);
      await sleep(500);
    }
    console.log(`  ✓ "${wrong}" → "${correct}" (${ids.length} products)`);
  }
}

/* ══════════════════════════════════════════════════════════════
   STEP 2 — Create missing vendor collections (smart collections)
   ══════════════════════════════════════════════════════════════ */

const VENDOR_COLLECTIONS = [
  { title: 'Area Environments', handle: 'area-environments', vendor: 'Area Environments' },
  { title: 'Alexander Lamont',  handle: 'alexander-lamont',  vendor: 'Alexander Lamont' },
  { title: 'Altura',            handle: 'altura',             vendor: 'Altura' },
  { title: 'CC Milano',         handle: 'cc-milano',          vendor: 'CC Milano' },
  { title: 'Chase Erwin',       handle: 'chase-erwin',        vendor: 'Chase Erwin' },
];

async function createVendorCollections() {
  console.log('\n━━━ STEP 2: Create missing vendor collections ━━━');

  // Check what already exists
  const existing = await gql(`{
    collections(first: 250) {
      edges { node { handle title } }
    }
  }`);
  const existingHandles = new Set(existing.collections.edges.map(e => e.node.handle));

  for (const vc of VENDOR_COLLECTIONS) {
    if (existingHandles.has(vc.handle)) {
      console.log(`  · ${vc.title} — already exists`);
      continue;
    }

    // Create smart collection via REST (GraphQL doesn't support smart collections well)
    const result = await restPost('/smart_collections.json', {
      smart_collection: {
        title: vc.title,
        rules: [
          { column: 'vendor', relation: 'equals', condition: vc.vendor }
        ],
        published: true,
        sort_order: 'best-selling'
      }
    });

    if (result.smart_collection) {
      console.log(`  ✓ Created: ${vc.title} (handle: ${result.smart_collection.handle})`);
    } else {
      console.error(`  ✗ Failed: ${vc.title}`, JSON.stringify(result.errors || result));
    }
    await sleep(500);
  }
}

/* ══════════════════════════════════════════════════════════════
   STEP 3 — Update Designers menu with all vendors
   ══════════════════════════════════════════════════════════════ */

async function updateDesignersMenu() {
  console.log('\n━━━ STEP 3: Update Designers menu ━━━');

  // Refetch collection map after creating new ones
  const colMap = {};
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{ collections(first: 250${after}) { edges { cursor node { id handle } } pageInfo { hasNextPage } } }`);
    for (const edge of data.collections.edges) {
      colMap[edge.node.handle] = edge.node.id;
      cursor = edge.cursor;
    }
    if (!data.collections.pageInfo.hasNextPage) break;
  }

  // Build collection-linked item
  function col(title, handle) {
    const gid = colMap[handle];
    return gid
      ? { title, type: 'COLLECTION', resourceId: gid }
      : { title, type: 'HTTP', url: `https://${STORE}/collections/${handle}` };
  }

  function http(title, path, children) {
    const item = { title, type: 'HTTP', url: `https://${STORE}${path}` };
    if (children && children.length) item.items = children;
    return item;
  }

  // Get current main menu
  const { menus } = await gql(`{
    menus(first: 50) {
      nodes {
        id handle title
        items {
          title type url resourceId
          items {
            title type url resourceId
            items { title type url resourceId }
          }
        }
      }
    }
  }`);

  const mainMenu = menus.nodes.find(m => m.handle === 'main-menu');
  if (!mainMenu) {
    console.error('  ✗ main-menu not found');
    return;
  }

  // Rebuild items — keep everything, just replace Designers children
  function cloneItem(item) {
    const cloned = { title: item.title, type: item.type };
    if (item.resourceId) cloned.resourceId = item.resourceId;
    else if (item.url) cloned.url = item.url;
    if (item.items && item.items.length) {
      cloned.items = item.items.map(cloneItem);
    }
    return cloned;
  }

  const newItems = mainMenu.items.map(item => {
    if (item.title === 'Designers') {
      // Replace children with all 10 vendors sorted alphabetically
      return http('Designers', '/collections', [
        http('All Designers', '/collections'),
        col('Alexander Lamont', 'alexander-lamont'),
        col('Altura', 'altura'),
        col('Area Environments', 'area-environments'),
        col('Arte', 'arte'),
        col('CC Milano', 'cc-milano'),
        col('Chase Erwin', 'chase-erwin'),
        col('Fabricut', 'fabricut'),
        col('Porta Romana', 'porta-romana'),
        col('Verellen', 'verellen'),
        col('ZR', 'zr'),
      ]);
    }
    return cloneItem(item);
  });

  // Update menu
  const result = await gql(`
    mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu {
          id
          items {
            title type
            items { title type }
          }
        }
        userErrors { field message }
      }
    }
  `, { id: mainMenu.id, title: mainMenu.title, items: newItems });

  const errs = result.menuUpdate?.userErrors;
  if (errs?.length) {
    console.error('  ✗ Errors:', JSON.stringify(errs, null, 2));
    return;
  }

  // Show Designers section
  const designers = result.menuUpdate.menu.items.find(i => i.title === 'Designers');
  console.log('  ✓ Designers menu updated:');
  (designers?.items || []).forEach(c => {
    console.log(`    ├─ ${c.title}  [${c.type}]`);
  });
}

/* ══════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════ */

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Fix Vendors — Normalize, Create Collections, Menu   ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  await fixVendorNames();
  await createVendorCollections();
  await updateDesignersMenu();

  console.log('\n✅ All vendor fixes complete!');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
