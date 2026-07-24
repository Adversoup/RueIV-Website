#!/usr/bin/env node
require('dotenv').config();
const S = process.env.SHOPIFY_STORE;
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION;
const GQL = `https://${S}/admin/api/${V}/graphql.json`;

async function gql(q) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
    body: JSON.stringify({ query: q }),
  });
  return r.json();
}

(async () => {
  const result = await gql(`{
    onlineStoreNavigationMenus(first: 50) {
      edges { node { handle title items { title url } } }
    }
  }`);
  const menus = result.data?.onlineStoreNavigationMenus?.edges || [];
  console.log('Total menus:', menus.length);
  for (const m of menus) {
    console.log(`\n  ${m.node.handle} — "${m.node.title}" (${m.node.items.length} items)`);
    for (const i of m.node.items) {
      console.log(`    ${i.title} -> ${i.url}`);
    }
  }
})();
