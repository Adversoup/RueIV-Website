#!/usr/bin/env node
require('dotenv').config();
const S = process.env.SHOPIFY_STORE;
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION;
const url = `https://${S}/admin/api/${V}/graphql.json`;

async function gql(query) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
    body: JSON.stringify({ query })
  });
  return r.json();
}

(async () => {
  // 1. List all menus
  const menus = await gql(`{ onlineStoreNavigationMenus(first: 50) { edges { node { id handle title items { title url } } } } }`);
  const edges = menus?.data?.onlineStoreNavigationMenus?.edges || [];
  console.log('=== ALL MENUS ===');
  for (const e of edges) {
    console.log(`  ${e.node.handle} — ${e.node.title} (${e.node.items.length} items)`);
  }

  // 2. Show room menu details
  const room = edges.find(e => e.node.handle === 'shop-by-room');
  if (room) {
    console.log('\n=== SHOP-BY-ROOM LINKS ===');
    for (const i of room.node.items) {
      console.log(`  ${i.title} -> ${i.url}`);
    }
  } else {
    console.log('\n!!! shop-by-room menu NOT FOUND');
  }

  // 3. Check room collections for images/products (REST API)
  console.log('\n=== ROOM COLLECTIONS ===');
  const handles = ['living-room', 'bedroom', 'dining-room', 'office', 'outdoor', 'hospitality'];
  for (const h of handles) {
    const r = await fetch(`https://${S}/admin/api/${V}/smart_collections.json?handle=${h}`, {
      headers: { 'X-Shopify-Access-Token': T }
    });
    const d = await r.json();
    const col = (d.smart_collections || [])[0];
    if (!col) { console.log(`  ${h}: NOT FOUND`); continue; }

    // Get products in this collection
    const r2 = await fetch(`https://${S}/admin/api/${V}/collections/${col.id}/products.json?limit=1`, {
      headers: { 'X-Shopify-Access-Token': T }
    });
    const d2 = await r2.json();
    const prod = (d2.products || [])[0];
    const imgUrl = prod ? (prod.image ? prod.image.src : (prod.images && prod.images[0] ? prod.images[0].src : 'NO_IMG')) : 'NO_PRODUCTS';
    console.log(`  ${h}: published=${col.published_at ? 'YES' : 'NO'}, image=${col.image ? col.image.src : 'NONE'}, firstProd="${prod ? prod.title : 'none'}" img=${imgUrl}`);
  }
})();
