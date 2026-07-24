#!/usr/bin/env node
/**
 * scripts/set_collection_images.js
 * ────────────────────────────────
 * Sets the collection image for every collection that doesn't have one,
 * using the featured image of the first product in that collection.
 *
 * Usage:
 *   node scripts/set_collection_images.js              # apply
 *   node scripts/set_collection_images.js --dry-run    # preview only
 *   node scripts/set_collection_images.js --force      # overwrite existing images too
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep   = ms => new Promise(r => setTimeout(r, ms));

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
  }
  return json;
}

// ─── Fetch all collections with their image and first product ───────────────
async function fetchAllCollections() {
  const collections = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      collections(first: 50${afterClause}) {
        edges {
          cursor
          node {
            id
            title
            handle
            image { url }
            products(first: 1, sortKey: BEST_SELLING) {
              edges {
                node {
                  featuredImage { url }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }`;

    const { data } = await gql(query);
    if (!data?.collections) break;

    for (const edge of data.collections.edges) {
      collections.push(edge.node);
      cursor = edge.cursor;
    }
    hasNext = data.collections.pageInfo.hasNextPage;
  }

  return collections;
}

// ─── Update collection image via REST (GraphQL collectionUpdate doesn't support image from URL easily) ──
async function setCollectionImage(collectionGid, imageUrl) {
  // collectionUpdate mutation with image.src
  const mutation = `mutation collectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id title image { url } }
      userErrors { field message }
    }
  }`;

  const variables = {
    input: {
      id: collectionGid,
      image: { src: imageUrl },
    },
  };

  return gql(mutation, variables);
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🖼  Collection Image Setter`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${FORCE ? ' (force overwrite)' : ''}\n`);

  const collections = await fetchAllCollections();
  console.log(`   Found ${collections.length} collections\n`);

  let updated = 0;
  let skipped = 0;
  let noImage = 0;

  for (const col of collections) {
    const hasImage = !!col.image?.url;
    const firstProductImage = col.products?.edges?.[0]?.node?.featuredImage?.url;

    if (hasImage && !FORCE) {
      console.log(`   ✓ ${col.title} — already has image, skipping`);
      skipped++;
      continue;
    }

    if (!firstProductImage) {
      console.log(`   ✗ ${col.title} — no products with images`);
      noImage++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`   → ${col.title} — would set image from first product`);
      updated++;
      continue;
    }

    const result = await setCollectionImage(col.id, firstProductImage);
    const errors = result.data?.collectionUpdate?.userErrors;
    if (errors?.length) {
      console.log(`   ✗ ${col.title} — ERROR: ${errors.map(e => e.message).join(', ')}`);
    } else {
      console.log(`   ✓ ${col.title} — image set`);
      updated++;
    }

    await sleep(300); // rate limit
  }

  console.log(`\n   Done: ${updated} updated, ${skipped} skipped, ${noImage} no image available\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
