#!/usr/bin/env node
/**
 * Fix the main-menu to have the correct 7 items
 */
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;

async function gql(query) {
  const res = await fetch(`https://${store}/admin/api/${ver}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const json = await res.json();
  if (json.errors) console.error('GQL errors:', JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function main() {
  // Get main-menu ID
  const menuData = await gql(`{
    menus(first: 50) {
      edges { node { id handle } }
    }
  }`);
  
  const mainMenu = menuData.menus.edges.find(e => e.node.handle === 'main-menu');
  if (!mainMenu) {
    console.error('main-menu not found!');
    return;
  }
  
  const menuId = mainMenu.node.id;
  console.log('Main menu ID:', menuId);
  
  const s = store;
  const mutation = `mutation {
    menuUpdate(
      id: "${menuId}",
      title: "Main Menu",
      items: [
        { title: "Textiles", type: HTTP, url: "https://${s}/collections/fabric" },
        { title: "Wallcovering", type: HTTP, url: "https://${s}/collections/wallpaper" },
        { title: "Furniture", type: HTTP, url: "https://${s}/collections/furniture" },
        { title: "Lighting", type: HTTP, url: "https://${s}/collections/lighting" },
        { title: "Rugs", type: HTTP, url: "https://${s}/collections/rugs" },
        { title: "Accessories", type: HTTP, url: "https://${s}/collections/accessories" },
        { title: "The Vibe Studio", type: HTTP, url: "https://${s}/pages/vibe-studio",
          items: [
            { title: "Designer Spotlight", type: HTTP, url: "https://${s}/pages/designer-spotlight" },
            { title: "Portfolio", type: HTTP, url: "https://${s}/pages/portfolio" },
            { title: "Moodboards", type: HTTP, url: "https://${s}/pages/moodboards" }
          ]
        }
      ]
    ) {
      menu {
        id
        handle
        items { title url }
      }
      userErrors { message field }
    }
  }`;
  
  const result = await gql(mutation);
  if (result && result.menuUpdate) {
    const ue = result.menuUpdate.userErrors || [];
    if (ue.length === 0) {
      console.log('✓ main-menu updated successfully:');
      result.menuUpdate.menu.items.forEach(i => console.log(`  - ${i.title} → ${i.url}`));
    } else {
      console.log('✗ Error:', ue.map(e => e.message).join(', '));
    }
  }
}

main().catch(console.error);
