#!/usr/bin/env node
/**
 * Full Showroom Validation — checks all 11 deployment steps
 */
require('dotenv').config();
const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

let pass = 0, fail = 0, warn = 0;
function ok(msg) { pass++; console.log(`  ✅ ${msg}`); }
function no(msg) { fail++; console.log(`  ❌ ${msg}`); }
function wn(msg) { warn++; console.log(`  ⚠️  ${msg}`); }

async function rest(path) {
  const r = await fetch(`https://${store}/admin/api/${ver}/${path}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  return r.json();
}

async function gql(query, variables = {}) {
  const r = await fetch(`https://${store}/admin/api/${ver}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}

async function getAsset(key) {
  const r = await rest(`themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`);
  return r.asset ? r.asset.value : null;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     FULL SHOWROOM VALIDATION — ALL 11 STEPS        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════
  // STEP 1: Theme Verification
  // ═══════════════════════════════════════
  console.log('━━ STEP 1: Theme Verification ━━');
  const themes = await rest('themes.json');
  const main = themes.themes?.find(t => t.role === 'main');
  if (main && main.id == themeId) ok(`Active theme: ${main.name} (ID: ${main.id})`);
  else no('Active theme mismatch');

  // ═══════════════════════════════════════
  // STEP 2: Main Navigation (7 items)
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 2: Main Navigation ━━');
  const menusData = await gql(`{
    menus(first: 50) {
      edges { node { id title handle itemsCount } }
    }
  }`);
  const menus = menusData.data?.menus?.edges?.map(e => e.node) || [];
  const mainMenu = menus.find(m => m.handle === 'main-menu');
  if (mainMenu) {
    ok(`main-menu exists (${mainMenu.itemsCount} items)`);
    // Check items
    const mmDetail = await gql(`{
      menu(handle: "main-menu") {
        items { title url }
      }
    }`);
    const items = mmDetail.data?.menu?.items || [];
    const expected = ['Textiles', 'Wallcovering', 'Furniture', 'Lighting', 'Rugs', 'Accessories', 'The Vibe Studio'];
    for (const e of expected) {
      if (items.some(i => i.title === e)) ok(`Nav item: ${e}`);
      else no(`Missing nav item: ${e}`);
    }
  } else no('main-menu not found');

  // ═══════════════════════════════════════
  // STEP 3: Mega Menus
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 3: Mega Menus ━━');
  
  // Check header-group.json blocks
  const headerGroup = await getAsset('sections/header-group.json');
  if (headerGroup) {
    const hg = JSON.parse(headerGroup);
    const headerKey = Object.keys(hg.sections).find(k => hg.sections[k].type === 'header');
    const blocks = hg.sections[headerKey]?.blocks || {};
    const expectedBlocks = ['mega_textiles', 'mega_wallcovering', 'mega_furniture', 'mega_lighting', 'mega_rugs', 'mega_accessories', 'mega_vibe'];
    for (const eb of expectedBlocks) {
      if (blocks[eb]) ok(`Mega block: ${eb} (${blocks[eb].type})`);
      else no(`Missing mega block: ${eb}`);
    }
  } else no('header-group.json not found');
  
  // Check data menus exist
  const dataMenus = [
    'textiles-application', 'textiles-material', 'textiles-color-family',
    'wallcovering-materials', 'wallcovering-design', 'wallcovering-color-family',
    'furniture-type-v2', 'furniture-room', 'furniture-designers',
    'lighting-type', 'lighting-style', 'lighting-color',
    'rugs-size', 'rugs-material', 'rugs-color',
    'accessories-category', 'accessories-room', 'accessories-material'
  ];
  let menuHandles = menus.map(m => m.handle);
  let menuMissing = 0;
  for (const dm of dataMenus) {
    if (menuHandles.includes(dm)) pass++;
    else { menuMissing++; fail++; console.log(`  ❌ Missing data menu: ${dm}`); }
  }
  if (menuMissing === 0) ok(`All ${dataMenus.length} data menus exist`);
  else no(`${menuMissing} data menus missing`);

  // ═══════════════════════════════════════
  // STEP 4: Collections
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 4: Collections ━━');
  const collectionsData = await gql(`{
    collections(first: 100) {
      edges { node { handle title productsCount } }
    }
  }`);
  const collections = collectionsData.data?.collections?.edges?.map(e => e.node) || [];
  const collHandles = collections.map(c => c.handle);
  const reqCollections = ['fabric', 'wallpaper', 'furniture', 'lighting', 'rugs', 'accessories', 'quick-ship', 'textiles'];
  for (const rc of reqCollections) {
    const found = collections.find(c => c.handle === rc);
    if (found) ok(`Collection: ${rc} (${found.productsCount} products)`);
    else no(`Missing collection: ${rc}`);
  }
  ok(`Total collections: ${collections.length}`);

  // ═══════════════════════════════════════
  // STEP 5: Metafield Definitions
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 5: Metafield Definitions ━━');
  const mfData = await gql(`{
    metafieldDefinitions(first: 50, ownerType: PRODUCT) {
      edges { node { namespace key name type { name } } }
    }
  }`);
  const mfDefs = mfData.data?.metafieldDefinitions?.edges?.map(e => e.node) || [];
  const reqMetafields = [
    'showroom.material', 'showroom.color_family', 'showroom.pattern',
    'showroom.room', 'showroom.application', 'showroom.lead_time', 'showroom.designer'
  ];
  for (const rm of reqMetafields) {
    const [ns, key] = rm.split('.');
    if (mfDefs.some(m => m.namespace === ns && m.key === key)) ok(`Metafield: ${rm}`);
    else no(`Missing metafield: ${rm}`);
  }

  // ═══════════════════════════════════════
  // STEP 6: Collection Filters (smart-filters.liquid)
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 6: Collection Filters ━━');
  const smartFilters = await getAsset('snippets/smart-filters.liquid');
  if (smartFilters) {
    ok(`smart-filters.liquid deployed (${smartFilters.length} chars)`);
    if (smartFilters.includes('showroom.material')) ok('Filters reference showroom.material');
    else wn('Filters missing showroom.material reference');
    if (smartFilters.includes('showroom.color_family')) ok('Filters reference showroom.color_family');
    else wn('Filters missing showroom.color_family reference');
  } else no('smart-filters.liquid not found');
  
  const smartCss = await getAsset('assets/smart-filters.css');
  if (smartCss) ok(`smart-filters.css deployed (${smartCss.length} chars)`);
  else no('smart-filters.css not found');
  
  const facets = await getAsset('snippets/facets-horizontal.liquid');
  if (facets) ok(`facets-horizontal.liquid deployed (${facets.length} chars)`);
  else wn('facets-horizontal.liquid not found');

  // ═══════════════════════════════════════
  // STEP 7: Smart Filter Logic
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 7: Smart Filter Logic ━━');
  if (smartFilters) {
    if (smartFilters.includes('collection.handle')) ok('Category-aware filter routing present');
    else wn('No category-aware routing found');
    if (smartFilters.includes('furniture') || smartFilters.includes('fabric')) ok('Category-specific filter rules');
    else wn('No category-specific filter rules');
  }

  // ═══════════════════════════════════════
  // STEP 8: Quick Ship
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 8: Quick Ship ━━');
  const qsCollection = collections.find(c => c.handle === 'quick-ship');
  if (qsCollection) ok(`quick-ship collection (${qsCollection.productsCount} products)`);
  else no('quick-ship collection missing');
  
  // Check quick-ship link in furniture/lighting menus
  for (const menuHandle of ['furniture-type-v2', 'lighting-style']) {
    const mData = await gql(`{ menu(handle: "${menuHandle}") { items { title url } } }`);
    const mItems = mData.data?.menu?.items || [];
    if (mItems.some(i => i.url && i.url.includes('quick-ship'))) ok(`Quick Ship link in ${menuHandle}`);
    else wn(`Quick Ship link missing from ${menuHandle}`);
    await sleep(200);
  }

  // ═══════════════════════════════════════
  // STEP 9: Homepage Sections
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 9: Homepage Sections ━━');
  const indexJson = await getAsset('templates/index.json');
  if (indexJson) {
    const idx = JSON.parse(indexJson);
    const order = idx.order || [];
    ok(`Homepage has ${order.length} sections total`);
    
    // Check original sections preserved
    const originals = ['slideshow_zKPFFV', 'rich_text_yAEBMr', 'custom_content_FQyrQN', 'product_tabs_jhb9aJ', 'lookbook_slider_cte8Fy', 'collection_list_Jbx97m'];
    let origPresent = 0;
    for (const o of originals) {
      if (order.includes(o)) origPresent++;
    }
    if (origPresent === originals.length) ok(`All ${origPresent} original sections preserved`);
    else wn(`Only ${origPresent}/${originals.length} original sections present`);
    
    // Check showroom sections
    const showroomSections = ['showroom_categories', 'showroom_quickship', 'showroom_designers', 'showroom_vibe', 'showroom_newsletter'];
    for (const ss of showroomSections) {
      if (order.includes(ss) && idx.sections[ss]) ok(`Homepage section: ${ss} (${idx.sections[ss].type})`);
      else no(`Missing homepage section: ${ss}`);
    }
  } else no('index.json not found');

  // ═══════════════════════════════════════
  // STEP 10: Mega Menu Visual Enhancement
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 10: Mega Menu Visual Enhancement ━━');
  const megaSnippet = await getAsset('snippets/mega-menu-rueiv-v3.liquid');
  if (megaSnippet) {
    if (megaSnippet.includes('rv3-featured')) ok('Featured panel markup present');
    else no('Featured panel markup missing');
    if (megaSnippet.includes('featured_collection')) ok('Featured collection logic present');
    else no('Featured collection logic missing');
  }
  
  const megaCss = await getAsset('assets/rueiv-mega-v3.css');
  if (megaCss) {
    if (megaCss.includes('rv3-featured')) ok('Featured panel CSS present');
    else no('Featured panel CSS missing');
    if (megaCss.includes('rv3-grid--featured')) ok('Featured grid variant CSS present');
    else no('Featured grid variant CSS missing');
  }
  
  // Check featured_collection set in blocks
  if (headerGroup) {
    const hg = JSON.parse(headerGroup);
    const headerKey = Object.keys(hg.sections).find(k => hg.sections[k].type === 'header');
    const blocks = hg.sections[headerKey]?.blocks || {};
    let featCount = 0;
    for (const [bk, bv] of Object.entries(blocks)) {
      if (bv.type === 'rueiv_mega_v3' && bv.settings?.featured_collection) featCount++;
    }
    if (featCount === 6) ok(`All 6 category menus have featured_collection set`);
    else wn(`Only ${featCount}/6 menus have featured_collection`);
  }

  // ═══════════════════════════════════════
  // STEP 11: Theme Snippets & Assets
  // ═══════════════════════════════════════
  console.log('\n━━ STEP 11: Theme Files ━━');
  const snippets = [
    'snippets/mega-menu-rueiv-v2.liquid',
    'snippets/mega-menu-rueiv-v3.liquid',
    'snippets/mega-menu-vibe-studio.liquid',
    'snippets/desktop-menu.liquid',
    'snippets/smart-filters.liquid',
    'snippets/facets-horizontal.liquid'
  ];
  const assets = [
    'assets/rueiv-mega-v3.css',
    'assets/rueiv-global.css',
    'assets/rueiv-fonts.css',
    'assets/smart-filters.css'
  ];
  
  for (const s of snippets) {
    const v = await getAsset(s);
    if (v) ok(`${s} (${v.length} chars)`);
    else no(`Missing: ${s}`);
    await sleep(150);
  }
  for (const a of assets) {
    const v = await getAsset(a);
    if (v) ok(`${a} (${v.length} chars)`);
    else no(`Missing: ${a}`);
    await sleep(150);
  }

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS:  ✅ ${pass} passed   ❌ ${fail} failed   ⚠️  ${warn} warnings  ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  
  if (fail === 0) {
    console.log('\n🏆 ALL CHECKS PASSED — Full showroom deployed & verified!');
  } else {
    console.log(`\n⚠️  ${fail} check(s) failed — review above for details.`);
  }
}

main().catch(err => { console.error('ERROR:', err); process.exit(1); });
