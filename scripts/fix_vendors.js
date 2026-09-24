#!/usr/bin/env node
/**
 * fix_vendors.js — data-driven vendor navigation sync.
 *
 * 1. Normalize known legacy vendor aliases.
 * 2. Discover the CURRENT vendor universe from Shopify product.vendor.
 * 3. Ensure one smart collection per discovered vendor.
 * 4. Rebuild only the Designers submenu from that discovered vendor set.
 *
 * Vendor membership is never hardcoded. New Hub-synced brands appear on the
 * next run as soon as their Shopify products carry the canonical vendor value.
 */
'use strict';

require('dotenv').config();

const { buildVendorSpecs } = require('./lib/vendor_navigation');

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL = `https://${STORE}/admin/api/${VER}/graphql.json`;
const REST = `https://${STORE}/admin/api/${VER}`;
const DRY_RUN = process.argv.includes('--dry-run');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireCredentials() {
  if (!STORE || !TOKEN) {
    throw new Error('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_ACCESS_TOKEN');
  }
}

async function gql(query, variables = {}) {
  requireCredentials();
  const response = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function restPost(path, body) {
  requireCredentials();
  const response = await fetch(`${REST}${path}`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`REST ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// Alias correction is intentionally separate from vendor discovery.
// This maps legacy spelling to canonical display spelling; it does NOT define
// which vendors are allowed to exist.
const VENDOR_FIXES = {
  arte: 'Arte',
  'porta-romana': 'Porta Romana',
  verellen: 'Verellen',
  alexander_lamont: 'Alexander Lamont',
  'cc-milano': 'CC Milano',
  'chase-erwin': 'Chase Erwin',
  altura: 'Altura',
};

async function fixVendorNames() {
  console.log('\n━━━ STEP 1: Normalize known legacy vendor aliases ━━━');

  for (const [wrong, correct] of Object.entries(VENDOR_FIXES)) {
    let cursor = null;
    const ids = [];

    for (let page = 0; page < 250; page++) {
      const query = `
        query ProductsByVendor($after: String) {
          products(first: 250, after: $after, query: ${JSON.stringify(`vendor:"${wrong}"`)}) {
            edges { cursor node { id vendor } }
            pageInfo { hasNextPage }
          }
        }
      `;
      const data = await gql(query, { after: cursor });
      const edges = data.products.edges || [];
      for (const edge of edges) {
        if (edge.node.vendor === wrong) ids.push(edge.node.id);
      }
      if (!data.products.pageInfo.hasNextPage || edges.length === 0) break;
      cursor = edges[edges.length - 1].cursor;
    }

    if (!ids.length) {
      console.log(`  · "${wrong}" — no products to normalize`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  · DRY RUN "${wrong}" → "${correct}" (${ids.length} products)`);
      continue;
    }

    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      await Promise.all(
        batch.map((id) =>
          gql(
            `mutation UpdateVendor($input: ProductInput!) {
              productUpdate(input: $input) {
                product { id vendor }
                userErrors { field message }
              }
            }`,
            { input: { id, vendor: correct } }
          )
        )
      );
      await sleep(350);
    }
    console.log(`  ✓ "${wrong}" → "${correct}" (${ids.length})`);
  }
}

async function fetchVendorNames() {
  const vendors = [];
  let cursor = null;

  for (let page = 0; page < 250; page++) {
    const data = await gql(
      `query VendorCensus($after: String) {
        products(first: 250, after: $after) {
          edges { cursor node { vendor } }
          pageInfo { hasNextPage }
        }
      }`,
      { after: cursor }
    );

    const edges = data.products.edges || [];
    for (const edge of edges) {
      if (edge.node.vendor && edge.node.vendor.trim()) vendors.push(edge.node.vendor);
    }
    if (!data.products.pageInfo.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1].cursor;
  }

  return vendors;
}

async function fetchCollectionIndex() {
  const byHandle = new Map();
  const byTitle = new Map();
  let cursor = null;

  for (let page = 0; page < 20; page++) {
    const data = await gql(
      `query CollectionIndex($after: String) {
        collections(first: 250, after: $after) {
          edges { cursor node { id handle title } }
          pageInfo { hasNextPage }
        }
      }`,
      { after: cursor }
    );

    const edges = data.collections.edges || [];
    for (const edge of edges) {
      const node = edge.node;
      byHandle.set(node.handle, node);
      byTitle.set(String(node.title || '').trim().toLowerCase(), node);
    }
    if (!data.collections.pageInfo.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1].cursor;
  }

  return { byHandle, byTitle };
}

function collectionForVendor(spec, index) {
  return (
    index.byTitle.get(spec.title.toLowerCase()) ||
    index.byHandle.get(spec.handle) ||
    null
  );
}

