#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function getAsset(key) {
  const res = await fetch(
    `https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );
  return (await res.json()).asset;
}

async function main() {
  // Get mega-menu-rueiv-v3.liquid snippet
  const mega = await getAsset('snippets/mega-menu-rueiv-v3.liquid');
  console.log('=== MEGA MENU V3 SNIPPET (first 3000 chars) ===');
  console.log(mega ? mega.value.substring(0, 3000) : 'NOT FOUND');
  
  // Get header-group.json
  const header = await getAsset('sections/header-group.json');
  if (header) {
    const tmpl = JSON.parse(header.value);
    const headerKey = Object.keys(tmpl.sections).find(k => tmpl.sections[k].type === 'header');
    if (headerKey) {
      const h = tmpl.sections[headerKey];
      console.log('\n=== HEADER BLOCKS ===');
      for (const [bk, bv] of Object.entries(h.blocks || {})) {
        const s = bv.settings || {};
        console.log(bk + ': type=' + bv.type + ', menu=' + (s.menu || '') + ', title=' + (s.title || '') + (s.featured_collection ? ', fc=' + s.featured_collection : '') + (s.featured_image ? ', has_image=true' : ''));
      }
    }
  }
  
  // Get desktop-menu.liquid
  const dm = await getAsset('snippets/desktop-menu.liquid');
  console.log('\n=== DESKTOP MENU (first 2000 chars) ===');
  console.log(dm ? dm.value.substring(0, 2000) : 'NOT FOUND');
}
main().catch(console.error);
