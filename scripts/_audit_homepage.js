#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function getAsset(key) {
  const r = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  return (await r.json()).asset;
}

async function main() {
  // Get current index.json
  const idx = await getAsset('templates/index.json');
  if (idx) {
    const tmpl = JSON.parse(idx.value);
    console.log('=== CURRENT HOMEPAGE ORDER ===');
    tmpl.order.forEach((k, i) => console.log(`  ${String(i+1).padStart(2)}. ${k} (${tmpl.sections[k]?.type})`));
  }

  // Check existing rueiv CSS files
  console.log('\n=== EXISTING RUEIV ASSETS ===');
  for (const f of ['assets/rueiv-global.css', 'assets/rueiv-fonts.css', 'assets/rueiv-mega-v3.css']) {
    const a = await getAsset(f);
    console.log(`  ${a ? '✅' : '❌'} ${f} ${a ? '(' + a.value.length + ' chars)' : ''}`);
  }

  // Check what collections have images
  const gql = async (q) => {
    const r = await fetch(`https://${store}/admin/api/${ver}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q })
    });
    return r.json();
  };

  console.log('\n=== COLLECTION IMAGES ===');
  const handles = ['fabric', 'wallpaper', 'furniture', 'lighting', 'rugs', 'accessories', 'quick-ship',
                   'arte', 'fabricut', 'porta-romana', 'verellen', 'zr', 'new-arrivals'];
  for (const h of handles) {
    const r = await gql(`{ collectionByHandle(handle: "${h}") { title image { url width height } productsCount } }`);
    const c = r.data?.collectionByHandle;
    if (c) {
      const img = c.image;
      console.log(`  ${img ? '🖼️' : '⬜'} ${h}: ${c.productsCount} products${img ? `, img: ${img.width}x${img.height}` : ', NO IMAGE'}`);
    } else {
      console.log(`  ❌ ${h}: NOT FOUND`);
    }
  }

  // Check theme layout for where CSS gets included
  const layout = await getAsset('layout/theme.liquid');
  if (layout) {
    const hasRueiv = layout.value.includes('rueiv');
    console.log(`\n=== THEME LAYOUT ===`);
    console.log(`  rueiv references: ${hasRueiv}`);
    // Find where CSS is loaded
    const cssMatches = layout.value.match(/rueiv[^'"}\s]*/g);
    if (cssMatches) console.log(`  rueiv files loaded: ${[...new Set(cssMatches)].join(', ')}`);
  }
}
main().catch(console.error);
