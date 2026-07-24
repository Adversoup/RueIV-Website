#!/usr/bin/env node
require('dotenv/config');
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = '2024-10';
const GQL = `https://${STORE}/admin/api/${API_V}/graphql.json`;

async function run() {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({
      query: `{
        menus(first: 20) {
          edges {
            node {
              id handle title
              items {
                title url type
                items {
                  title url type
                  items {
                    title url type
                  }
                }
              }
            }
          }
        }
      }`
    })
  });
  const j = await r.json();
  if (j.errors) { console.error('GQL errors:', JSON.stringify(j.errors, null, 2)); return; }
  if (!j.data) { console.error('No data:', JSON.stringify(j, null, 2)); return; }
  for (const e of j.data.menus.edges) {
    const m = e.node;
    console.log(`\n=== ${m.handle} ("${m.title}") ===`);
    for (const n of m.items) {
      console.log(`  ${n.title} → ${n.url}`);
      for (const c of (n.items || [])) {
        console.log(`    ${c.title} → ${c.url}`);
        for (const d of (c.items || [])) {
          console.log(`      ${d.title} → ${d.url}`);
        }
      }
    }
  }
}
run().catch(console.error);