async function ensureVendorCollections(vendorSpecs) {
  console.log('\n━━━ STEP 2: Ensure vendor smart collections ━━━');
  let index = await fetchCollectionIndex();

  for (const spec of vendorSpecs) {
    if (collectionForVendor(spec, index)) {
      console.log(`  · ${spec.title} — collection exists`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  · DRY RUN create ${spec.title} [vendor = "${spec.vendor}"]`);
      continue;
    }

    const result = await restPost('/smart_collections.json', {
      smart_collection: {
        title: spec.title,
        rules: [{ column: 'vendor', relation: 'equals', condition: spec.vendor }],
        published: true,
        sort_order: 'best-selling',
      },
    });

    if (!result.smart_collection) {
      throw new Error(`Failed creating vendor collection for ${spec.title}: ${JSON.stringify(result)}`);
    }
    console.log(`  ✓ Created ${spec.title} → ${result.smart_collection.handle}`);
    await sleep(350);
  }

  if (!DRY_RUN) index = await fetchCollectionIndex();
  return index;
}

function cloneItem(item) {
  const cloned = { title: item.title, type: item.type };
  if (item.resourceId) cloned.resourceId = item.resourceId;
  else if (item.url) cloned.url = item.url;
  if (item.items?.length) cloned.items = item.items.map(cloneItem);
  return cloned;
}

function collectionMenuItem(title, collection) {
  if (collection?.id) {
    return { title, type: 'COLLECTION', resourceId: collection.id };
  }
  return {
    title,
    type: 'HTTP',
    url: `https://${STORE}/collections/${collection?.handle || ''}`,
  };
}

async function updateDesignersMenu(vendorSpecs, collectionIndex) {
  console.log('\n━━━ STEP 3: Rebuild Designers submenu from discovered vendors ━━━');

  const { menus } = await gql(`{
    menus(first: 50) {
      nodes {
        id handle title
        items {
          title type url resourceId
          items {
            title type url resourceId
            items { title type url resourceId }
          }
        }
      }
    }
  }`);

  const mainMenu = menus.nodes.find((menu) => menu.handle === 'main-menu');
  if (!mainMenu) throw new Error('main-menu not found');

  const currentDesigners = mainMenu.items.find((item) => item.title === 'Designers');
  if (!currentDesigners) throw new Error('Designers item not found on main-menu');

  const allDesignersCollection =
    collectionIndex.byHandle.get('designers') ||
    collectionIndex.byTitle.get('designers');

  const children = [
    allDesignersCollection
      ? collectionMenuItem('All Designers', allDesignersCollection)
      : { title: 'All Designers', type: 'HTTP', url: `https://${STORE}/pages/brands` },
    ...vendorSpecs.map((spec) => {
      const collection = collectionForVendor(spec, collectionIndex);
      return collection
        ? collectionMenuItem(spec.title, collection)
        : {
            title: spec.title,
            type: 'HTTP',
            url: `https://${STORE}/collections/${spec.handle}`,
          };
    }),
  ];

  console.log(`  Discovered vendor count: ${vendorSpecs.length}`);
  children.forEach((item) => console.log(`    ├─ ${item.title}`));

  if (DRY_RUN) {
    console.log('  · DRY RUN — menuUpdate not executed');
    return;
  }

  const newItems = mainMenu.items.map((item) => {
    if (item.title !== 'Designers') return cloneItem(item);
    const designers = cloneItem(item);
    designers.items = children;
    return designers;
  });

  const result = await gql(
    `mutation UpdateMainMenu($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu {
          id
          items { title type items { title type resourceId url } }
        }
        userErrors { field message }
      }
    }`,
    { id: mainMenu.id, title: mainMenu.title, items: newItems }
  );

  const errors = result.menuUpdate?.userErrors || [];
  if (errors.length) throw new Error(`menuUpdate failed: ${JSON.stringify(errors)}`);

  const designers = result.menuUpdate.menu.items.find((item) => item.title === 'Designers');
  console.log(`  ✓ Designers menu updated with ${(designers?.items || []).length - 1} vendors`);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ Dynamic Vendor Navigation — Collections + Designers  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('DRY RUN — no Shopify mutation\n');

  await fixVendorNames();

  const vendorNames = await fetchVendorNames();
  const vendorSpecs = buildVendorSpecs(vendorNames);
  console.log(`\nVendor census: ${vendorNames.length} product rows → ${vendorSpecs.length} unique vendors`);

  const collectionIndex = await ensureVendorCollections(vendorSpecs);
  await updateDesignersMenu(vendorSpecs, collectionIndex);

  console.log('\n✅ Dynamic vendor navigation sync complete');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal:', error.message || error);
    process.exit(1);
  });
}

module.exports = {
  fetchVendorNames,
  fetchCollectionIndex,
  ensureVendorCollections,
  updateDesignersMenu,
  collectionForVendor,
};
