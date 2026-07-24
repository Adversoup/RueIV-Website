/**
 * create_shop_menus_gql.js
 * Creates 3 navigation menus for the mega panel via GraphQL.
 */

require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VER = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL = `https://${STORE}/admin/api/${API_VER}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}

const MENUS = [
  {
    handle: 'shop-by-category',
    title: 'Shop - By Category',
    items: [
      { title: 'Fabric',     url: '/collections/fabric',     type: 'HTTP' },
      { title: 'Wallpaper',  url: '/collections/wallpaper',  type: 'HTTP' },
      { title: 'Trim',       url: '/collections/trim',       type: 'HTTP' },
      { title: 'Rugs',       url: '/collections/rugs',       type: 'HTTP' },
      { title: 'Lighting',   url: '/collections/lighting',   type: 'HTTP' },
      { title: 'Furniture',  url: '/collections/furniture',  type: 'HTTP' },
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
      { title: 'Arte',          url: '/collections/arte',          type: 'HTTP' },
      { title: 'Fabricut',      url: '/collections/fabricut',      type: 'HTTP' },
      { title: 'Porta Romana',  url: '/collections/porta-romana',  type: 'HTTP' },
      { title: 'Verellen',      url: '/collections/verellen',      type: 'HTTP' },
      { title: 'ZR',            url: '/collections/zr',            type: 'HTTP' },
    ]
  }
];

async function run() {
  // 1. Check existing menus
  console.log('Checking existing menus...');
  const listQ = `{
    menus(first: 50) {
      edges { node { id handle title } }
    }
  }`;
  const listRes = await gql(listQ);
  
  if (listRes.errors) {
    console.log('GraphQL errors:', JSON.stringify(listRes.errors, null, 2));
    return;
  }

  const existingMenus = listRes.data?.menus?.edges?.map(e => e.node) || [];
  console.log(`Found ${existingMenus.length} menus:`);
  for (const m of existingMenus) {
    console.log(`  - ${m.handle} (${m.title})`);
  }

  // 2. Create/update each menu
  for (const def of MENUS) {
    const existing = existingMenus.find(m => m.handle === def.handle);
    
    if (existing) {
      console.log(`\n✓ "${def.handle}" already exists. Updating...`);
      const updateMut = `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, items: $items) {
          menu { id handle title }
          userErrors { field message }
        }
      }`;
      const updateRes = await gql(updateMut, {
        id: existing.id,
        title: def.title,
        items: def.items.map(item => ({
          title: item.title,
          url: `https://${STORE}${item.url}`,
          type: item.type
        }))
      });
      
      if (updateRes.data?.menuUpdate?.userErrors?.length) {
        console.log('  Errors:', JSON.stringify(updateRes.data.menuUpdate.userErrors));
      } else if (updateRes.data?.menuUpdate?.menu) {
        console.log(`  → Updated: ${updateRes.data.menuUpdate.menu.handle}`);
      } else {
        console.log('  → Response:', JSON.stringify(updateRes));
      }
    } else {
      console.log(`\n+ Creating "${def.handle}"...`);
      const createMut = `mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) {
          menu { id handle title }
          userErrors { field message }
        }
      }`;
      const createRes = await gql(createMut, {
        title: def.title,
        handle: def.handle,
        items: def.items.map(item => ({
          title: item.title,
          url: `https://${STORE}${item.url}`,
          type: item.type
        }))
      });
      
      if (createRes.data?.menuCreate?.userErrors?.length) {
        console.log('  Errors:', JSON.stringify(createRes.data.menuCreate.userErrors));
      } else if (createRes.data?.menuCreate?.menu) {
        console.log(`  → Created: ${createRes.data.menuCreate.menu.handle}`);
      } else {
        console.log('  → Response:', JSON.stringify(createRes));
      }
    }
  }

  // 3. Check main-menu
  console.log('\n--- Checking main-menu ---');
  const mainMenu = existingMenus.find(m => m.handle === 'main-menu');
  if (!mainMenu) {
    console.log('⚠ main-menu not found');
    return;
  }

  const mainQ = `{
    menu(handle: "main-menu") {
      id title
      items {
        id title url type
        items {
          id title url type
        }
      }
    }
  }`;
  const mainRes = await gql(mainQ);
  const menu = mainRes.data?.menu;
  if (!menu) {
    console.log('⚠ Could not fetch main-menu details');
    return;
  }

  console.log(`main-menu: ${menu.title} (${menu.id})`);
  for (const item of (menu.items || [])) {
    const childCount = item.items ? item.items.length : 0;
    console.log(`  - ${item.title}${childCount > 0 ? ` → ${childCount} children` : ''}`);
    if (item.items) {
      for (const child of item.items) {
        console.log(`      - ${child.title}`);
      }
    }
  }

  // Check for "Shop" with required children
  const shopItem = (menu.items || []).find(i => i.title.toLowerCase() === 'shop');
  if (!shopItem) {
    console.log('\n⚠ No "Shop" link in main-menu.');
    console.log('  Adding Shop → By Category / By End Use / By Brand...');
    
    // Add Shop with children to main-menu
    const existingItems = (menu.items || []).map(item => ({
      title: item.title,
      url: item.url || '',
      type: item.type || 'HTTP',
      items: (item.items || []).map(child => ({
        title: child.title,
        url: child.url || '',
        type: child.type || 'HTTP'
      }))
    }));

    // Add Shop with 3 children
    existingItems.push({
      title: 'Shop',
      url: `https://${STORE}/collections`,
      type: 'HTTP',
      items: [
        { title: 'By Category', url: `https://${STORE}/collections`, type: 'HTTP' },
        { title: 'By End Use',  url: `https://${STORE}/collections`, type: 'HTTP' },
        { title: 'By Brand',    url: `https://${STORE}/collections`, type: 'HTTP' },
      ]
    });

    const addMut = `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { id title }
        userErrors { field message }
      }
    }`;
    const addRes = await gql(addMut, {
      id: menu.id,
      title: menu.title,
      items: existingItems
    });
    
    if (addRes.data?.menuUpdate?.userErrors?.length) {
      console.log('  Errors:', JSON.stringify(addRes.data.menuUpdate.userErrors));
    } else {
      console.log(`  ✓ Updated main-menu: ${addRes.data?.menuUpdate?.menu?.title}`);
    }
  } else {
    console.log(`\n✓ "Shop" link found with ${(shopItem.items || []).length} children`);
    const childTitles = (shopItem.items || []).map(c => c.title);
    console.log(`  Children: ${childTitles.join(', ')}`);
    
    const needed = ['By Category', 'By End Use', 'By Brand'];
    const missing = needed.filter(n => !childTitles.includes(n));
    if (missing.length > 0) {
      console.log(`  ⚠ Missing: ${missing.join(', ')}`);
      console.log('  Please add these via Admin → Navigation → main-menu');
    } else {
      console.log('  ✓ All required children present');
    }
  }

  console.log('\n✅ Done');
}

run().catch(console.error);
