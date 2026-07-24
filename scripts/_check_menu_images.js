#!/usr/bin/env node
/**
 * Check what collections are in specific menus and whether they have images.
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

async function checkMenu(handle) {
  // Find menu by handle via REST
  const restUrl = `https://${STORE}/admin/api/2024-10/menus.json`;
  const res = await fetch(restUrl, {
    headers: { 'X-Shopify-Access-Token': TOKEN },
  });
  const data = await res.json();
  const menu = data.menus?.find(m => m.handle === handle);
  
  if (!menu) {
    console.log(`Menu "${handle}" not found\n`);
    return;
  }

  console.log(`\n── Menu: ${menu.title} (${menu.handle}) ──`);
  console.log(`   ${menu.items?.length || 0} items\n`);

  for (const item of (menu.items || [])) {
    const url = item.url || '';
    const colMatch = url.match(/\/collections\/([^/?]+)/);
    if (colMatch) {
      const colHandle = colMatch[1];
      // Check if collection has an image
      const { data: colData } = await gql(`{
        collectionByHandle(handle: "${colHandle}") {
          id title handle
          image { url width height }
        }
      }`);
      const col = colData?.collectionByHandle;
      if (col) {
        const hasImg = col.image ? `✓ ${col.image.width}×${col.image.height}` : '✗ NO IMAGE';
        console.log(`   ${item.title.padEnd(30)} → ${colHandle.padEnd(30)} ${hasImg}`);
      } else {
        console.log(`   ${item.title.padEnd(30)} → ${colHandle.padEnd(30)} ✗ COLLECTION NOT FOUND`);
      }
    } else {
      console.log(`   ${item.title.padEnd(30)} → ${url} (not a collection)`);
    }
  }
}

async function main() {
  await checkMenu('wallcovering-design');
  await checkMenu('designers-trending');
  
  // Also check wallcovering-materials and designers-featured for comparison
  await checkMenu('wallcovering-materials');
  await checkMenu('designers-featured');
}

main().catch(err => { console.error(err); process.exit(1); });
