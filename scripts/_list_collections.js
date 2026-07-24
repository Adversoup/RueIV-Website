#!/usr/bin/env node
require('dotenv').config();
const S = process.env.SHOPIFY_STORE;
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION;

async function go() {
  let cursor = null, all = [];
  for (let i = 0; i < 10; i++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const q = `{ collections(first: 250${after}) { edges { cursor node { id handle title } } pageInfo { hasNextPage } } }`;
    const r = await fetch(`https://${S}/admin/api/${V}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
      body: JSON.stringify({ query: q })
    });
    const d = await r.json();
    const edges = d.data?.collections?.edges || [];
    edges.forEach(e => all.push({ handle: e.node.handle, title: e.node.title, id: e.node.id }));
    cursor = edges[edges.length - 1]?.cursor;
    if (!d.data?.collections?.pageInfo?.hasNextPage) break;
  }
  all.sort((a, b) => a.handle.localeCompare(b.handle));
  console.log(`Total: ${all.length}`);
  all.forEach(c => console.log(`${c.handle}  →  ${c.title}`));
}
go();
