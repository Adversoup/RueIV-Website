#!/usr/bin/env node
/**
 * Check menu collections' images via GraphQL menus query
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
  // Get all menus
  const { data } = await gql(`{
    menus(first: 100) {
      edges {
        node {
          id title handle
          items {
            title url
          }
        }
      }
    }
  }`);

  const menus = data.menus.edges.map(e => e.node);
  const targets = ['wallcovering-design', 'designers-trending', 'wallcovering-materials', 'designers-featured'];

  for (const handle of targets) {
    const menu = menus.find(m => m.handle === handle);
    if (!menu) {
      console.log(`Menu "${handle}" NOT FOUND\n`);
      continue;
    }

    console.log(`\n── ${menu.title} (${menu.handle}) — ${menu.items.length} items ──`);

    for (const item of menu.items) {
      const url = item.url || '';
      const colMatch = url.match(/\/collections\/([^/?]+)/);
      if (colMatch) {
        const colHandle = colMatch[1];
        const { data: colData } = await gql(`{
          collectionByHandle(handle: "${colHandle}") {
            id title handle
            image { url width height }
          }
        }`);
        const col = colData?.collectionByHandle;
        if (col) {
          const hasImg = col.image ? `✓ ${col.image.width}×${col.image.height}` : '✗ NO IMAGE';
          console.log(`   ${item.title.padEnd(30)} ${colHandle.padEnd(35)} ${hasImg}`);
        } else {
          console.log(`   ${item.title.padEnd(30)} ${colHandle.padEnd(35)} ✗ NOT FOUND`);
        }
      } else {
        console.log(`   ${item.title.padEnd(30)} ${url.substring(0, 60)} (not collection)`);
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
