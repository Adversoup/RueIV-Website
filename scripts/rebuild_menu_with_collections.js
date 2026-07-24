/**
 * rebuild_menu_with_collections.js
 * Rebuilds main-menu using proper COLLECTION type links (not HTTP)
 * so that Liquid can access grandchildlink.object for thumbnails.
 */

require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL = `https://${STORE}/admin/api/${API_V}/graphql.json`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}

// ─── Fetch all collections and build handle→GID map ───
async function fetchCollectionMap() {
  const map = {};
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const q = `{ collections(first: 100${after}) { edges { cursor node { id handle title } } pageInfo { hasNextPage } } }`;
    const { data } = await gql(q);
    if (!data?.collections) break;
    for (const edge of data.collections.edges) {
      map[edge.node.handle] = edge.node.id;
      cursor = edge.cursor;
    }
    hasNext = data.collections.pageInfo.hasNextPage;
  }
  return map;
}

function collectionItem(title, handle, colMap) {
  const gid = colMap[handle];
  if (gid) {
    return { title, type: 'COLLECTION', resourceId: gid };
  }
  // Fallback to HTTP if collection doesn't exist
  console.log(`  ⚠ Collection "${handle}" not found, using HTTP link`);
  return { title, type: 'HTTP', url: `https://${STORE}/collections/${handle}` };
}

async function run() {
  console.log('── Rebuilding menu with proper collection links ──\n');

  // 1. Get collection handle → GID map
  const colMap = await fetchCollectionMap();
  console.log(`Found ${Object.keys(colMap).length} collections\n`);

  // 2. Build menu items with COLLECTION type
  const items = [
    {
      title: 'Shop',
      type: 'HTTP',
      url: `https://${STORE}/collections`,
      items: [
        {
          title: 'By Category',
          type: 'HTTP',
          url: `https://${STORE}/collections`,
          items: [
            collectionItem('Fabric',    'fabric',    colMap),
            collectionItem('Wallpaper', 'wallpaper', colMap),
            collectionItem('Furniture', 'furniture', colMap),
            collectionItem('Lighting',  'lighting',  colMap),

          ]
        },
        {
          title: 'By End Use',
          type: 'HTTP',
          url: `https://${STORE}/collections`,
          items: [
            collectionItem('Upholstery',    'fabric-upholstery',    colMap),
            collectionItem('Drapery',       'fabric-drapery',       colMap),
            collectionItem('Multi-purpose', 'fabric-multipurpose',  colMap),
            collectionItem('Performance',   'fabric-performance',   colMap),
          ]
        },
        {
          title: 'By Brand',
          type: 'HTTP',
          url: `https://${STORE}/collections`,
          items: [
            collectionItem('Arte',         'arte',         colMap),
            collectionItem('Fabricut',     'fabricut',     colMap),
            collectionItem('Porta Romana', 'porta-romana', colMap),
            collectionItem('Verellen',     'verellen',     colMap),
            collectionItem('ZR',           'zr',           colMap),
          ]
        }
      ]
    },
    { title: 'About',         type: 'HTTP', url: `https://${STORE}/pages/about` },
    { title: 'Trade Program', type: 'HTTP', url: `https://${STORE}/pages/trade-program` },
    { title: 'Contact',       type: 'HTTP', url: `https://${STORE}/pages/contact` },
  ];

  // 3. Find existing main-menu
  const listRes = await gql(`{ menus(first: 50) { edges { node { id handle title } } } }`);
  const existing = listRes.data?.menus?.edges?.map(e => e.node) || [];
  const mainMenu = existing.find(m => m.handle === 'main-menu');

  if (!mainMenu) {
    console.log('No main-menu found, creating...');
    const mut = `mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }`;
    const res = await gql(mut, { title: 'Main Menu', handle: 'main-menu', items });
    const errs = res.data?.menuCreate?.userErrors;
    if (errs?.length) {
      console.log('Errors:', JSON.stringify(errs, null, 2));
      return;
    }
    console.log('✓ Created main-menu');
  } else {
    console.log(`Updating main-menu (${mainMenu.id})...`);
    const mut = `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }`;
    const res = await gql(mut, { id: mainMenu.id, title: 'Main Menu', items });
    const errs = res.data?.menuUpdate?.userErrors;
    if (errs?.length) {
      console.log('Errors:', JSON.stringify(errs, null, 2));
      return;
    }
    console.log('✓ Updated main-menu');
  }

  // 4. Verify — check link types
  console.log('\n── Verification ──');
  await sleep(1000);
  const verifyQ = `{ menus(first: 10, query: "handle:main-menu") { 
    edges { node { handle items { title type url 
      items { title type url 
        items { title type url } 
      } 
    } } } 
  } }`;
  const verifyRes = await gql(verifyQ);
  const mm = verifyRes.data?.menus?.edges?.[0]?.node;
  if (mm) {
    for (const item of mm.items) {
      console.log(`${item.title} (${item.type})`);
      for (const c of (item.items || [])) {
        console.log(`  ${c.title} (${c.type})`);
        for (const gc of (c.items || [])) {
          console.log(`    ${gc.title} → ${gc.type}`);
        }
      }
    }
  }

  console.log('\n✅ Done — thumbnails should now work (collection_link type)');
}

run().catch(console.error);
