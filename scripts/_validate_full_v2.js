#!/usr/bin/env node
/**
 * Full Showroom Validation v2 — corrected GraphQL queries
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

async function gql(query) {
  const r = await fetch(`https://${store}/admin/api/${ver}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return r.json();
}

async function getAsset(key) {
  const r = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const j = await r.json();
  return j.asset ? j.asset.value : null;
}

async function getAllMenus() {
  let all = [], cursor = null, hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const r = await gql(`{ menus(first: 50${after}) { edges { cursor node { id title handle } } pageInfo { hasNextPage } } }`);
    const edges = r.data?.menus?.edges || [];
    all.push(...edges.map(e => e.node));
    hasNext = r.data?.menus?.pageInfo?.hasNextPage || false;
    if (edges.length > 0) cursor = edges[edges.length - 1].cursor;
  }
  return all;
}

async function getAllCollections() {
  let all = [], cursor = null, hasNext = true;
  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const r = await gql(`{ collections(first: 50${after}) { edges { cursor node { handle title } } pageInfo { hasNextPage } } }`);
    const edges = r.data?.collections?.edges || [];
    all.push(...edges.map(e => e.node));
    hasNext = r.data?.collections?.pageInfo?.hasNextPage || false;
    if (edges.length > 0) cursor = edges[edges.length - 1].cursor;
  }
  return all;
}

async function getMenuItems(menuId) {
  const r = await gql(`{ node(id: "${menuId}") { ... on Menu { items { title url } } } }`);
  return r.data?.node?.items || [];
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     FULL SHOWROOM VALIDATION — ALL 11 STEPS (v2)       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Load all data
  const [menus, collections] = await Promise.all([getAllMenus(), getAllCollections()]);
  const menuMap = Object.fromEntries(menus.map(m => [m.handle, m]));
  const collMap = Object.fromEntries(collections.map(c => [c.handle, c]));

  // ═══ STEP 1: Theme ═══
  console.log('━━ STEP 1: Theme Verification ━━');
  const themes = await fetch(`https://${store}/admin/api/${ver}/themes.json`, {
    headers: { 'X-Shopify-Access-Token': token }
  }).then(r => r.json());
  const activeTheme = themes.themes?.find(t => t.role === 'main');
  if (activeTheme && activeTheme.id == themeId) ok(`Active theme: ${activeTheme.name} (ID: ${activeTheme.id})`);
  else no('Active theme mismatch');

  // ═══ STEP 2: Main Nav ═══
  console.log('\n━━ STEP 2: Main Navigation ━━');
  const mm = menuMap['main-menu'];
  if (mm) {
    ok(`main-menu exists: "${mm.title}"`);
    const items = await getMenuItems(mm.id);
    const expected = ['Textiles', 'Wallcovering', 'Furniture', 'Lighting', 'Rugs', 'Accessories', 'The Vibe Studio'];
    for (const e of expected) {
      if (items.find(i => i.title === e)) ok(`Nav: ${e}`);
      else no(`Missing nav: ${e}`);
    }
  } else no('main-menu not found');

  // ═══ STEP 3: Mega Menus ═══
  console.log('\n━━ STEP 3: Mega Menus ━━');
  const headerGroup = await getAsset('sections/header-group.json');
  if (headerGroup) {
    const hg = JSON.parse(headerGroup);
    const hKey = Object.keys(hg.sections).find(k => hg.sections[k].type === 'header');
    const blocks = hg.sections[hKey]?.blocks || {};
    const expectedBlocks = ['mega_textiles', 'mega_wallcovering', 'mega_furniture', 'mega_lighting', 'mega_rugs', 'mega_accessories', 'mega_vibe'];
    for (const eb of expectedBlocks) {
      if (blocks[eb]) ok(`Mega block: ${eb} (${blocks[eb].type})`);
      else no(`Missing mega block: ${eb}`);
    }
  } else no('header-group.json not found');
  
  const dataMenus = [
    'textiles-application', 'textiles-material', 'textiles-color-family',
    'wallcovering-materials', 'wallcovering-design', 'wallcovering-color-family',
    'furniture-type-v2', 'furniture-room', 'furniture-designers',
    'lighting-type', 'lighting-style', 'lighting-color',
    'rugs-size', 'rugs-material', 'rugs-color',
    'accessories-category', 'accessories-room', 'accessories-material'
  ];
  let dmFound = 0;
  for (const dm of dataMenus) {
    if (menuMap[dm]) dmFound++;
    else no(`Missing data menu: ${dm}`);
  }
  if (dmFound === dataMenus.length) ok(`All ${dataMenus.length} data menus present`);
  else ok(`${dmFound}/${dataMenus.length} data menus found`);

  // ═══ STEP 4: Collections ═══
  console.log('\n━━ STEP 4: Collections ━━');
  ok(`Total collections: ${collections.length}`);
  const reqColl = ['fabric', 'wallpaper', 'furniture', 'lighting', 'rugs', 'accessories', 'quick-ship', 'textiles'];
  for (const rc of reqColl) {
    if (collMap[rc]) ok(`Collection: ${rc}`);
    else no(`Missing collection: ${rc}`);
  }

  // ═══ STEP 5: Metafields ═══
  console.log('\n━━ STEP 5: Metafield Definitions ━━');
  const mfData = await gql(`{ metafieldDefinitions(first: 50, ownerType: PRODUCT) { edges { node { namespace key } } } }`);
  const mfDefs = mfData.data?.metafieldDefinitions?.edges?.map(e => e.node) || [];
  const reqMeta = ['showroom.material', 'showroom.color_family', 'showroom.pattern', 'showroom.room', 'showroom.application', 'showroom.lead_time', 'showroom.designer'];
  for (const rm of reqMeta) {
    const [ns, key] = rm.split('.');
    if (mfDefs.some(m => m.namespace === ns && m.key === key)) ok(`Metafield: ${rm}`);
    else no(`Missing: ${rm}`);
  }

  // ═══ STEP 6: Filters ═══
  console.log('\n━━ STEP 6: Collection Filters ━━');
  const sf = await getAsset('snippets/smart-filters.liquid');
  if (sf) ok(`smart-filters.liquid (${sf.length} chars)`);
  else no('smart-filters.liquid missing');
  const sc = await getAsset('assets/smart-filters.css');
  if (sc) ok(`smart-filters.css (${sc.length} chars)`);
  else no('smart-filters.css missing');
  const fh = await getAsset('snippets/facets-horizontal.liquid');
  if (fh) ok(`facets-horizontal.liquid (${fh.length} chars)`);
  else wn('facets-horizontal.liquid missing');

  // ═══ STEP 7: Smart Filter Logic ═══
  console.log('\n━━ STEP 7: Smart Filter Logic ━━');
  if (sf && sf.includes('collection.handle')) ok('Category-aware routing');
  else wn('No category-aware routing');
  if (sf && (sf.includes('furniture') || sf.includes('fabric'))) ok('Category-specific rules');
  else wn('No category rules');

  // ═══ STEP 8: Quick Ship ═══
  console.log('\n━━ STEP 8: Quick Ship ━━');
  if (collMap['quick-ship']) ok('quick-ship collection exists');
  else no('quick-ship collection missing');
  
  // Check quick-ship in menus
  for (const mh of ['furniture-type-v2', 'lighting-style']) {
    const m = menuMap[mh];
    if (m) {
      const items = await getMenuItems(m.id);
      if (items.some(i => i.url && i.url.includes('quick-ship'))) ok(`Quick Ship in ${mh}`);
      else wn(`Quick Ship missing from ${mh}`);
    }
  }

  // ═══ STEP 9: Homepage ═══
  console.log('\n━━ STEP 9: Homepage Sections ━━');
  const idx = await getAsset('templates/index.json');
  if (idx) {
    const tmpl = JSON.parse(idx);
    const order = tmpl.order || [];
    ok(`${order.length} total sections`);
    
    const originals = ['slideshow_zKPFFV', 'rich_text_yAEBMr', 'custom_content_FQyrQN', 'product_tabs_jhb9aJ', 'lookbook_slider_cte8Fy', 'collection_list_Jbx97m'];
    const origCount = originals.filter(o => order.includes(o)).length;
    if (origCount === originals.length) ok(`All ${origCount} original sections preserved`);
    else wn(`${origCount}/${originals.length} original sections`);
    
    const showroom = ['showroom_categories', 'showroom_quickship', 'showroom_designers', 'showroom_vibe', 'showroom_newsletter'];
    for (const ss of showroom) {
      if (order.includes(ss) && tmpl.sections[ss]) ok(`${ss} (${tmpl.sections[ss].type})`);
      else no(`Missing: ${ss}`);
    }
  } else no('index.json not found');

  // ═══ STEP 10: Visual Enhancement ═══
  console.log('\n━━ STEP 10: Mega Menu Visual Enhancement ━━');
  const mega = await getAsset('snippets/mega-menu-rueiv-v3.liquid');
  if (mega && mega.includes('rv3-featured')) ok('Featured panel markup');
  else no('Featured panel markup missing');
  if (mega && mega.includes('featured_collection')) ok('Featured collection logic');
  else no('Featured collection logic missing');
  
  const css = await getAsset('assets/rueiv-mega-v3.css');
  if (css && css.includes('rv3-featured')) ok('Featured panel CSS');
  else no('Featured panel CSS missing');
  
  if (headerGroup) {
    const hg = JSON.parse(headerGroup);
    const hKey = Object.keys(hg.sections).find(k => hg.sections[k].type === 'header');
    const blocks = hg.sections[hKey]?.blocks || {};
    let feat = Object.values(blocks).filter(b => b.type === 'rueiv_mega_v3' && b.settings?.featured_collection).length;
    if (feat === 6) ok(`All 6 menus have featured_collection`);
    else wn(`${feat}/6 menus have featured_collection`);
  }

  // ═══ STEP 11: Theme Files ═══
  console.log('\n━━ STEP 11: Theme Files ━━');
  const files = [
    'snippets/mega-menu-rueiv-v2.liquid', 'snippets/mega-menu-rueiv-v3.liquid',
    'snippets/mega-menu-vibe-studio.liquid', 'snippets/desktop-menu.liquid',
    'snippets/smart-filters.liquid', 'snippets/facets-horizontal.liquid',
    'assets/rueiv-mega-v3.css', 'assets/rueiv-global.css', 'assets/rueiv-fonts.css', 'assets/smart-filters.css'
  ];
  for (const f of files) {
    const v = await getAsset(f);
    if (v) ok(`${f} (${v.length} chars)`);
    else no(`Missing: ${f}`);
  }

  // ═══ SUMMARY ═══
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS:  ✅ ${String(pass).padStart(2)} passed   ❌ ${String(fail).padStart(2)} failed   ⚠️  ${String(warn).padStart(2)} warnings   ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (fail === 0) console.log('\n🏆 ALL CHECKS PASSED — Full showroom deployed & verified!');
  else console.log(`\n⚠️  ${fail} check(s) need attention.`);
}

main().catch(err => { console.error('ERROR:', err); process.exit(1); });
