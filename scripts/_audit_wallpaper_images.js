#!/usr/bin/env node
/**
 * scripts/_audit_wallpaper_images.js
 * ──────────────────────────────────
 * Fetches all wallpaper product images from Shopify and checks
 * which ones appear to be blur-expanded (non-square originals padded to square)
 * vs properly cropped.
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL     = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function main() {
  // Find wallpaper products (product_type or tag)
  const products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const { data } = await gql(`{
      products(first: 50, query: "product_type:Wallpaper OR tag:wallpaper"${after}) {
        edges {
          cursor
          node {
            id title handle productType
            media(first: 10) {
              edges {
                node {
                  ... on MediaImage {
                    id
                    alt
                    image {
                      url
                      width
                      height
                      altText
                    }
                  }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }`);
    if (!data?.products) break;
    for (const e of data.products.edges) {
      products.push(e.node);
      cursor = e.cursor;
    }
    hasNext = data.products.pageInfo.hasNextPage;
  }

  console.log(`Found ${products.length} wallpaper products\n`);

  for (const p of products) {
    console.log(`── ${p.handle} (${p.productType || 'no type'})`);
    const images = p.media.edges
      .map(e => e.node)
      .filter(n => n.image);
    
    if (images.length === 0) {
      console.log('   No images');
      continue;
    }

    for (const img of images) {
      const { width, height, url } = img.image;
      const ratio = width && height ? (width / height).toFixed(2) : '?';
      const isSquare = width === height;
      const altText = img.alt || img.image.altText || '';
      const isBlur = altText.toLowerCase().includes('square') || altText.toLowerCase().includes('normalized');
      
      console.log(`   ${width}×${height} ratio=${ratio} ${isSquare ? 'SQUARE' : 'non-square'} alt="${altText}" `);
      console.log(`   ${url.substring(0, 100)}...`);
    }
    console.log('');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
