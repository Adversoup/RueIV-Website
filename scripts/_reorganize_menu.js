require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API   = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL   = `https://${STORE}/admin/api/${API}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function main() {
  // 1. Get current menu + all page GIDs we need
  const { menus } = await gql(`{
    menus(first: 20) {
      nodes { id handle title items { id title url type resourceId } }
    }
  }`);
  const mainMenu = menus.nodes.find(m => m.handle === 'main-menu');

  console.log('Current menu:');
  mainMenu.items.forEach(i => console.log('  ' + i.title + ' -> ' + i.url + ' [' + i.type + '] rid=' + i.resourceId));

  // Build a lookup of existing items by title
  const byTitle = {};
  mainMenu.items.forEach(i => { byTitle[i.title] = i; });

  // Helper: convert existing item to update input
  function itemInput(item) {
    const e = { title: item.title, type: item.type };
    if (item.resourceId) e.resourceId = item.resourceId;
    else e.url = item.url;
    return e;
  }

  // 2. Build the new menu structure:
  // Shop | About (-> Sustainability) | Trade Program | The Vibe Studio (-> Designer Spotlight, Portfolio, Moodboards) | Events | Our Brands | Contact
  const newItems = [
    // Shop
    itemInput(byTitle['Shop']),

    // About with Sustainability nested
    {
      ...itemInput(byTitle['About']),
      items: [
        itemInput(byTitle['Sustainability'])
      ]
    },

    // Trade Program
    itemInput(byTitle['Trade Program']),

    // The Vibe Studio with children
    {
      ...itemInput(byTitle['The Vibe Studio']),
      items: [
        itemInput(byTitle['Designer Spotlight']),
        itemInput(byTitle['Portfolio']),
        itemInput(byTitle['Moodboards'])
      ]
    },

    // Events
    itemInput(byTitle['Events']),

    // Our Brands
    itemInput(byTitle['Our Brands']),

    // Contact at end
    itemInput(byTitle['Contact'])
  ];

  console.log('\nNew structure:');
  newItems.forEach(i => {
    console.log('  ' + i.title);
    if (i.items) i.items.forEach(c => console.log('    └─ ' + c.title));
  });

  // 3. Update
  const result = await gql(`
    mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu {
          id
          items {
            title
            url
            items {
              title
              url
            }
          }
        }
        userErrors { field message }
      }
    }
  `, { id: mainMenu.id, title: mainMenu.title, items: newItems });

  if (result.menuUpdate.userErrors.length) {
    console.error('\nErrors:', JSON.stringify(result.menuUpdate.userErrors, null, 2));
  } else {
    console.log('\nMenu updated successfully:');
    result.menuUpdate.menu.items.forEach(i => {
      console.log('  ' + i.title + ' -> ' + i.url);
      if (i.items && i.items.length) {
        i.items.forEach(c => console.log('    └─ ' + c.title + ' -> ' + c.url));
      }
    });
  }
}

main().catch(e => console.error(e));
