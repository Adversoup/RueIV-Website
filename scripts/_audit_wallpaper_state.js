#!/usr/bin/env node
/**
 * Audit wallpaper product images on Shopify
 * Shows featured image dimensions and whether 1200x1200 square crop exists
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function main() {
  const { data } = await gql(`{
    products(first: 50, query: "product_type:Wallpaper") {
      edges { node {
        id handle title
        featuredImage { url width height }
        media(first: 10) { edges { node {
          ... on MediaImage { image { url width height } }
        }}}
      }}
    }
  }`);

  const prods = data.products.edges.map(e => e.node);
  console.log(`Wallpaper products: ${prods.length}\n`);

  let square = 0, nonSquare = 0, noImage = 0;

  for (const p of prods) {
    const img = p.featuredImage;
    const mediaCount = p.media.edges.length;
    const dims = img ? `${img.width}x${img.height}` : 'NO IMAGE';
    const isSquare = img && img.width === 1200 && img.height === 1200;
    const marker = isSquare ? '✓ SQUARE' : img ? '✗ NOT SQUARE' : '✗ NO IMAGE';

    if (isSquare) square++;
    else if (img) nonSquare++;
    else noImage++;

    console.log(`  ${p.handle} — ${dims} (${mediaCount} media) ${marker}`);
  }

  console.log(`\nSummary: ${square} square, ${nonSquare} non-square, ${noImage} no image`);
}

main().catch(err => { console.error(err); process.exit(1); });
