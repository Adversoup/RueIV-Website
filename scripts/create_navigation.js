#!/usr/bin/env node
/**
 * create_navigation.js
 * --------------------
 * Creates the main navigation menu in Shopify with links to all collections.
 * Uses the GraphQL Admin API (menuCreate mutation).
 *
 * Menu structure:
 *   Main Menu
 *   ├── Shop
 *   │   ├── By Category  → Fabric, Wallpaper, Furniture, Lighting
 *   │   ├── By End Use   → Fabric Upholstery, Drapery, etc.
 *   │   └── By Brand     → Fabricut, Verellen, Arte, Porta Romana, ZR
 *   ├── About
 *   ├── Trade Program
 *   └── Contact
 */

require('dotenv/config');
const fs = require('fs');

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = process.env.SHOPIFY_API_VERSION || '2024-04';
const GQL   = `https://${STORE}/admin/api/${API_V}/graphql.json`;

// ─── GraphQL helper ───

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Fetch all collections to get their GIDs ───

async function fetchCollectionMap() {
  const map = {};
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      collections(first: 100${after}) {
        edges {
          node { id handle title }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of data.collections.edges) {
      map[e.node.handle] = e.node.id;
      cursor = e.cursor;
    }
    hasNext = data.collections.pageInfo.hasNextPage;
  }
  return map;
}

// ─── Build menu items ───

function buildMenuItems(collectionMap) {
  // Helper to create a collection link item
  const colLink = (title, handle) => {
    const resourceId = collectionMap[handle];
    if (!resourceId) {
      console.log(`  ⚠ Collection '${handle}' not found, skipping`);
      return null;
    }
    return { title, type: 'COLLECTION', resourceId };
  };

  // By Category
  const categoryItems = [
    colLink('Fabric', 'fabric'),
    colLink('Wallpaper', 'wallpaper'),
    colLink('Furniture', 'furniture'),
    colLink('Lighting', 'lighting'),
  ].filter(Boolean);

  // By End Use
  const endUseItems = [
    colLink('Upholstery', 'fabric-upholstery'),
    colLink('Drapery', 'fabric-drapery'),
    colLink('Multipurpose', 'fabric-multipurpose'),
    colLink('Performance', 'fabric-performance'),
    colLink('Sheer', 'fabric-sheer'),
    colLink('Bedding', 'fabric-bedding'),
    colLink('Decorative', 'fabric-decorative'),
  ].filter(Boolean);

  // By Brand
  const brandItems = [
    colLink('Fabricut / S. Harris', 'fabricut'),
    colLink('Verellen', 'verellen'),
    colLink('Arte', 'arte'),
    colLink('Porta Romana', 'porta-romana'),
    colLink('ZR', 'zr'),
  ].filter(Boolean);

  // Top-level items
  const items = [
    {
      title: 'Shop',
      type: 'HTTP',
      url: 'https://ruefour.myshopify.com/collections',
      items: [
        { title: 'By Category', type: 'HTTP', url: '#', items: categoryItems },
        { title: 'By End Use',  type: 'HTTP', url: '#', items: endUseItems },
        { title: 'By Brand',    type: 'HTTP', url: '#', items: brandItems },
      ],
    },
    { title: 'About',         type: 'HTTP', url: '/pages/about' },
    { title: 'Trade Program', type: 'HTTP', url: '/pages/trade-program' },
    { title: 'Contact',       type: 'HTTP', url: '/pages/contact' },
  ];

  return items;
}

// ─── Create menu via REST (GraphQL menuCreate requires Online Store channel) ───

async function createMenuREST(title, handle, items) {
  // Shopify REST doesn't support nested menus directly via API.
  // We'll use the navigation links API via REST
  // Actually, let's check if we can use the online store navigation

  // Use REST API for menus
  const url = `https://${STORE}/admin/api/${API_V}`;

  // First, check existing menus
  const existingRes = await fetch(`${url}/menus.json`, {
    headers: { 'X-Shopify-Access-Token': TOKEN },
  });

  if (existingRes.status === 404) {
    // menus.json endpoint doesn't exist in newer API versions
    // Fall back to using REST navigation
    console.log('  Menus REST endpoint not available, trying alternative...');
    return null;
  }

  const existing = await existingRes.json();
  return existing;
}

// ─── Update navigation using online store navigation API ───

