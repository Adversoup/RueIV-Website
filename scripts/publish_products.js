#!/usr/bin/env node
/**
 * publish_products.js — Publishes all products to the Online Store sales channel.
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
  // 1. Find the Online Store publication
  console.log('Finding publications...');
  const pubResult = await gql(`{ publications(first: 10) { edges { node { id name } } } }`);
  console.log('API response:', JSON.stringify(pubResult, null, 2));
  
  if (!pubResult.data || !pubResult.data.publications) {
    console.error('Cannot access publications. The app may need additional scopes.');
    console.error('Add "read_publications,write_publications" to your app scopes.');
    process.exit(1);
  }
  
  const pubs = pubResult.data.publications.edges;
  console.log('Available publications:');
  pubs.forEach(p => console.log(`  - ${p.node.name} (${p.node.id})`));

  const onlineStore = pubs.find(p => p.node.name === 'Online Store');
  if (!onlineStore) {
    console.error('Could not find "Online Store" publication!');
    process.exit(1);
  }
  const pubId = onlineStore.node.id;
  console.log(`\nUsing publication: ${onlineStore.node.name} (${pubId})\n`);

  // 2. Check first product's current publication status
  const checkResult = await gql(`{
    products(first: 1) {
      edges {
        node {
          id title status
          resourcePublicationsV2(first: 5) {
            edges { node { publication { name } isPublished } }
          }
        }
      }
    }
  }`);
  const sampleProduct = checkResult.data.products.edges[0]?.node;
  if (sampleProduct) {
    console.log(`Sample product: "${sampleProduct.title}" (status: ${sampleProduct.status})`);
    const rpubs = sampleProduct.resourcePublicationsV2.edges;
    if (rpubs.length === 0) {
      console.log('  Not published to any channel.\n');
    } else {
      rpubs.forEach(rp => console.log(`  - ${rp.node.publication.name}: ${rp.node.isPublished}`));
    }
  }

  // 3. Get all product IDs
  console.log('Fetching all product IDs...');
  let allProductIds = [];
  let hasNext = true;
  let cursor = null;

  while (hasNext) {
    const afterArg = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 250${afterArg}) {
        edges { node { id } cursor }
        pageInfo { hasNextPage }
      }
    }`);
    const edges = result.data.products.edges;
    allProductIds.push(...edges.map(e => e.node.id));
    hasNext = result.data.products.pageInfo.hasNextPage;
    if (edges.length > 0) cursor = edges[edges.length - 1].cursor;
  }

  console.log(`Found ${allProductIds.length} products to publish.\n`);

  // 4. Publish each product to Online Store
  let published = 0;
  let failed = 0;

  for (let i = 0; i < allProductIds.length; i++) {
    const productId = allProductIds[i];
    const result = await gql(`
      mutation publishProduct($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          publishable { ... on Product { id title } }
          userErrors { field message }
        }
      }
    `, {
      id: productId,
      input: [{ publicationId: pubId }],
    });

    const errors = result?.data?.publishablePublish?.userErrors || [];
    const title = result?.data?.publishablePublish?.publishable?.title || productId;

    if (errors.length > 0) {
      console.error(`  [${i+1}/${allProductIds.length}] FAILED: ${title} — ${errors[0].message}`);
      failed++;
    } else {
      console.log(`  [${i+1}/${allProductIds.length}] Published: ${title}`);
      published++;
    }

    // Small delay to avoid rate limits
    if (i % 10 === 9) await sleep(300);
  }

  console.log(`\nDone! Published: ${published}, Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
