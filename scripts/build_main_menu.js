/**
 * build_main_menu.js
 * Builds the main-menu with 3-level nesting for mega menu:
 *   Shop → By Category → [Fabric, Wallpaper, ...]
 *          By End Use  → [Upholstery, Drapery, ...]
 *          By Brand    → [Arte, Fabricut, ...]
 *
 * Also creates the 3 separate menus for fallback.
 */

require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL = `https://${STORE}/admin/api/${API_V}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}

// ─── Desired menu structure ───
const MAIN_MENU_ITEMS = [
  {
    title: 'Shop',
    url: '/collections',
    type: 'HTTP',
    items: [
      {
        title: 'By Category',
        url: '/collections',
        type: 'HTTP',
        items: [
          { title: 'Fabric',    url: '/collections/fabric',    type: 'HTTP' },
          { title: 'Wallpaper', url: '/collections/wallpaper', type: 'HTTP' },
          { title: 'Furniture', url: '/collections/furniture', type: 'HTTP' },
          { title: 'Lighting',  url: '/collections/lighting',  type: 'HTTP' },
          { title: 'Trim',      url: '/collections/trim',      type: 'HTTP' },
          { title: 'Rugs',      url: '/collections/rugs',      type: 'HTTP' },
        ]
      },
      {
        title: 'By End Use',
        url: '/collections',
        type: 'HTTP',
        items: [
          { title: 'Upholstery',    url: '/collections/upholstery',    type: 'HTTP' },
          { title: 'Drapery',       url: '/collections/drapery',       type: 'HTTP' },
          { title: 'Multi-purpose', url: '/collections/multi-purpose', type: 'HTTP' },
          { title: 'Performance',   url: '/collections/performance',   type: 'HTTP' },
        ]
      },
      {
        title: 'By Brand',
        url: '/collections',
        type: 'HTTP',
        items: [
          { title: 'Arte',         url: '/collections/arte',         type: 'HTTP' },
          { title: 'Fabricut',     url: '/collections/fabricut',     type: 'HTTP' },
          { title: 'Porta Romana', url: '/collections/porta-romana', type: 'HTTP' },
          { title: 'Verellen',     url: '/collections/verellen',     type: 'HTTP' },
          { title: 'ZR',           url: '/collections/zr',           type: 'HTTP' },
        ]
      }
    ]
  },
  { title: 'About',         url: '/pages/about',         type: 'HTTP' },
  { title: 'Trade Program', url: '/pages/trade-program', type: 'HTTP' },
  { title: 'Contact',       url: '/pages/contact',       type: 'HTTP' },
];

function buildItemInputs(items) {
  return items.map(item => {
    const input = {
      title: item.title,
      url: `https://${STORE}${item.url}`,
      type: item.type,
    };
    if (item.items && item.items.length > 0) {
      input.items = buildItemInputs(item.items);
    }
    return input;
  });
}

// Separate menus for fallback
const SEPARATE_MENUS = [
  {
    handle: 'shop-by-category',
    title: 'Shop - By Category',
    items: [
      { title: 'Fabric',    url: '/collections/fabric',    type: 'HTTP' },
      { title: 'Wallpaper', url: '/collections/wallpaper', type: 'HTTP' },
      { title: 'Furniture', url: '/collections/furniture', type: 'HTTP' },
      { title: 'Lighting',  url: '/collections/lighting',  type: 'HTTP' },
      { title: 'Trim',      url: '/collections/trim',      type: 'HTTP' },
      { title: 'Rugs',      url: '/collections/rugs',      type: 'HTTP' },
    ]
  },
  {
    handle: 'shop-by-end-use',
    title: 'Shop - By End Use',
    items: [
      { title: 'Upholstery',    url: '/collections/upholstery',    type: 'HTTP' },
      { title: 'Drapery',       url: '/collections/drapery',       type: 'HTTP' },
      { title: 'Multi-purpose', url: '/collections/multi-purpose', type: 'HTTP' },
      { title: 'Performance',   url: '/collections/performance',   type: 'HTTP' },
    ]
  },
  {
    handle: 'shop-by-brand',
    title: 'Shop - By Brand',
    items: [
      { title: 'Arte',         url: '/collections/arte',         type: 'HTTP' },
      { title: 'Fabricut',     url: '/collections/fabricut',     type: 'HTTP' },
      { title: 'Porta Romana', url: '/collections/porta-romana', type: 'HTTP' },
      { title: 'Verellen',     url: '/collections/verellen',     type: 'HTTP' },
      { title: 'ZR',           url: '/collections/zr',           type: 'HTTP' },
    ]
  },
];

