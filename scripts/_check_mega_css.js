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
  // Get rueiv-mega-v3.css
  const css = await getAsset('assets/rueiv-mega-v3.css');
  console.log('=== RUEIV-MEGA-V3.CSS ===');
  console.log(css ? css.value : 'NOT FOUND');
  
  // Get rueiv-mega-v3 snippet middle section (chars 3000-7000)
  const mega = await getAsset('snippets/mega-menu-rueiv-v3.liquid');
  if (mega) {
    console.log('\n=== MEGA V3 CHARS 3000-8000 ===');
    console.log(mega.value.substring(3000, 8000));
  }
}
main().catch(console.error);
