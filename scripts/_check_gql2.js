#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;

async function gql(query) {
  const r = await fetch(`https://${store}/admin/api/${ver}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return r.json();
}

async function main() {
  // First, introspect the Menu type
  console.log('=== INTROSPECTING MENU TYPE ===');
  const intro = await gql(`{
    __type(name: "Menu") {
      fields { name type { name kind ofType { name } } }
    }
  }`);
  if (intro.data?.__type) {
    console.log('Menu fields:', intro.data.__type.fields.map(f => f.name).join(', '));
  } else {
    console.log('Menu type not found or error:', JSON.stringify(intro.errors || intro));
  }

  // Try menus query without itemsCount
  console.log('\n=== QUERYING MENUS ===');
  const result = await gql(`{
    menus(first: 50) {
      edges {
        node { id title handle }
      }
      pageInfo { hasNextPage }
    }
  }`);
  
  if (result.errors) {
    console.log('Errors:', JSON.stringify(result.errors));
  }
  
  const edges = result.data?.menus?.edges || [];
  console.log(`Found ${edges.length} menus`);
  if (edges.length > 0) {
    edges.slice(0, 10).forEach(e => console.log(`  - ${e.node.handle}: ${e.node.title}`));
    if (edges.length > 10) console.log(`  ... and ${edges.length - 10} more`);
  }
  
  // Try specific menu
  console.log('\n=== QUERYING MAIN MENU SPECIFICALLY ===');
  const mm = await gql(`{
    menu(handle: "main-menu") {
      id title handle
      items { title url }
    }
  }`);
  if (mm.errors) console.log('Errors:', JSON.stringify(mm.errors));
  if (mm.data?.menu) {
    console.log(`main-menu: ${mm.data.menu.title}`);
    mm.data.menu.items.forEach(i => console.log(`  - ${i.title}: ${i.url}`));
  } else {
    console.log('main-menu not found');
  }
  
  // Collections - try without productsCount
  console.log('\n=== COLLECTIONS ===');
  const colls = await gql(`{
    collections(first: 10) {
      edges { node { handle title } }
    }
  }`);
  if (colls.errors) console.log('Errors:', JSON.stringify(colls.errors));
  const ce = colls.data?.collections?.edges || [];
  console.log(`Found: ${ce.length}`);
  ce.forEach(e => console.log(`  - ${e.node.handle}: ${e.node.title}`));
  
  // Try the online store navigation scope
  console.log('\n=== CHECKING API VERSION & SCOPES ===');
  console.log(`Store: ${store}`);
  console.log(`API Version: ${ver}`);
  
  const shop = await gql(`{ shop { name plan { displayName } } }`);
  console.log('Shop:', JSON.stringify(shop.data?.shop));
}
main().catch(console.error);