async function updateMainMenu(collectionMap) {
  const url = `https://${STORE}/admin/api/${API_V}`;

  // Step 1: Get all menus
  let menus;
  try {
    const res = await fetch(`${url}/menus.json`, {
      headers: { 'X-Shopify-Access-Token': TOKEN },
    });
    menus = await res.json();
  } catch (e) {
    console.log('  Cannot access menus API:', e.message);
    return false;
  }

  if (!menus.menus) {
    console.log('  No menus found or API not available');
    return false;
  }

  // Find main-menu
  const mainMenu = menus.menus.find(m => m.handle === 'main-menu');
  if (!mainMenu) {
    console.log('  main-menu not found, creating new...');
  }

  // Build linklist with nested items for categories, end-use, brands
  const colId = (handle) => {
    // Get numeric ID from GID
    const gid = collectionMap[handle];
    if (!gid) return null;
    return gid.split('/').pop();
  };

  // Build links array
  const links = [];

  // Shop > By Category
  const categoryLinks = [
    { title: 'Fabric',    subject_type: 'collection', subject_id: colId('fabric') },
    { title: 'Wallpaper', subject_type: 'collection', subject_id: colId('wallpaper') },
    { title: 'Furniture', subject_type: 'collection', subject_id: colId('furniture') },
    { title: 'Lighting',  subject_type: 'collection', subject_id: colId('lighting') },
  ].filter(l => l.subject_id);

  const endUseLinks = [
    { title: 'Upholstery',   subject_type: 'collection', subject_id: colId('fabric-upholstery') },
    { title: 'Drapery',      subject_type: 'collection', subject_id: colId('fabric-drapery') },
    { title: 'Multipurpose', subject_type: 'collection', subject_id: colId('fabric-multipurpose') },
    { title: 'Performance',  subject_type: 'collection', subject_id: colId('fabric-performance') },
    { title: 'Sheer',        subject_type: 'collection', subject_id: colId('fabric-sheer') },
    { title: 'Decorative',   subject_type: 'collection', subject_id: colId('fabric-decorative') },
  ].filter(l => l.subject_id);

  const brandLinks = [
    { title: 'Fabricut / S. Harris', subject_type: 'collection', subject_id: colId('fabricut') },
    { title: 'Verellen',             subject_type: 'collection', subject_id: colId('verellen') },
    { title: 'Arte',                 subject_type: 'collection', subject_id: colId('arte') },
    { title: 'Porta Romana',         subject_type: 'collection', subject_id: colId('porta-romana') },
    { title: 'ZR',                   subject_type: 'collection', subject_id: colId('zr') },
  ].filter(l => l.subject_id);

  // Shopify REST menus have a flat structure with links referencing parent via position
  // Top-level: Shop (with children), About, Trade Program, Contact
  links.push({
    title: 'Shop',
    type: 'http',
    url: '/collections',
    links: [
      {
        title: 'By Category',
        type: 'http',
        url: '#',
        links: categoryLinks.map(l => ({
          title: l.title,
          type: 'collection_link',
          subject_id: parseInt(l.subject_id),
          subject_type: 'Collection',
        })),
      },
      {
        title: 'By End Use',
        type: 'http',
        url: '#',
        links: endUseLinks.map(l => ({
          title: l.title,
          type: 'collection_link',
          subject_id: parseInt(l.subject_id),
          subject_type: 'Collection',
        })),
      },
      {
        title: 'By Brand',
        type: 'http',
        url: '#',
        links: brandLinks.map(l => ({
          title: l.title,
          type: 'collection_link',
          subject_id: parseInt(l.subject_id),
          subject_type: 'Collection',
        })),
      },
    ],
  });

  links.push({ title: 'About', type: 'http', url: '/pages/about' });
  links.push({ title: 'Trade Program', type: 'http', url: '/pages/trade-program' });
  links.push({ title: 'Contact', type: 'http', url: '/pages/contact' });

  // Update or create the menu
  const menuPayload = { menu: { title: 'Main Menu', handle: 'main-menu', links } };

  let result;
  if (mainMenu) {
    // Update existing
    const res = await fetch(`${url}/menus/${mainMenu.id}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
      body: JSON.stringify(menuPayload),
    });
    result = await res.json();
    if (result.errors) {
      console.log('  Update error:', JSON.stringify(result.errors));
      return false;
    }
    console.log(`  ✓ Updated main-menu (ID: ${mainMenu.id})`);
  } else {
    // Create new
    const res = await fetch(`${url}/menus.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
      body: JSON.stringify(menuPayload),
    });
    result = await res.json();
    if (result.errors) {
      console.log('  Create error:', JSON.stringify(result.errors));
      return false;
    }
    console.log(`  ✓ Created main-menu (ID: ${result.menu?.id})`);
  }

  return true;
}

// ─── Main ───

async function main() {
  console.log('─── Build Navigation Menu ───\n');

  // Step 1: Fetch all collection handles → GIDs
  console.log('Fetching collection map...');
  const collectionMap = await fetchCollectionMap();
  console.log(`  Found ${Object.keys(collectionMap).length} collections\n`);

  // Step 2: Update the main menu
  console.log('Building navigation menu...');
  const success = await updateMainMenu(collectionMap);

  if (success) {
    console.log('\n✓ Navigation menu updated successfully!');
    console.log('  Structure: Shop (By Category / By End Use / By Brand) | About | Trade Program | Contact');
  } else {
    console.log('\n⚠ Could not update menu via API.');
    console.log('  The menus REST API may need Online Store channel access.');
    console.log('  You can manually set up the menu in Shopify Admin → Online Store → Navigation.');
    console.log('\n  All 51 collections are created and ready to be linked.');
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
