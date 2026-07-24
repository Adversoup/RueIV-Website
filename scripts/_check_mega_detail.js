#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function main() {
  const res = await fetch(
    `https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=sections/header-group.json`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );
  const j = await res.json();
  const tmpl = JSON.parse(j.asset.value);
  const headerKey = Object.keys(tmpl.sections).find(k => tmpl.sections[k].type === 'header');
  const header = tmpl.sections[headerKey];
  
  console.log('=== FULL HEADER BLOCK SETTINGS ===');
  for (const [bk, bv] of Object.entries(header.blocks || {})) {
    console.log('\n--- ' + bk + ' (type: ' + bv.type + ') ---');
    console.log(JSON.stringify(bv.settings, null, 2));
  }
  
  // Also check the full mega-menu-rueiv-v3.liquid length and structure
  const mega = await fetch(
    `https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=snippets/mega-menu-rueiv-v3.liquid`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );
  const mj = await mega.json();
  if (mj.asset) {
    console.log('\n=== MEGA V3 FULL LENGTH ===');
    console.log(mj.asset.value.length + ' chars');
    // Print last 2000 chars to see bottom/featured section
    console.log('\n=== MEGA V3 BOTTOM (last 2000 chars) ===');
    console.log(mj.asset.value.slice(-2000));
  }
  
  // Check header section schema to understand what block settings are supported
  const headerAsset = await fetch(
    `https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=sections/header.liquid`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );
  const hj = await headerAsset.json();
  if (hj.asset) {
    // Find the schema
    const schemaMatch = hj.asset.value.match(/\{%[-\s]*schema[-\s]*%\}([\s\S]+?)\{%[-\s]*endschema[-\s]*%\}/);
    if (schemaMatch) {
      const schema = JSON.parse(schemaMatch[1]);
      const megaV3Block = schema.blocks.find(b => b.type === 'rueiv_mega_v3');
      console.log('\n=== RUEIV_MEGA_V3 BLOCK SCHEMA ===');
      console.log(JSON.stringify(megaV3Block, null, 2));
    }
  }
}
main().catch(console.error);