async function run() {
  console.log('── Building navigation menus ──\n');

  // 1. List existing menus
  const listQ = `{ menus(first: 50) { edges { node { id handle title } } } }`;
  const listRes = await gql(listQ);
  
  if (listRes.errors) {
    console.log('GraphQL errors:', JSON.stringify(listRes.errors, null, 2));
    console.log('\n⚠ Cannot access menus API. Re-authorize first:');
    console.log('  Open http://localhost:3300/auth in browser');
    return;
  }

  const existing = listRes.data?.menus?.edges?.map(e => e.node) || [];
  console.log(`Found ${existing.length} menus:`);
  for (const m of existing) console.log(`  - ${m.handle} (${m.title})`);

  // 2. Update or create main-menu
  console.log('\n── main-menu ──');
  const mainMenu = existing.find(m => m.handle === 'main-menu');
  const items = buildItemInputs(MAIN_MENU_ITEMS);

  if (mainMenu) {
    console.log('Updating existing main-menu...');
    const mut = `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }`;
    const res = await gql(mut, { id: mainMenu.id, title: 'Main Menu', items });
    if (res.data?.menuUpdate?.userErrors?.length) {
      console.log('  Errors:', JSON.stringify(res.data.menuUpdate.userErrors));
    } else {
      console.log('  ✓ Updated main-menu');
    }
  } else {
    console.log('Creating main-menu...');
    const mut = `mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }`;
    const res = await gql(mut, { title: 'Main Menu', handle: 'main-menu', items });
    if (res.data?.menuCreate?.userErrors?.length) {
      console.log('  Errors:', JSON.stringify(res.data.menuCreate.userErrors));
    } else {
      console.log('  ✓ Created main-menu');
    }
  }

  // 3. Create separate menus
  for (const def of SEPARATE_MENUS) {
    console.log(`\n── ${def.handle} ──`);
    const ex = existing.find(m => m.handle === def.handle);
    const sepItems = def.items.map(i => ({
      title: i.title,
      url: `https://${STORE}${i.url}`,
      type: i.type
    }));

    if (ex) {
      const mut = `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, items: $items) {
          menu { id handle }
          userErrors { field message }
        }
      }`;
      const res = await gql(mut, { id: ex.id, title: def.title, items: sepItems });
      if (res.data?.menuUpdate?.userErrors?.length) {
        console.log('  Errors:', JSON.stringify(res.data.menuUpdate.userErrors));
      } else {
        console.log(`  ✓ Updated ${def.handle}`);
      }
    } else {
      const mut = `mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) {
          menu { id handle }
          userErrors { field message }
        }
      }`;
      const res = await gql(mut, { title: def.title, handle: def.handle, items: sepItems });
      if (res.data?.menuCreate?.userErrors?.length) {
        console.log('  Errors:', JSON.stringify(res.data.menuCreate.userErrors));
      } else {
        console.log(`  ✓ Created ${def.handle}`);
      }
    }
  }

  // 4. Verify
  console.log('\n── Verification ──');
  const verifyQ = `{ menus(first: 50) { edges { node { handle title items { title type items { title type items { title } } } } } } }`;
  const verifyRes = await gql(verifyQ);
  const menus = verifyRes.data?.menus?.edges?.map(e => e.node) || [];
  const mm = menus.find(m => m.handle === 'main-menu');
  if (mm) {
    console.log('main-menu:');
    for (const item of (mm.items || [])) {
      const ch = (item.items || []).length;
      console.log(`  ${item.title}${ch > 0 ? ' →' : ''}`);
      for (const c of (item.items || [])) {
        const gc = (c.items || []).length;
        console.log(`    ${c.title}${gc > 0 ? ' → ' + gc + ' items' : ''}`);
      }
    }
  }

  console.log('\n✅ Done');
}

run().catch(console.error);
