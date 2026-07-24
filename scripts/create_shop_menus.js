/**
 * create_shop_menus.js
 * Creates 3 navigation menus for the mega panel:
 *   1. shop-by-category  (Fabric, Wallpaper, Trim, Rugs, Lighting, Furniture)
 *   2. shop-by-end-use   (Upholstery, Drapery, Multi-purpose, Performance)
 *   3. shop-by-brand     (Arte, Fabricut, Porta Romana, Verellen, ZR — alphabetized)
 *
 * Also ensures the main-menu has a "Shop" link with child links for each panel.
 */

require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

const REST_BASE = `https://${STORE}/admin/api/2024-01`;   // REST for menus
const GQL_URL   = `https://${STORE}/admin/api/2026-04/graphql.json`;

// ── helpers ──────────────────────────────────────────
async function restGet(path) {
  const r = await fetch(`${REST_BASE}${path}`, {
    headers: { 'X-Shopify-Access-Token': TOKEN }
  });
  console.log(`  GET ${path} → ${r.status}`);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 500) }; }
}

async function restPost(path, body) {
  const r = await fetch(`${REST_BASE}${path}`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  console.log(`  POST ${path} → ${r.status}`);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 500) }; }
}

async function restPut(path, body) {
  const r = await fetch(`${REST_BASE}${path}`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function gql(query, variables = {}) {
  const r = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}

// ── menu definitions ─────────────────────────────────
const MENUS = [
  {
    handle: 'shop-by-category',
    title: 'Shop - By Category',
    links: [
      { title: 'Fabric',     url: '/collections/fabric' },
      { title: 'Wallpaper',  url: '/collections/wallpaper' },
      { title: 'Trim',       url: '/collections/trim' },
      { title: 'Rugs',       url: '/collections/rugs' },
      { title: 'Lighting',   url: '/collections/lighting' },
      { title: 'Furniture',  url: '/collections/furniture' },
    ]
  },
  {
    handle: 'shop-by-end-use',
    title: 'Shop - By End Use',
    links: [
      { title: 'Upholstery',    url: '/collections/upholstery' },
      { title: 'Drapery',       url: '/collections/drapery' },
      { title: 'Multi-purpose', url: '/collections/multi-purpose' },
      { title: 'Performance',   url: '/collections/performance' },
    ]
  },
  {
    handle: 'shop-by-brand',
    title: 'Shop - By Brand',
    links: [
      { title: 'Arte',          url: '/collections/arte' },
      { title: 'Fabricut',      url: '/collections/fabricut' },
      { title: 'Porta Romana',  url: '/collections/porta-romana' },
      { title: 'Verellen',      url: '/collections/verellen' },
      { title: 'ZR',            url: '/collections/zr' },
    ]
  }
];

// ── check / create menus ─────────────────────────────
async function run() {
  // 1. Get existing menus
  const existing = await restGet('/menus.json');
  const menusByHandle = {};
  for (const m of (existing.menus || [])) {
    menusByHandle[m.handle] = m;
  }

  console.log(`Found ${Object.keys(menusByHandle).length} existing menus`);

  for (const def of MENUS) {
    if (menusByHandle[def.handle]) {
      console.log(`  ✓ Menu "${def.handle}" already exists (id: ${menusByHandle[def.handle].id})`);
      
      // Update links if needed
      const existingMenu = menusByHandle[def.handle];
      if (existingMenu.links && existingMenu.links.length === def.links.length) {
        console.log(`    → ${existingMenu.links.length} links, looks correct`);
      } else {
        console.log(`    → Updating links...`);
        const updateBody = {
          menu: {
            id: existingMenu.id,
            title: def.title,
            links: def.links.map((l, i) => ({
              title: l.title,
              url: l.url,
              position: i + 1
            }))
          }
        };
        const updated = await restPut(`/menus/${existingMenu.id}.json`, updateBody);
        if (updated.menu) {
          console.log(`    → Updated: ${updated.menu.links.length} links`);
        } else {
          console.log(`    → Update error:`, JSON.stringify(updated.errors || updated));
        }
      }
    } else {
      console.log(`  + Creating menu "${def.handle}"...`);
      const body = {
        menu: {
          title: def.title,
          handle: def.handle,
          links: def.links.map((l, i) => ({
            title: l.title,
            url: l.url,
            position: i + 1
          }))
        }
      };
      const created = await restPost('/menus.json', body);
      if (created.menu) {
        console.log(`    → Created with ${created.menu.links.length} links (id: ${created.menu.id})`);
      } else {
        console.log(`    → Error:`, JSON.stringify(created.errors || created));
      }
    }
  }

  // 2. Check main-menu for "Shop" link with children
  console.log('\n--- Checking main-menu ---');
  const mainMenu = menusByHandle['main-menu'];
  if (!mainMenu) {
    console.log('  ⚠ main-menu not found. Create it manually in Shopify Admin → Navigation.');
    return;
  }
  
  console.log(`  main-menu id: ${mainMenu.id}`);
  console.log(`  Links:`);
  for (const link of (mainMenu.links || [])) {
    const childCount = link.links ? link.links.length : 0;
    console.log(`    - ${link.title} (${link.url})${childCount > 0 ? ` → ${childCount} children` : ''}`);
    if (link.links) {
      for (const child of link.links) {
        console.log(`        - ${child.title} (${child.url})`);
      }
    }
  }

  // Check if "Shop" exists with correct children
  const shopLink = (mainMenu.links || []).find(l => l.title.toLowerCase() === 'shop');
  if (!shopLink) {
    console.log('\n  ⚠ No "Shop" link found in main-menu.');
    console.log('  You need to add a "Shop" link with these children:');
    console.log('    - By Category  → /collections');
    console.log('    - By End Use   → /collections');
    console.log('    - By Brand     → /collections');
    console.log('  Or update the main menu via Admin → Navigation.');
  } else {
    console.log(`\n  ✓ "Shop" link found`);
    
    // Check children
    const expectedChildren = ['By Category', 'By End Use', 'By Brand'];
    const existingChildTitles = (shopLink.links || []).map(l => l.title);
    const missing = expectedChildren.filter(t => !existingChildTitles.includes(t));
    
    if (missing.length === 0) {
      console.log('  ✓ All 3 child links present (By Category, By End Use, By Brand)');
    } else {
      console.log(`  ⚠ Missing children: ${missing.join(', ')}`);
      console.log('  Update via Admin → Navigation → main-menu');
    }
  }
  
  console.log('\n✅ Done');
}

run().catch(console.error);
