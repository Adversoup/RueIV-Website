#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;

async function rest(path) {
  const r = await fetch(`https://${store}/admin/api/${ver}/${path}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  return r.json();
}

async function main() {
  // Check main menu
  console.log('=== CHECKING MAIN MENU ===');
  const menus = await rest('menus.json?limit=50');
  if (menus.menus) {
    console.log(`Found ${menus.menus.length} menus`);
    const mainMenu = menus.menus.find(m => m.handle === 'main-menu');
    if (mainMenu) {
      console.log(`main-menu: ${mainMenu.title}, ${mainMenu.items_count} items`);
    } else {
      console.log('main-menu NOT FOUND');
      menus.menus.forEach(m => console.log(`  - ${m.handle}: ${m.title}`));
    }
  } else {
    console.log('REST menus API error:', JSON.stringify(menus));
  }
  
  // Check collections
  console.log('\n=== CHECKING COLLECTIONS ===');
  let collPage1 = await rest('custom_collections.json?limit=100');
  let collPage2 = await rest('smart_collections.json?limit=100');
  const customs = collPage1.custom_collections || [];
  const smarts = collPage2.smart_collections || [];
  const all = [...customs, ...smarts];
  console.log(`Custom: ${customs.length}, Smart: ${smarts.length}, Total: ${all.length}`);
  
  const needed = ['fabric', 'wallpaper', 'furniture', 'lighting', 'rugs', 'accessories', 'quick-ship', 'textiles'];
  for (const h of needed) {
    const found = all.find(c => c.handle === h);
    console.log(`  ${found ? '✅' : '❌'} ${h}${found ? ' (id:' + found.id + ')' : ''}`);
  }
  
  // Check data menus (pagination)
  console.log('\n=== CHECKING DATA MENUS ===');
  let allMenus = menus.menus || [];
  // Paginate if needed
  if (allMenus.length >= 50) {
    const page2 = await rest(`menus.json?limit=50&since_id=${allMenus[allMenus.length-1].id}`);
    if (page2.menus) allMenus = [...allMenus, ...page2.menus];
  }
  console.log(`Total menus found: ${allMenus.length}`);
  const dataMenus = [
    'textiles-application', 'textiles-material', 'textiles-color-family',
    'wallcovering-materials', 'wallcovering-design', 'wallcovering-color-family',
    'furniture-type-v2', 'furniture-room', 'furniture-designers',
    'lighting-type', 'lighting-style', 'lighting-color'
  ];
  const menuHandles = allMenus.map(m => m.handle);
  for (const dm of dataMenus) {
    console.log(`  ${menuHandles.includes(dm) ? '✅' : '❌'} ${dm}`);
  }
}
main().catch(console.error);
