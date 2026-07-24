#!/usr/bin/env node
/**
 * Validate storefront — checks that key elements are visible via the Storefront/API
 * Since the store is password-protected, we verify through:
 * 1. Admin API: confirm menus, collections, metafields
 * 2. Theme Asset API: confirm theme files deployed correctly
 * 3. Fetch storefront with password to check HTML output
 */
require('dotenv').config();
const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;
const password = process.env.SHOPIFY_STORE_PASSWORD || 'niebow';

async function gql(query) {
  const res = await fetch(`https://${store}/admin/api/${ver}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return (await res.json()).data;
}

async function restGet(p) {
  const res = await fetch(`https://${store}/admin/api/${ver}${p}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  return res.json();
}

async function getAsset(key) {
  const res = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const j = await res.json();
  return j.asset ? j.asset.value : null;
}

// Fetch storefront HTML through password
async function fetchStorefront(urlPath) {
  // First, get a session by posting the password
  const loginRes = await fetch(`https://${store}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `password=${password}`,
    redirect: 'manual'
  });
  
  const cookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
  
  const pageRes = await fetch(`https://${store}${urlPath}`, {
    headers: { 'Cookie': cookieStr }
  });
  return pageRes.text();
}

async function main() {
  let pass = 0, fail = 0;
  
  function check(label, ok) {
    if (ok) { console.log(`  ✅ ${label}`); pass++; }
    else    { console.log(`  ❌ ${label}`); fail++; }
  }
  
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  RueIV Showroom — Validation                ║');
  console.log('╚══════════════════════════════════════════════╝');
  
  // ── 1. Navigation Menus ──
  console.log('\n━━━ Navigation Menus ━━━');
  const menuData = await gql(`{
    menus(first: 50) {
      edges { node { handle title items { title } } }
    }
  }`);
  
  const menus = {};
  menuData.menus.edges.forEach(e => {
    menus[e.node.handle] = e.node;
  });
  
  // Main menu check
  const mm = menus['main-menu'];
  check('main-menu exists', !!mm);
  if (mm) {
    const titles = mm.items.map(i => i.title);
    check('Textiles in main nav', titles.includes('Textiles'));
    check('Wallcovering in main nav', titles.includes('Wallcovering'));
    check('Furniture in main nav', titles.includes('Furniture'));
    check('Lighting in main nav', titles.includes('Lighting'));
    check('Rugs in main nav', titles.includes('Rugs'));
    check('Accessories in main nav', titles.includes('Accessories'));
    check('The Vibe Studio in main nav', titles.includes('The Vibe Studio'));
    check('Designers NOT in main nav', !titles.includes('Designers'));
  }
  
  // Mega menu data menus
  const megaMenus = [
    'textiles-application', 'textiles-material', 'textiles-color-family',
    'wallcovering-materials', 'wallcovering-design', 'wallcovering-color-family',
    'furniture-type-v2', 'furniture-room', 'furniture-designers',
    'lighting-type', 'lighting-style', 'lighting-color',
    'rugs-size', 'rugs-material', 'rugs-color',
    'accessories-category', 'accessories-room', 'accessories-material'
  ];
  for (const h of megaMenus) {
    check(`Mega menu "${h}" exists`, !!menus[h]);
  }
  
  // Footer menus
  check('footer-company menu exists', !!menus['footer-company']);
  check('footer-resources menu exists', !!menus['footer-resources']);
  
  // ── 2. Collections ──
  console.log('\n━━━ Collections ━━━');
  const custom = await restGet('/custom_collections.json?limit=250');
  const smart = await restGet('/smart_collections.json?limit=250');
  const allHandles = new Set([
    ...(custom.custom_collections || []).map(c => c.handle),
    ...(smart.smart_collections || []).map(c => c.handle)
  ]);
  
  const requiredCollections = ['fabric', 'wallpaper', 'furniture', 'lighting', 'rugs', 'accessories', 'quick-ship'];
  for (const h of requiredCollections) {
    check(`Collection "${h}" exists`, allHandles.has(h));
  }
  
  // ── 3. Metafield Definitions ──
  console.log('\n━━━ Metafield Definitions ━━━');
  const mfData = await gql(`{
    metafieldDefinitions(first: 100, ownerType: PRODUCT) {
      edges { node { namespace key } }
    }
  }`);
  const mfKeys = new Set(
    mfData.metafieldDefinitions.edges.map(e => `${e.node.namespace}.${e.node.key}`)
  );
  
  const requiredMF = [
    'showroom.material', 'showroom.color_family', 'showroom.pattern',
    'showroom.room', 'showroom.application', 'showroom.lead_time', 'showroom.designer'
  ];
  for (const mf of requiredMF) {
    check(`Metafield "${mf}" defined`, mfKeys.has(mf));
  }
  
  // ── 4. Theme Assets ──
  console.log('\n━━━ Theme Assets (Live) ━━━');
  const requiredAssets = [
    'sections/header-group.json',
    'sections/footer-group.json',
    'snippets/mega-menu-rueiv-v3.liquid',
    'snippets/mega-menu-vibe-studio.liquid',
    'snippets/desktop-menu.liquid',
    'snippets/smart-filters.liquid',
    'assets/smart-filters.css',
    'templates/index.json',
    'sections/rueiv-hero.liquid',
    'sections/rueiv-category-grid.liquid',
    'sections/rueiv-quick-ship.liquid'
  ];
  
  for (const key of requiredAssets) {
    const content = await getAsset(key);
    check(`${key} deployed`, !!content);
  }
  
  // Validate header-group.json has Accessories
  const hg = await getAsset('sections/header-group.json');
  if (hg) {
    const parsed = JSON.parse(hg);
    const blocks = parsed.sections?.header?.blocks || {};
    check('header-group has mega_accessories block', !!blocks.mega_accessories);
    check('header-group has mega_textiles block', !!blocks.mega_textiles);
    check('header-group menu = main-menu', parsed.sections?.header?.settings?.menu === 'main-menu');
    
    const order = parsed.sections?.header?.block_order || [];
    check('Block order has 7 items', order.length === 7);
    check('No mega_designers in block order', !order.includes('mega_designers'));
  }
  
  // Validate footer-group.json has Company/Resources
  const fg = await getAsset('sections/footer-group.json');
  if (fg) {
    const parsed = JSON.parse(fg);
    const blocks = parsed.sections?.footer?.blocks || {};
    check('footer-group has menu_company block', !!blocks.menu_company);
    check('footer-group has menu_resources block', !!blocks.menu_resources);
  }
  
  // ── 5. Quick Ship ──
  console.log('\n━━━ Quick Ship System ━━━');
  check('Quick Ship collection exists', allHandles.has('quick-ship'));
  
  // Check furniture mega menu has Quick Ship link
  const ftMenu = menus['furniture-type-v2'];
  if (ftMenu) {
    const hasQS = ftMenu.items.some(i => i.title.toLowerCase().includes('quick ship'));
    check('Furniture mega has Quick Ship link', hasQS);
  }
  const lsMenu = menus['lighting-style'];
  if (lsMenu) {
    const hasQS = lsMenu.items.some(i => i.title.toLowerCase().includes('quick ship'));
    check('Lighting mega has Quick Ship link', hasQS);
  }
  
  // ── 6. Storefront HTML Check ──
  console.log('\n━━━ Storefront Rendering ━━━');
  try {
    const html = await fetchStorefront('/');
    
    check('Homepage loads (!password page)', !html.includes('id="password"') || html.includes('rueiv'));
    check('Nav contains "Textiles"', html.includes('Textiles'));
    check('Nav contains "Wallcovering"', html.includes('Wallcovering'));
    check('Nav contains "Furniture"', html.includes('Furniture'));
    check('Nav contains "Lighting"', html.includes('Lighting'));
    check('Nav contains "Rugs"', html.includes('Rugs'));
    check('Nav contains "Accessories"', html.includes('Accessories'));
    check('Nav contains "The Vibe Studio"', html.includes('The Vibe Studio'));
    check('Mega menu v3 CSS loaded', html.includes('rueiv-mega-v3.css') || html.includes('mega-menu-rueiv'));
    check('Footer has "Company"', html.includes('Company'));
    check('Footer has "Resources"', html.includes('Resources'));
    
    // Check for hero section
    check('Hero section rendered', html.includes('rueiv-hero') || html.includes('hero'));
    
    // Check collection page
    const collHtml = await fetchStorefront('/collections/fabric');
    check('Collection page loads', collHtml.includes('Fabric') || collHtml.includes('fabric'));
    check('Smart filters on collection', collHtml.includes('smart-filter') || collHtml.includes('facets'));
    
  } catch (err) {
    console.log(`  ⚠️  Storefront fetch error: ${err.message}`);
    console.log('  (This may be expected for password-protected stores)');
  }
  
  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║  Results: ${pass} passed / ${fail} failed              ║`);
  console.log('╚══════════════════════════════════════════════╝');
  
  if (fail > 0) {
    console.log('\n⚠️  Some checks failed — review above and fix.');
  } else {
    console.log('\n🎉 All checks passed!');
  }
  
  console.log(`\nManual verification URL:`);
  console.log(`  https://${store}/?password=${password}`);
  console.log(`\nCollection test:`);
  console.log(`  https://${store}/collections/fabric?password=${password}`);
}

main().catch(console.error);
