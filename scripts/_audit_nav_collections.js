// Audit: list all Shopify navigation menus + collections
require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE || 'ruefour.myshopify.com';
const TOKEN = process.env.SHOPIFY_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API   = process.env.SHOPIFY_API_VERSION || '2026-04';
const url   = `https://${STORE}/admin/api/${API}/graphql.json`;

async function gql(query, variables) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await r.json();
  if (json.errors) { console.error('GQL errors:', JSON.stringify(json.errors, null, 2)); }
  return json;
}

async function run() {
  // ── Menus ──
  const menusQ = `{
    menus(first: 50) {
      nodes {
        id title handle
        items { id title url items { id title url items { id title url } } }
      }
    }
  }`;
  const m = await gql(menusQ);
  console.log('=== MENUS ===');
  for (const menu of m.data.menus.nodes) {
    console.log(`\n▸ ${menu.handle} | "${menu.title}" | ${menu.itemsCount} items | ${menu.id}`);
    for (const item of menu.items) {
      console.log(`  ├─ ${item.title} → ${item.url}`);
      if (item.items) {
        for (const child of item.items) {
          console.log(`  │  ├─ ${child.title} → ${child.url}`);
          if (child.items) {
            for (const gc of child.items) {
              console.log(`  │  │  └─ ${gc.title} → ${gc.url}`);
            }
          }
        }
      }
    }
  }

  // ── Collections ──
  let cursor = null;
  let allCols = [];
  while (true) {
    const afterArg = cursor ? `, after: "${cursor}"` : '';
    const colQ = `{ collections(first: 100${afterArg}) { pageInfo { hasNextPage endCursor } nodes { id handle title } } }`;
    const c = await gql(colQ);
    allCols = allCols.concat(c.data.collections.nodes);
    if (c.data.collections.pageInfo.hasNextPage) {
      cursor = c.data.collections.pageInfo.endCursor;
    } else break;
  }
  console.log(`\n=== COLLECTIONS (${allCols.length} total) ===`);
  for (const col of allCols) {
    console.log(`${col.handle} | ${col.title}`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
