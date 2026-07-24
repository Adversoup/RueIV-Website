#!/usr/bin/env node
/**
 * Create lighting type sub-collections
 */
'use strict';
require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TYPES = [
  { title: 'Ceiling Lights', handle: 'ceiling-light',     tag: 'Ceiling Light' },
  { title: 'Pendants',       handle: 'pendant',           tag: 'Pendant' },
  { title: 'Flush Mounts',   handle: 'flush-mount',       tag: 'Flush Mount' },
  { title: 'Wall Lights',    handle: 'wall-light',        tag: 'Wall Light' },
  { title: 'Table Lamps',    handle: 'table-lamp',        tag: 'Table Lamp' },
  { title: 'Floor Lamps',    handle: 'floor-lamp',        tag: 'Floor Lamp' },
  { title: 'Outdoor Lighting', handle: 'outdoor-lighting', tag: 'Outdoor' },
];

async function gql(q) {
  const r = await fetch(`https://${STORE}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query: q }),
  });
  return r.json();
}

async function main() {
  console.log('\n── Creating lighting type collections ──\n');

  // First check what subcategory tags lighting products actually have
  const { data } = await gql(`{
    products(first: 20, query: "product_type:Lighting") {
      edges { node { title handle tags } }
    }
  }`);
  
  console.log('Sample lighting product tags:');
  for (const e of data.products.edges.slice(0, 5)) {
    console.log(`  ${e.node.handle.padEnd(40)} tags: ${e.node.tags.join(', ')}`);
  }
  console.log('');

  // Create smart collections
  for (const t of TYPES) {
    // Check if exists
    const { data: chk } = await gql(`{ collectionByHandle(handle: "${t.handle}") { id title } }`);
    if (chk?.collectionByHandle) {
      console.log(`  ${t.handle}: already exists`);
      continue;
    }

    // Create - use product_type + tag rules
    const resp = await fetch(`https://${STORE}/admin/api/2024-10/smart_collections.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({
        smart_collection: {
          title: t.title,
          handle: t.handle,
          rules: [
            { column: 'type', relation: 'equals', condition: 'Lighting' },
            { column: 'tag', relation: 'equals', condition: t.tag },
          ],
          disjunctive: false,
          published: true,
          sort_order: 'best-selling',
        }
      }),
    });

    if (resp.ok) {
      const json = await resp.json();
      console.log(`  ${t.handle}: created (${json.smart_collection?.id})`);
    } else {
      const text = await resp.text();
      console.error(`  ${t.handle}: FAILED ${resp.status} ${text.substring(0, 150)}`);
    }
    await sleep(400);
  }

  console.log('\nDone!\n');
}

main().catch(err => { console.error(err); process.exit(1); });
