#!/usr/bin/env node
/**
 * fix_footer_menu.js — Add policy pages + Vibe List to footer menu.
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

const UPDATE_MENU = `
  mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, items: $items) {
      menu { id title items { id title url type } }
      userErrors { field message }
    }
  }
`;

async function main() {
  const items = [
    // Preserve existing items
    { id: 'gid://shopify/MenuItem/599115890819', title: 'Search', type: 'SEARCH', url: '/search' },
    { id: 'gid://shopify/MenuItem/599115989123', title: 'Your Privacy Choices', type: 'PAGE', resourceId: 'gid://shopify/Page/114120687747' },
    // New policy pages
    { title: 'Terms of Service',    type: 'PAGE', resourceId: 'gid://shopify/Page/114680496259' },
    { title: 'Shipping Policy',     type: 'PAGE', resourceId: 'gid://shopify/Page/114680529027' },
    { title: 'Returns & Exchanges', type: 'PAGE', resourceId: 'gid://shopify/Page/114680561795' },
    { title: 'The Vibe List',       type: 'PAGE', resourceId: 'gid://shopify/Page/114680463491' },
  ];

  console.log('Updating footer menu…');
  const result = await gql(UPDATE_MENU, {
    id: 'gid://shopify/Menu/251733737603',
    title: 'Footer menu',
    items,
  });

  if (result.menuUpdate.userErrors.length) {
    console.error('Errors:', result.menuUpdate.userErrors);
  } else {
    console.log('Footer menu updated:');
    result.menuUpdate.menu.items.forEach(i => console.log(`  ${i.title} → ${i.url}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
