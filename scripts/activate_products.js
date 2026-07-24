#!/usr/bin/env node
/**
 * activate_products.js — Sets all DRAFT products to ACTIVE status.
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
  console.log('Fetching all DRAFT products...');
  let allProducts = [];
  let hasNext = true;
  let cursor = null;

  while (hasNext) {
    const afterArg = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 250, query: "status:draft"${afterArg}) {
        edges { node { id title status } cursor }
        pageInfo { hasNextPage }
      }
    }`);
    const edges = result.data.products.edges;
    allProducts.push(...edges.map(e => e.node));
    hasNext = result.data.products.pageInfo.hasNextPage;
    if (edges.length > 0) cursor = edges[edges.length - 1].cursor;
  }

  console.log(`Found ${allProducts.length} DRAFT products to activate.\n`);

  let activated = 0;
  let failed = 0;

  for (let i = 0; i < allProducts.length; i++) {
    const { id, title } = allProducts[i];
    const result = await gql(`
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title status }
          userErrors { field message }
        }
      }
    `, { input: { id, status: 'ACTIVE' } });

    const errors = result?.data?.productUpdate?.userErrors || [];
    if (errors.length > 0) {
      console.error(`  [${i+1}/${allProducts.length}] FAILED: ${title} — ${errors[0].message}`);
      failed++;
    } else {
      console.log(`  [${i+1}/${allProducts.length}] Activated: ${title}`);
      activated++;
    }

    if (i % 10 === 9) await sleep(300);
  }

  console.log(`\nDone! Activated: ${activated}, Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
