#!/usr/bin/env node
/**
 * Check wallpaper product images on Shopify vs CSV source URLs.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL     = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

async function main() {
  // Get all wallpaper products
  const { data } = await gql(`{
    products(first: 50, query: "product_type:Wallpaper") {
      edges { node {
        id title handle
        featuredImage { url width height }
        media(first: 5) { edges { node { ... on MediaImage { image { url width height } } } } }
      } }
    }
  }`);

  const products = data?.products?.edges || [];
  console.log(`Found ${products.length} wallpaper products\n`);

  let noImage = 0;
  let hasImage = 0;
  for (const { node: p } of products) {
    const img = p.featuredImage;
    const mediaCount = p.media?.edges?.length || 0;
    if (img) {
      hasImage++;
      console.log(`  OK  ${p.handle} — ${img.width}×${img.height} (${mediaCount} media)`);
    } else {
      noImage++;
      console.log(`  !!  ${p.handle} — NO FEATURED IMAGE (${mediaCount} media)`);
    }
  }

  console.log(`\n${hasImage} with images, ${noImage} without images`);
}

main().catch(e => console.error(e));
