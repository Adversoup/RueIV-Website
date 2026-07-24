#!/usr/bin/env node
'use strict';
require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const GQL   = `https://${STORE}/admin/api/2024-10/graphql.json`;

async function gql(query) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

async function main() {
  // List all menus
  const { data } = await gql(`{
    menus(first: 20) {
      edges {
        node {
          id
          title
          handle
          items {
            title
            type
            url
            items {
              title
              type
              url
              items {
                title
                type
                url
              }
            }
          }
        }
      }
    }
  }`);

  for (const { node: menu } of (data?.menus?.edges || [])) {
    console.log(`\nMenu: "${menu.title}" (${menu.handle}) — ID: ${menu.id}`);
    for (const item of menu.items) {
      console.log(`  ${item.title} [${item.type}] → ${item.url || '(none)'}`);
      for (const sub of (item.items || [])) {
        console.log(`    ${sub.title} [${sub.type}] → ${sub.url || '(none)'}`);
        for (const sub2 of (sub.items || [])) {
          console.log(`      ${sub2.title} [${sub2.type}] → ${sub2.url || '(none)'}`);
        }
      }
    }
  }

  // Also check theme's mega-menu section
  console.log('\n=== THEME MEGA MENU FILES ===');
}

main().catch(console.error);
