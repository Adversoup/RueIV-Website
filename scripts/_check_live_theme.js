#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function getAsset(key) {
  const res = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const j = await res.json();
  return j.asset ? j.asset.value : null;
}

async function main() {
  console.log('=== LIVE header-group.json ===');
  const hg = await getAsset('sections/header-group.json');
  if (hg) console.log(hg);
  else console.log('NOT FOUND');

  console.log('\n=== LIVE footer-group.json ===');
  const fg = await getAsset('sections/footer-group.json');
  if (fg) console.log(fg);
  else console.log('NOT FOUND');

  const snippets = [
    'snippets/mega-menu-rueiv-v2.liquid',
    'snippets/mega-menu-rueiv-v3.liquid',
    'snippets/mega-menu-vibe-studio.liquid',
    'snippets/desktop-menu.liquid',
    'snippets/smart-filters.liquid',
    'snippets/facets-horizontal.liquid',
    'assets/smart-filters.css'
  ];
  console.log('\n=== SNIPPET/ASSET EXISTENCE ON LIVE THEME ===');
  for (const s of snippets) {
    const v = await getAsset(s);
    console.log(s, v ? `EXISTS (${v.length} chars)` : 'NOT FOUND');
  }

  console.log('\n=== LIVE header.liquid schema check ===');
  const header = await getAsset('sections/header.liquid');
  if (header) {
    // Extract just the schema portion
    const schemaMatch = header.match(/\{%- schema -%\}([\s\S]*?)\{%- endschema -%\}/);
    if (schemaMatch) {
      const schema = JSON.parse(schemaMatch[1]);
      console.log('Block types:', schema.blocks.map(b => b.type).join(', '));
    }
  }

  console.log('\n=== LIVE index.json (homepage) ===');
  const idx = await getAsset('templates/index.json');
  if (idx) {
    const parsed = JSON.parse(idx);
    console.log('Sections order:', parsed.order || []);
    Object.entries(parsed.sections || {}).forEach(([key, sec]) => {
      console.log(`  ${key}: type=${sec.type}`);
    });
  } else console.log('NOT FOUND');

  console.log('\n=== LIVE collection.json ===');
  const col = await getAsset('templates/collection.json');
  if (col) {
    const parsed = JSON.parse(col);
    console.log('Sections order:', parsed.order || []);
    Object.entries(parsed.sections || {}).forEach(([key, sec]) => {
      console.log(`  ${key}: type=${sec.type}`);
    });
  } else console.log('NOT FOUND');
}
main().catch(console.error);
