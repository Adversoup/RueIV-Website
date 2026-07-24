#!/usr/bin/env node
/**
 * scripts/_fix_designers_trending.js
 * ────────────────────────────────────
 * 1. Creates "New Arrivals" and "Trending Now" smart collections
 * 2. Updates the designers-trending menu items to point to them
 */
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL     = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
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

async function createSmartCollection(title, handle, rules) {
  // Check if already exists
  const { data: existing } = await gql(`{
    collectionByHandle(handle: "${handle}") { id title }
  }`);
  if (existing?.collectionByHandle) {
    console.log(`  "${title}" already exists: ${existing.collectionByHandle.id}`);
    return existing.collectionByHandle.id;
  }

  // Create via REST (smart collections with rules)
  const REST_URL = `https://${STORE}/admin/api/2024-10/smart_collections.json`;
  const resp = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({
      smart_collection: {
        title,
        handle,
        rules,
        disjunctive: false,
        published: true,
        sort_order: 'created-desc',
      }
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`  Failed to create "${title}": ${resp.status} ${text.substring(0, 200)}`);
    return null;
  }

  const json = await resp.json();
  const id = json.smart_collection?.id;
  console.log(`  Created "${title}": ${id}`);
  return `gid://shopify/Collection/${id}`;
}

async function main() {
  console.log('\n── Creating smart collections ──\n');

  // "New Arrivals" — products created in last 90 days
  const newArrivalsId = await createSmartCollection(
    'New Arrivals',
    'new-arrivals',
    [{ column: 'created_at', relation: 'less_than', condition: '90' }]
  );
  await sleep(500);

  // "Trending Now" — manual rule: tag "trending"
  const trendingId = await createSmartCollection(
    'Trending Now',
    'trending-now',
    [{ column: 'tag', relation: 'equals', condition: 'trending' }]
  );
  await sleep(500);

  // Now update the designers-trending menu to point to real collection URLs
  console.log('\n── Updating designers-trending menu ──\n');

  // Find the menu
  const { data } = await gql(`{
    menus(first: 100) {
      edges { node { id title handle items { id title url } } }
    }
  }`);
  const menu = data.menus.edges.map(e => e.node).find(m => m.handle === 'designers-trending');
  if (!menu) {
    console.error('  designers-trending menu not found!');
    return;
  }
  console.log(`  Found: ${menu.title} (${menu.id}) — ${menu.items.length} items`);

  // Delete existing items and recreate with proper URLs
  // Use menuUpdate mutation
  const menuUpdateMutation = `
    mutation menuUpdate($id: ID!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, items: $items) {
        menu { id title handle items { id title url } }
        userErrors { field message }
      }
    }
  `;

  // Actually, menuUpdate with items replaces them
  // Let's use menuItemUpdate for each item
  // First, let's just delete and recreate the menu

  // Delete the menu
  const delResult = await gql(`
    mutation menuDelete($id: ID!) {
      menuDelete(id: $id) {
        deletedMenuId
        userErrors { field message }
      }
    }
  `, { id: menu.id });
  console.log(`  Deleted old menu: ${delResult.data?.menuDelete?.deletedMenuId || 'failed'}`);
  await sleep(500);

  // Recreate with proper collection URLs
  const createResult = await gql(`
    mutation menuCreate($input: MenuCreateInput!) {
      menuCreate(input: $input) {
        menu { id title handle items { id title url } }
        userErrors { field message }
      }
    }
  `, {
    input: {
      title: 'Designers - New & Trending',
      handle: 'designers-trending',
      items: [
        {
          title: 'New Arrivals',
          type: 'COLLECTION',
          resourceId: newArrivalsId,
        },
        {
          title: 'Trending Now',
          type: 'COLLECTION',
          resourceId: trendingId,
        },
      ],
    },
  });

  const ue = createResult.data?.menuCreate?.userErrors || [];
  if (ue.length > 0) {
    console.error('  Errors:', ue);
  } else {
    const newMenu = createResult.data?.menuCreate?.menu;
    console.log(`  Created menu: ${newMenu?.id}`);
    for (const item of (newMenu?.items || [])) {
      console.log(`    ${item.title} → ${item.url}`);
    }
  }

  console.log('\nDone!\n');
}

main().catch(err => { console.error(err); process.exit(1); });
