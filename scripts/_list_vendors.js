#!/usr/bin/env node
/** List all unique product vendors in the store */
require('dotenv').config();
const S = process.env.SHOPIFY_STORE;
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION;

async function getVendors() {
  let cursor = null;
  const vendors = new Set();
  for (let i = 0; i < 100; i++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const q = `{ products(first: 250${after}) { edges { cursor node { vendor } } pageInfo { hasNextPage } } }`;
    const r = await fetch(`https://${S}/admin/api/${V}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
      body: JSON.stringify({ query: q })
    });
    const d = await r.json();
    const edges = d.data?.products?.edges || [];
    edges.forEach(e => e.node.vendor && vendors.add(e.node.vendor));
    cursor = edges[edges.length - 1]?.cursor;
    if (!d.data?.products?.pageInfo?.hasNextPage) break;
  }
  const sorted = Array.from(vendors).sort();
  console.log(`Total Vendors: ${sorted.length}`);
  sorted.forEach(v => console.log(`  ${v}`));
}
getVendors();
