#!/usr/bin/env node
require('dotenv/config');
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL = `https://${STORE}/admin/api/${API_V}/graphql.json`;
async function gql(q) {
  const r = await fetch(GQL, { method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN}, body:JSON.stringify({query:q}) });
  return (await r.json()).data;
}
async function main() {
  const d = await gql(`{ menus(first: 20) { nodes { id handle title items { title url type items { title url type } } } } }`);
  for (const m of d.menus.nodes) {
    if (m.handle !== 'main-menu' && m.handle !== 'footer') continue;
    console.log(`\n${m.handle} (${m.title}):`);
    for (const i of m.items) {
      console.log(`  ${i.title} → ${i.url} [${i.type}]`);
      if (i.items) i.items.forEach(c => console.log(`    ${c.title} → ${c.url} [${c.type}]`));
    }
  }
}
main();
