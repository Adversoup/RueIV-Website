#!/usr/bin/env node
/**
 * Rebuild the lighting-type menu with updated items
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const GQL     = `https://${STORE}/admin/api/2026-04/graphql.json`;
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
  // Find the lighting-type menu
  const { data } = await gql(`{
    menus(first: 100) {
      edges { node { id title handle items { id title url } } }
    }
  }`);
  const menu = data.menus.edges.map(e => e.node).find(m => m.handle === 'lighting-type');
  if (!menu) { console.error('lighting-type menu not found!'); return; }

  console.log(`Found: ${menu.title} (${menu.id})`);
  console.log('Current items:');
  for (const item of menu.items) console.log(`  ${item.title} → ${item.url}`);

  // Delete old menu
  const del = await gql(`mutation { menuDelete(id: "${menu.id}") { deletedMenuId userErrors { message } } }`);
  console.log(`\nDeleted: ${del.data?.menuDelete?.deletedMenuId}`);
  await sleep(500);

  // New items
  const items = [
    { title: 'All',            url: `https://${STORE}/collections/lighting` },
    { title: 'Ceiling Lights', url: `https://${STORE}/collections/ceiling-light` },
    { title: 'Pendants',       url: `https://${STORE}/collections/pendant` },
    { title: 'Flush Mounts',   url: `https://${STORE}/collections/flush-mount` },
    { title: 'Wall Lights',    url: `https://${STORE}/collections/wall-light` },
    { title: 'Table Lamps',    url: `https://${STORE}/collections/table-lamp` },
    { title: 'Floor Lamps',    url: `https://${STORE}/collections/floor-lamp` },
    { title: 'Outdoor',        url: `https://${STORE}/collections/outdoor-lighting` },
  ];

  const menuItems = items.map(i => ({ title: i.title, type: 'HTTP', url: i.url }));

  const createResult = await gql(`
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id title handle items { id title url } }
        userErrors { field message }
      }
    }
  `, {
    title: 'Lighting - Shop by Type',
    handle: 'lighting-type',
    items: menuItems,
  });

  const ue = createResult.data?.menuCreate?.userErrors || [];
  if (ue.length > 0) {
    console.error('Errors:', ue);
  } else {
    const m = createResult.data?.menuCreate?.menu;
    console.log(`\nCreated: ${m?.id} (${m?.handle})`);
    for (const item of (m?.items || [])) console.log(`  ${item.title} → ${item.url}`);
  }

  // Check if collections exist for the new types
  console.log('\n── Checking collections exist ──');
  const handles = ['ceiling-light', 'pendant', 'flush-mount', 'wall-light', 'table-lamp', 'floor-lamp', 'outdoor-lighting'];
  for (const h of handles) {
    const { data: cd } = await gql(`{ collectionByHandle(handle: "${h}") { id title } }`);
    const col = cd?.collectionByHandle;
    console.log(`  ${h.padEnd(20)} ${col ? '✓ ' + col.title : '✗ NOT FOUND'}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
