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
  // Get all menus via GraphQL with pagination
  console.log('=== QUERYING MENUS VIA GRAPHQL ===');
  let allMenus = [];
  let cursor = null;
  let hasNext = true;
  
  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      menus(first: 50${afterClause}) {
        edges {
          cursor
          node { id title handle itemsCount }
        }
        pageInfo { hasNextPage }
      }
    }`);
    
    if (result.errors) {
      console.log('GraphQL errors:', JSON.stringify(result.errors));
      break;
    }
    
    const edges = result.data?.menus?.edges || [];
    allMenus.push(...edges.map(e => e.node));
    hasNext = result.data?.menus?.pageInfo?.hasNextPage;
    if (edges.length > 0) cursor = edges[edges.length - 1].cursor;
  }
  
  console.log(`Total menus: ${allMenus.length}`);
  
  // Check main-menu
  const mm = allMenus.find(m => m.handle === 'main-menu');
  if (mm) {
    console.log(`\n✅ main-menu: "${mm.title}" (${mm.itemsCount} items)`);
    // Get items
    const detail = await gql(`{
      menu(handle: "main-menu") {
        items { title url }
      }
    }`);
    if (detail.data?.menu?.items) {
      detail.data.menu.items.forEach(i => console.log(`   - ${i.title}: ${i.url}`));
    }
  } else {
    console.log('\n❌ main-menu NOT FOUND');
    // List all menu handles
    allMenus.forEach(m => console.log(`  ${m.handle}: ${m.title} (${m.itemsCount})`));
  }
  
  // Check data menus
  console.log('\n=== DATA MENUS ===');
  const dataMenus = [
    'textiles-application', 'textiles-material', 'textiles-color-family',
    'wallcovering-materials', 'wallcovering-design', 'wallcovering-color-family',
    'furniture-type-v2', 'furniture-room', 'furniture-designers',
    'lighting-type', 'lighting-style', 'lighting-color',
    'rugs-size', 'rugs-material', 'rugs-color',
    'accessories-category', 'accessories-room', 'accessories-material'
  ];
  
  const menuHandles = allMenus.map(m => m.handle);
  let found = 0, missing = 0;
  for (const dm of dataMenus) {
    const m = allMenus.find(m => m.handle === dm);
    if (m) {
      found++;
      console.log(`  ✅ ${dm} (${m.itemsCount} items)`);
    } else {
      missing++;
      console.log(`  ❌ ${dm}`);
    }
  }
  console.log(`\nResult: ${found} found, ${missing} missing`);
  
  // Also check collections via GraphQL with cursor pagination
  console.log('\n=== COLLECTIONS VIA GRAPHQL ===');
  let allColls = [];
  cursor = null;
  hasNext = true;
  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      collections(first: 50${afterClause}) {
        edges {
          cursor
          node { handle title productsCount }
        }
        pageInfo { hasNextPage }
      }
    }`);
    const edges = result.data?.collections?.edges || [];
    allColls.push(...edges.map(e => e.node));
    hasNext = result.data?.collections?.pageInfo?.hasNextPage;
    if (edges.length > 0) cursor = edges[edges.length - 1].cursor;
  }
  console.log(`Total collections: ${allColls.length}`);
  const needed = ['fabric', 'wallpaper', 'furniture', 'lighting', 'rugs', 'accessories', 'quick-ship', 'textiles'];
  for (const h of needed) {
    const c = allColls.find(c => c.handle === h);
    console.log(`  ${c ? '✅' : '❌'} ${h}${c ? ' (' + c.productsCount + ' products)' : ''}`);
  }
}
main().catch(console.error);
