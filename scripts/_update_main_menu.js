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
  // Get main menu
  const { menus } = await gql(`{
    menus(first: 20) {
      nodes { id handle title items { id title url type resourceId } }
    }
  }`);
  const mainMenu = menus.nodes.find(m => m.handle === 'main-menu');
  const footerMenu = menus.nodes.find(m => m.handle === 'footer');

  console.log('Current main-menu:');
  mainMenu.items.forEach(i => console.log('  ' + i.title));

  // Get page GIDs for the new pages
  const pages = await gql(`{
    moodboards: pages(first:1, query:"handle:moodboards") { nodes { id title } }
    sustainability: pages(first:1, query:"handle:sustainability") { nodes { id title } }
    spotlight: pages(first:1, query:"handle:designer-spotlight") { nodes { id title } }
  }`);

  const moodboards = pages.moodboards.nodes[0];
  const sustainability = pages.sustainability.nodes[0];
  const spotlight = pages.spotlight.nodes[0];

  // Build existing items
  const existing = mainMenu.items.map(item => {
    const e = { title: item.title, type: item.type };
    if (item.resourceId) e.resourceId = item.resourceId;
    else e.url = item.url;
    return e;
  });

  // Check which are missing
  const titles = existing.map(e => e.title);
  const toAdd = [];
  if (!titles.includes('Moodboards') && moodboards) toAdd.push({ title: 'Moodboards', resourceId: moodboards.id, type: 'PAGE' });
  if (!titles.includes('Sustainability') && sustainability) toAdd.push({ title: 'Sustainability', resourceId: sustainability.id, type: 'PAGE' });
  if (!titles.includes('Designer Spotlight') && spotlight) toAdd.push({ title: 'Designer Spotlight', resourceId: spotlight.id, type: 'PAGE' });

  if (toAdd.length === 0) {
    console.log('\nAll pages already in main menu.');
    return;
  }

  const newItems = [...existing, ...toAdd];
  console.log('\nAdding:', toAdd.map(i => i.title).join(', '));

  const result = await gql(`
    mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { id items { title url } }
        userErrors { field message }
      }
    }
  `, { id: mainMenu.id, title: mainMenu.title, items: newItems });

  if (result.menuUpdate.userErrors.length) {
    console.error('Errors:', JSON.stringify(result.menuUpdate.userErrors, null, 2));
  } else {
    console.log('\nMain menu updated:');
    result.menuUpdate.menu.items.forEach(i => console.log('  ' + i.title + ' -> ' + i.url));
  }
}

main().catch(e => console.error(e));
