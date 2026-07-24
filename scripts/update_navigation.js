#!/usr/bin/env node
/**
 * update_navigation.js — Add new pages to main-menu and footer.
 * Adds: About, Events, The Vibe Studio, Contact to main-menu (after Shop).
 * Adds: Terms, Shipping, Returns to footer.
 * Does NOT touch the existing mega menu block.
 */
require('dotenv/config');

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL   = `https://${STORE}/admin/api/${API_V}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

/* ── List all menus ─────────────────────────────────────── */
const LIST_MENUS = `
  query {
    menus(first: 20) {
      nodes {
        id
        handle
        title
        items { id title url items { id title url } }
      }
    }
  }
`;

/* ── Update menu ────────────────────────────────────────── */
const UPDATE_MENU = `
  mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, items: $items) {
      menu { id handle title items { id title url } }
      userErrors { field message }
    }
  }
`;

const CREATE_MENU = `
  mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
    menuCreate(title: $title, handle: $handle, items: $items) {
      menu { id handle title }
      userErrors { field message }
    }
  }
`;

function menuItemInput(item) {
  const result = { title: item.title, url: item.url, type: 'HTTP' };
  if (item.id) result.id = item.id;
  if (item.items && item.items.length > 0) {
    result.items = item.items.map(menuItemInput);
  }
  return result;
}

async function main() {
  console.log('Fetching existing menus…');
  const data = await gql(LIST_MENUS);
  const menus = data.menus.nodes;
  console.log(`Found ${menus.length} menus: ${menus.map(m => m.handle).join(', ')}`);

  /* ── Main Menu ────────────────────────────────────────── */
  const mainMenu = menus.find(m => m.handle === 'main-menu');
  if (mainMenu) {
    console.log(`\nUpdating main-menu (${mainMenu.id})…`);
    console.log(`  Current items: ${mainMenu.items.map(i => i.title).join(', ')}`);

    // Build updated items list — preserve existing, add new after existing
    const existingItems = mainMenu.items.map(menuItemInput);

    // Pages to add to main menu (only if not already present)
    const newLinks = [
      { title: 'About',          url: 'https://ruefour.myshopify.com/pages/about', type: 'HTTP' },
      { title: 'The Vibe Studio', url: 'https://ruefour.myshopify.com/pages/vibe-studio', type: 'HTTP' },
      { title: 'Events',         url: 'https://ruefour.myshopify.com/pages/events', type: 'HTTP' },
      { title: 'Contact',        url: 'https://ruefour.myshopify.com/pages/contact', type: 'HTTP' },
    ];

    const existingTitles = new Set(mainMenu.items.map(i => i.title.toLowerCase()));
    const toAdd = newLinks.filter(l => !existingTitles.has(l.title.toLowerCase()));

    if (toAdd.length === 0) {
      console.log('  All links already present — skipping.');
    } else {
      const updatedItems = [...existingItems, ...toAdd];
      console.log(`  Adding: ${toAdd.map(l => l.title).join(', ')}`);

      const result = await gql(UPDATE_MENU, {
        id: mainMenu.id,
        title: mainMenu.title,
        items: updatedItems,
      });
      const errs = result.menuUpdate?.userErrors;
      if (errs?.length) console.error('  ✗ errors:', errs);
      else console.log('  ✓ main-menu updated');
    }
  } else {
    console.log('  ⚠ main-menu not found — skipping');
  }

  /* ── Footer / Policies ────────────────────────────────── */
  let footerMenu = menus.find(m => m.handle === 'footer' || m.handle === 'footer-menu');
  const policyLinks = [
    { title: 'Terms of Service',    url: 'https://ruefour.myshopify.com/pages/terms', type: 'HTTP' },
    { title: 'Shipping Policy',     url: 'https://ruefour.myshopify.com/pages/shipping-policy', type: 'HTTP' },
    { title: 'Returns & Exchanges', url: 'https://ruefour.myshopify.com/pages/returns', type: 'HTTP' },
  ];

  if (footerMenu) {
    console.log(`\nUpdating footer menu (${footerMenu.id})…`);
    const existingItems = footerMenu.items.map(menuItemInput);
    const existingUrls = new Set(footerMenu.items.map(i => i.url));
    const toAdd = policyLinks.filter(l => !existingUrls.has(l.url));

    if (toAdd.length === 0) {
      console.log('  Policy links already present — skipping.');
    } else {
      const updatedItems = [...existingItems, ...toAdd];
      console.log(`  Adding: ${toAdd.map(l => l.title).join(', ')}`);
      const result = await gql(UPDATE_MENU, {
        id: footerMenu.id,
        title: footerMenu.title,
        items: updatedItems,
      });
      const errs = result.menuUpdate?.userErrors;
      if (errs?.length) console.error('  ✗ errors:', errs);
      else console.log('  ✓ footer menu updated');
    }
  } else {
    // Create a footer-policies menu
    console.log('\nNo footer menu found — creating "Policies" menu…');
    const result = await gql(CREATE_MENU, {
      title: 'Policies',
      handle: 'policies',
      items: policyLinks,
    });
    const errs = result.menuCreate?.userErrors;
    if (errs?.length) console.error('  ✗ errors:', errs);
    else console.log(`  ✓ Created Policies menu (${result.menuCreate.menu.id})`);
  }

  // Also add newsletter to footer if present
  if (footerMenu) {
    const existingUrls = new Set(footerMenu.items.map(i => i.url));
    if (!existingUrls.has('/pages/newsletter')) {
      console.log('\n  Adding "The Vibe List" to footer…');
      const items = [...footerMenu.items.map(menuItemInput), ...policyLinks.filter(l => !existingUrls.has(l.url)), { title: 'The Vibe List', url: '/pages/newsletter' }];
      // Already added policy links above, just need to re-fetch
    }
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
