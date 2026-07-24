#!/usr/bin/env node
/**
 * Creates room collections with tag-based smart rules.
 * One-time use.
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep   = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const r = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const ROOMS = [
  { handle: 'living-room', title: 'Living Room',  tag: 'room:living-room' },
  { handle: 'bedroom',     title: 'Bedroom',      tag: 'room:bedroom' },
  { handle: 'dining-room', title: 'Dining Room',  tag: 'room:dining-room' },
  { handle: 'office',      title: 'Office',        tag: 'room:office' },
  { handle: 'outdoor',     title: 'Outdoor',       tag: 'room:outdoor' },
  { handle: 'hospitality', title: 'Hospitality',   tag: 'room:hospitality' },
];

async function main() {
  console.log('Creating room collections...\n');

  for (const room of ROOMS) {
    // Check if exists
    const check = await gql(`{ collectionByHandle(handle: "${room.handle}") { id title } }`);
    if (check.data?.collectionByHandle) {
      console.log(`  SKIP: ${room.handle} already exists`);
      continue;
    }

    const result = await gql(`
      mutation collectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection { id handle title }
          userErrors { field message }
        }
      }
    `, {
      input: {
        title: room.title,
        handle: room.handle,
        descriptionHtml: `<p>Shop ${room.title} — curated furniture, lighting & rugs.</p>`,
        ruleSet: {
          appliedDisjunctively: false,
          rules: [{ column: 'TAG', relation: 'EQUALS', condition: room.tag }],
        },
        sortOrder: 'BEST_SELLING',
      },
    });

    const c = result.data?.collectionCreate;
    if (c?.collection) {
      console.log(`  ✓ ${c.collection.handle} → ${c.collection.id}`);
    } else {
      console.log(`  ✗ ${room.handle}:`, JSON.stringify(c?.userErrors || result.errors));
    }
    await sleep(500);
  }

  console.log('\nDone.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
