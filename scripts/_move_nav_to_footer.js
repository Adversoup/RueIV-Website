/**
 * Move About, Trade Program, Events, Contact from main menu to footer.
 */
require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL   = `https://${STORE}/admin/api/${API_V}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await r.json();
  if (json.errors) throw new Error('GQL: ' + JSON.stringify(json.errors, null, 2));
  return json.data;
}

const u = (path) => `https://${STORE}${path}`;

const UPDATE_MENU = `
  mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, items: $items) {
      menu { id title items { title url items { title url } } }
      userErrors { field message }
    }
  }`;

async function main() {
  // Fetch current menus
  const data = await gql(`{ menus(first: 50) { nodes { id handle title items { title url type resourceId items { title url type resourceId } } } } }`);
  const menus = data.menus.nodes;
  const mainMenu = menus.find(m => m.handle === 'main-menu');
  const footer   = menus.find(m => m.handle === 'footer');

  if (!mainMenu || !footer) throw new Error('Missing main-menu or footer');

  // Items to move
  const moveSet = new Set(['About', 'Trade Program', 'Events', 'Contact']);

  // Build new main menu (without the 4 items)
  const newMainItems = mainMenu.items
    .filter(it => !moveSet.has(it.title))
    .map(it => {
      const o = { title: it.title, url: it.url, type: it.type };
      if (it.resourceId) { o.resourceId = it.resourceId; delete o.url; }
      if (it.items && it.items.length) {
        o.items = it.items.map(c => {
          const ci = { title: c.title, url: c.url, type: c.type };
          if (c.resourceId) { ci.resourceId = c.resourceId; delete ci.url; }
          return ci;
        });
      }
      return o;
    });

  // Items to add to footer (with children like Sustainability under About)
  const movedItems = mainMenu.items
    .filter(it => moveSet.has(it.title))
    .map(it => {
      const o = { title: it.title, url: it.url, type: it.type };
      if (it.resourceId) { o.resourceId = it.resourceId; delete o.url; }
      if (it.items && it.items.length) {
        o.items = it.items.map(c => {
          const ci = { title: c.title, url: c.url, type: c.type };
          if (c.resourceId) { ci.resourceId = c.resourceId; delete ci.url; }
          return ci;
        });
      }
      return o;
    });

  // Build new footer (existing + moved items)
  const existingFooterTitles = new Set(footer.items.map(i => i.title));
  const newFooterItems = footer.items.map(it => {
    const o = { title: it.title, url: it.url, type: it.type };
    if (it.resourceId) { o.resourceId = it.resourceId; delete o.url; }
    return o;
  });
  for (const mi of movedItems) {
    if (!existingFooterTitles.has(mi.title)) {
      newFooterItems.push(mi);
    }
  }

  // Update main menu
  console.log('Updating main menu...');
  const mainRes = await gql(UPDATE_MENU, { id: mainMenu.id, title: mainMenu.title, items: newMainItems });
  if (mainRes.menuUpdate.userErrors.length) {
    console.error('Main menu errors:', mainRes.menuUpdate.userErrors);
    return;
  }
  console.log('Main menu:');
  for (const it of mainRes.menuUpdate.menu.items) {
    const children = (it.items || []).map(c => c.title).join(', ');
    console.log(`  ${it.title}${children ? ' → ' + children : ''}`);
  }

  // Update footer
  console.log('\nUpdating footer...');
  const footRes = await gql(UPDATE_MENU, { id: footer.id, title: footer.title, items: newFooterItems });
  if (footRes.menuUpdate.userErrors.length) {
    console.error('Footer errors:', footRes.menuUpdate.userErrors);
    return;
  }
  console.log('Footer:');
  for (const it of footRes.menuUpdate.menu.items) {
    const children = (it.items || []).map(c => c.title).join(', ');
    console.log(`  ${it.title}${children ? ' → ' + children : ''}`);
  }

  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
