#!/usr/bin/env node
require('dotenv').config();
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const S = process.env.SHOPIFY_STORE;

async function gql(query) {
  const res = await fetch(`https://${S}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
    body: JSON.stringify({ query })
  });
  return (await res.json()).data;
}

async function run() {
  let cursor = null;
  const vendors = {};
  for (let page = 0; page < 10; page++) {
    const after = cursor ? `, after:"${cursor}"` : '';
    const data = await gql(`{ products(first:50, query:"vendor:fabricut"${after}) { edges { cursor node { id title vendor } } pageInfo { hasNextPage } } }`);
    for (const e of data.products.edges) {
      const v = e.node.vendor;
      if (!vendors[v]) vendors[v] = [];
      vendors[v].push({ id: e.node.id, title: e.node.title });
      cursor = e.cursor;
    }
    if (!data.products.pageInfo.hasNextPage) break;
  }
  for (const [v, prods] of Object.entries(vendors)) {
    console.log(`${v} (${prods.length}):`, prods.slice(0, 3).map(p => p.title).join(', '));
  }

  // Fix: normalize all "Fabricut" (mixed case) to "FABRICUT"
  const toFix = [];
  for (const [v, prods] of Object.entries(vendors)) {
    if (v !== 'FABRICUT') {
      toFix.push(...prods);
    }
  }
  if (toFix.length > 0) {
    console.log(`\nFixing ${toFix.length} products with vendor "${toFix[0] && vendors}" -> "FABRICUT"...`);
    for (const p of toFix) {
      const mutation = `mutation { productUpdate(input: { id: "${p.id}", vendor: "FABRICUT" }) { product { id vendor } userErrors { field message } } }`;
      const result = await gql(mutation);
      const err = result.productUpdate.userErrors;
      if (err.length > 0) {
        console.error(`  ERROR ${p.title}:`, err);
      } else {
        console.log(`  Fixed: ${p.title} -> FABRICUT`);
      }
    }
  } else {
    console.log('\nAll Fabricut products already have consistent vendor name.');
  }
}

run();
