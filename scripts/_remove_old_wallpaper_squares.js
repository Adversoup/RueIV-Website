#!/usr/bin/env node
/**
 * scripts/_remove_old_wallpaper_squares.js
 * ──────────────────────────────────────────
 * Finds all wallpaper products and deletes the old blur-expanded
 * square images (alt = "{Title} – square"), keeping only the 
 * vision-cropped versions (alt = "{handle} square crop").
 *
 * Usage:
 *   node scripts/_remove_old_wallpaper_squares.js --dry-run   # preview
 *   node scripts/_remove_old_wallpaper_squares.js              # delete
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL     = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const DRY_RUN = process.argv.includes('--dry-run');
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
  console.log(`\n🗑  Remove old blur-expanded wallpaper square images`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  // Fetch all wallpaper products with their media
  const products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const { data } = await gql(`{
      products(first: 50, query: "product_type:Wallpaper"${after}) {
        edges {
          cursor
          node {
            id title handle
            media(first: 20) {
              edges {
                node {
                  ... on MediaImage {
                    id
                    alt
                    image { url width height }
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

  console.log(`   Found ${products.length} wallpaper products\n`);

  let deleted = 0, skipped = 0, errors = 0;

  for (const p of products) {
    const images = p.media.edges.map(e => e.node).filter(n => n.image);
    
    // Find old blur-expanded square images: alt ends with " – square"
    const oldSquares = images.filter(img => {
      const alt = (img.alt || '').trim();
      return alt.endsWith('– square') && img.image.width === 1200 && img.image.height === 1200;
    });

    // Find new vision-cropped squares: alt ends with "square crop"
    const newSquares = images.filter(img => {
      const alt = (img.alt || '').trim();
      return alt.endsWith('square crop') && img.image.width === 1200 && img.image.height === 1200;
    });

    if (oldSquares.length === 0) {
      continue; // Nothing to remove
    }

    // Safety: only delete old if we have a new crop to keep
    if (newSquares.length === 0) {
      console.log(`⚠  ${p.handle}: has old square but NO vision crop — skipping`);
      skipped++;
      continue;
    }

    console.log(`── ${p.handle}`);
    console.log(`   Keep:   "${newSquares[0].alt}" (${newSquares[0].id})`);
    
    for (const old of oldSquares) {
      console.log(`   Delete: "${old.alt}" (${old.id})`);

      if (DRY_RUN) {
        deleted++;
        continue;
      }

      // Delete the media using productDeleteMedia mutation
      const { data: delData } = await gql(`
        mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
          productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
            deletedMediaIds
            userErrors { field message }
          }
        }
      `, { productId: p.id, mediaIds: [old.id] });

      const ue = delData?.productDeleteMedia?.userErrors || [];
      if (ue.length > 0) {
        console.error(`   ✗ Error: ${ue.map(e => e.message).join(', ')}`);
        errors++;
      } else {
        console.log(`   ✓ Deleted`);
        deleted++;
      }
      await sleep(350);
    }
  }

  console.log(`\n   Done: ${deleted} deleted, ${skipped} skipped, ${errors} errors\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
