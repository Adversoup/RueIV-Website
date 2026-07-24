#!/usr/bin/env node
/**
 * delete_all_products.js — Deletes all products from the store to allow clean re-import.
 * Usage: node scripts/delete_all_products.js
 */
'use strict';
require('dotenv').config();

const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const STORE   = process.env.SHOPIFY_STORE;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Fetching all product IDs...');
  let allIds = [];
  let hasNext = true;
  let cursor = null;

  while (hasNext) {
    const afterArg = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 250${afterArg}) {
        edges { node { id title } cursor }
        pageInfo { hasNextPage }
      }
    }`);
    const edges = result.data.products.edges;
    allIds.push(...edges.map(e => ({ id: e.node.id, title: e.node.title })));
    hasNext = result.data.products.pageInfo.hasNextPage;
    if (edges.length > 0) cursor = edges[edges.length - 1].cursor;
  }

  console.log(`Found ${allIds.length} products to delete.\n`);

  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < allIds.length; i++) {
    const { id, title } = allIds[i];
    const result = await gql(`
      mutation deleteProduct($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors { field message }
        }
      }
    `, { input: { id } });

    const errors = result?.data?.productDelete?.userErrors || [];
    if (errors.length > 0) {
      console.error(`  [${i+1}/${allIds.length}] FAILED: ${title} — ${errors[0].message}`);
      failed++;
    } else {
      console.log(`  [${i+1}/${allIds.length}] Deleted: ${title}`);
      deleted++;
    }

    if (i % 10 === 9) await sleep(300);
  }

  console.log(`\nDone! Deleted: ${deleted}, Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
