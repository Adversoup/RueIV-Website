#!/usr/bin/env node
/**
 * Fix lighting type collection rules to match actual tag format
 */
'use strict';
require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FIXES = [
  { handle: 'ceiling-light',     id: 444646621315, tag: 'subcategory:ceiling-light' },
  { handle: 'pendant',           id: 444646654083, tag: 'subcategory:pendant' },
  { handle: 'flush-mount',       id: 444646686851, tag: 'subcategory:flush-mount' },
  { handle: 'wall-light',        id: 444646719619, tag: 'subcategory:wall-light' },
  { handle: 'table-lamp',        id: 444646752387, tag: 'subcategory:table-lamp' },
  { handle: 'floor-lamp',        id: 444646785155, tag: 'subcategory:floor-lamp' },
  { handle: 'outdoor-lighting',  id: 444646817923, tag: 'subcategory:outdoor' },
];

async function main() {
  console.log('\n── Fixing lighting collection rules ──\n');

  for (const f of FIXES) {
    const resp = await fetch(`https://${STORE}/admin/api/2024-10/smart_collections/${f.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({
        smart_collection: {
          id: f.id,
          rules: [
            { column: 'type', relation: 'equals', condition: 'Lighting' },
            { column: 'tag', relation: 'equals', condition: f.tag },
          ],
        }
      }),
    });

    if (resp.ok) {
      const json = await resp.json();
      const count = json.smart_collection?.products_count;
      console.log(`  ${f.handle.padEnd(20)} ✓ rules updated (${count || 0} products)`);
    } else {
      console.error(`  ${f.handle.padEnd(20)} ✗ ${resp.status}`);
    }
    await sleep(300);
  }

  // Also check if there's a subcategory tag for pendant/ceiling/flush-mount
  console.log('\n── Checking tag coverage ──');
  const gql = async (q) => {
    const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query: q }),
    });
    return r.json();
  };

  const { data } = await gql(`{
    products(first: 50, query: "product_type:Lighting") {
      edges { node { handle tags } }
    }
  }`);

  const tagCounts = {};
  for (const e of data.products.edges) {
    for (const tag of e.node.tags) {
      if (tag.startsWith('subcategory:')) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }
  console.log('\nLighting subcategory tags (from first 50):');
  for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag.padEnd(30)} ${count} products`);
  }

  console.log('\nDone!\n');
}

main().catch(err => { console.error(err); process.exit(1); });
