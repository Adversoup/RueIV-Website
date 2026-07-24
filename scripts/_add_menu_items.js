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
  // 1. Get main menu
  const { menus } = await gql(`{
    menus(first: 20) {
      nodes { id handle title items { id title url type resourceId } }
    }
  }`);
  const mainMenu = menus.nodes.find(m => m.handle === 'main-menu');
  if (!mainMenu) { console.error('main-menu not found'); return; }

  console.log('Current main-menu:');
  mainMenu.items.forEach(i => console.log(`  ${i.title} -> ${i.url}`));

  // 2. Get page GIDs
  const pages = await gql(`{
    brands: pages(first:1, query:"handle:brands") { nodes { id title } }
    portfolio: pages(first:1, query:"handle:portfolio") { nodes { id title } }
  }`);
  const brandsPage = pages.brands.nodes[0];
  const portfolioPage = pages.portfolio.nodes[0];
  console.log('\nbrandsPage:', brandsPage?.id);
  console.log('portfolioPage:', portfolioPage?.id);

  // 3. Build updated items
  const existing = mainMenu.items.map(item => {
    const e = { title: item.title, type: item.type };
    if (item.resourceId) e.resourceId = item.resourceId;
    else e.url = item.url;
    return e;
  });

  // Check if already present
  const hasBrands = existing.some(e => e.title === 'Our Brands');
  const hasPortfolio = existing.some(e => e.title === 'Portfolio');

  if (hasBrands && hasPortfolio) {
    console.log('\nBoth items already in menu. Nothing to do.');
    return;
  }

  const newItems = [...existing];
  if (!hasBrands)    newItems.push({ title: 'Our Brands', resourceId: brandsPage.id, type: 'PAGE' });
  if (!hasPortfolio) newItems.push({ title: 'Portfolio', resourceId: portfolioPage.id, type: 'PAGE' });

  console.log('\nUpdated menu will be:');
  newItems.forEach(i => console.log(`  ${i.title}`));

  // 4. Update
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
    console.log('\nMain menu updated!');
    result.menuUpdate.menu.items.forEach(i => console.log(`  ${i.title} -> ${i.url}`));
  }
}

main().catch(e => console.error(e));
