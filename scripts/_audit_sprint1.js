#!/usr/bin/env node
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = '2024-10';
const GQL     = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function main() {
  console.log('=== COLLECTIONS ===');
  let cursor = null;
  let hasNext = true;
  const allCols = [];
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const { data } = await gql(`{ collections(first: 50${after}) { edges { cursor node { id title handle productsCount { count } ruleSet { rules { column relation condition } } image { url } } } pageInfo { hasNextPage } } }`);
    if (!data?.collections) break;
    for (const e of data.collections.edges) { allCols.push(e.node); cursor = e.cursor; }
    hasNext = data.collections.pageInfo.hasNextPage;
  }
  for (const c of allCols) {
    const rules = c.ruleSet?.rules?.map(r => `${r.column}${r.relation}${r.condition}`).join(' & ') || 'manual';
    console.log(`  ${c.title} [${c.handle}] — ${c.productsCount?.count || 0} products — ${rules}`);
  }
  console.log(`\nTotal: ${allCols.length} collections\n`);

  console.log('=== METAFIELD DEFINITIONS ===');
  const { data: mfData } = await gql(`{ metafieldDefinitions(first: 100, ownerType: PRODUCT) { edges { node { namespace key name type { name } validations { name value } } } } }`);
  for (const e of (mfData?.metafieldDefinitions?.edges || [])) {
    const d = e.node;
    const vals = d.validations?.length ? ` [${d.validations.map(v => `${v.name}=${v.value}`).join(', ')}]` : '';
    console.log(`  ${d.namespace}.${d.key} (${d.type.name}) — "${d.name}"${vals}`);
  }

  console.log('\n=== NAVIGATION MENUS ===');
  const restResp = await fetch(`https://${STORE}/admin/api/${VERSION}/menus.json`, {
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Accept': 'application/json' }
  });
  if (restResp.ok) {
    const menus = await restResp.json();
    for (const m of (menus.menus || [])) {
      console.log(`  Menu: "${m.title}" (handle: ${m.handle}, ${m.items?.length || 0} items)`);
      for (const item of (m.items || [])) {
        console.log(`    - ${item.title} → ${item.url || item.resource_url || '(none)'}`);
        for (const sub of (item.items || [])) {
          console.log(`      - ${sub.title} → ${sub.url || sub.resource_url || '(none)'}`);
        }
      }
    }
  } else {
    // Try GQL for online store navigation
    const { data: navData } = await gql(`{ menu(handle: "main-menu") { title items { title url items { title url } } } }`);
    console.log(JSON.stringify(navData, null, 2));
  }

  console.log('\n=== VENDOR LIST ===');
  const vendors = new Set();
  let pCursor = null;
  let pHasNext = true;
  while (pHasNext) {
    const after = pCursor ? `, after: "${pCursor}"` : '';
    const { data: pData } = await gql(`{ products(first: 100${after}) { edges { cursor node { vendor } } pageInfo { hasNextPage } } }`);
    if (!pData?.products) break;
    for (const e of pData.products.edges) { vendors.add(e.node.vendor); pCursor = e.cursor; }
    pHasNext = pData.products.pageInfo.hasNextPage;
  }
  console.log(`  Vendors: ${[...vendors].sort().join(', ')}`);
  console.log(`  Count: ${vendors.size}`);
}

main().catch(console.error);
