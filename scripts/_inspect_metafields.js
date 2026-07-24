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
  // Get first 5 products and ALL their metafields
  const result = await gql(`{
    products(first: 5) {
      edges { node {
        id title handle productType vendor tags
        metafields(first: 50) {
          edges { node { namespace key value type } }
        }
      }}
    }
  }`);

  for (const e of result.data.products.edges) {
    const p = e.node;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${p.title} | type: ${p.productType} | vendor: ${p.vendor}`);
    console.log(`tags: ${p.tags.join(', ')}`);
    console.log('--- metafields ---');
    for (const m of p.metafields.edges) {
      const mf = m.node;
      const val = mf.value.length > 80 ? mf.value.substring(0, 80) + '...' : mf.value;
      console.log(`  ${mf.namespace}.${mf.key} (${mf.type}) = ${val}`);
    }
  }
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
