#!/usr/bin/env node
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query) {
  const r = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query })
  });
  return r.json();
}

async function run() {
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50${after}) {
        edges { cursor node { handle title productType } }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of result.data.products.edges) {
      const p = e.node;
      console.log(`${p.productType.padEnd(12)} ${p.handle.padEnd(55)} ${p.title}`);
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
  }
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
