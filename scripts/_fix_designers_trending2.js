#!/usr/bin/env node
/**
 * scripts/_fix_designers_trending2.js
 * Fix: create new-arrivals collection + recreate designers-trending menu
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL     = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep   = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) console.error('GQL errors:', JSON.stringify(json.errors, null, 2));
  return json;
}

async function main() {
  // 1. Create "New Arrivals" smart collection using tag rule
  console.log('\n── Creating New Arrivals collection ──');
  const { data: checkNew } = await gql(`{ collectionByHandle(handle: "new-arrivals") { id } }`);
  let newArrivalsGid = checkNew?.collectionByHandle?.id;
  
  if (!newArrivalsGid) {
    const resp = await fetch(`https://${STORE}/admin/api/2024-10/smart_collections.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({
        smart_collection: {
          title: 'New Arrivals',
          handle: 'new-arrivals',
          rules: [{ column: 'tag', relation: 'equals', condition: 'new-arrival' }],
          disjunctive: false,
          published: true,
          sort_order: 'created-desc',
        }
      }),
    });
    const json = await resp.json();
    if (json.smart_collection) {
      newArrivalsGid = `gid://shopify/Collection/${json.smart_collection.id}`;
      console.log(`  Created: ${newArrivalsGid}`);
    } else {
      console.error('  Failed:', JSON.stringify(json.errors || json).substring(0, 200));
    }
  } else {
    console.log(`  Already exists: ${newArrivalsGid}`);
  }
  await sleep(500);

  // 2. Check trending-now collection
  const { data: checkTrend } = await gql(`{ collectionByHandle(handle: "trending-now") { id } }`);
  let trendingGid = checkTrend?.collectionByHandle?.id;
  console.log(`  Trending Now: ${trendingGid || 'not found'}`);

  // 3. Recreate designers-trending menu with proper collection URLs
  console.log('\n── Recreating designers-trending menu ──');

  // menuCreate uses positional args, not input
  const items = [];
  if (newArrivalsGid) {
    items.push({ title: 'New Arrivals', type: 'COLLECTION', resourceId: newArrivalsGid });
  }
  if (trendingGid) {
    items.push({ title: 'Trending Now', type: 'COLLECTION', resourceId: trendingGid });
  }

  const createResult = await gql(`
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu {
          id title handle
          items { id title url }
        }
        userErrors { field message }
      }
    }
  `, {
    title: 'Designers - New & Trending',
    handle: 'designers-trending',
    items,
  });

  const ue = createResult.data?.menuCreate?.userErrors || [];
  if (ue.length > 0) {
    console.error('  Errors:', ue);
  } else {
    const newMenu = createResult.data?.menuCreate?.menu;
    console.log(`  Menu: ${newMenu?.id} (${newMenu?.handle})`);
    for (const item of (newMenu?.items || [])) {
      console.log(`    ${item.title} → ${item.url}`);
    }
  }

  // 4. Set collection images using first product images
  console.log('\n── Setting collection images ──');
  for (const [gid, handle] of [[newArrivalsGid, 'new-arrivals'], [trendingGid, 'trending-now']]) {
    if (!gid) continue;
    
    // Get first product image from collection
    const { data: colData } = await gql(`{
      collection(id: "${gid}") {
        products(first: 1) {
          edges {
            node {
              featuredMedia {
                ... on MediaImage { image { url } }
              }
            }
          }
        }
      }
    }`);
    const productImgUrl = colData?.collection?.products?.edges?.[0]?.node?.featuredMedia?.image?.url;
    
    if (productImgUrl) {
      // Set collection image via collectionUpdate
      const numericId = gid.replace('gid://shopify/Collection/', '');
      const resp = await fetch(`https://${STORE}/admin/api/2024-10/smart_collections/${numericId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          smart_collection: {
            id: parseInt(numericId),
            image: { src: productImgUrl }
          }
        }),
      });
      if (resp.ok) {
        console.log(`  ${handle}: set image from first product`);
      } else {
        console.log(`  ${handle}: failed to set image (${resp.status})`);
      }
    } else {
      console.log(`  ${handle}: no products yet, no image to set`);
    }
    await sleep(300);
  }

  console.log('\nDone!\n');
}

main().catch(err => { console.error(err); process.exit(1); });
