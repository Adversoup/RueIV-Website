#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;

async function gql(query) {
  const r = await fetch(`https://${store}/admin/api/${ver}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return r.json();
}

async function main() {
  // Check if collections have images and products
  const handles = ['fabric', 'wallpaper', 'furniture', 'lighting', 'rugs', 'accessories', 'quick-ship', 'arte', 'fabricut', 'porta-romana', 'verellen', 'zr'];
  
  console.log('=== COLLECTION STATUS (images + products) ===');
  for (const h of handles) {
    const r = await gql(`{
      collectionByHandle(handle: "${h}") {
        title
        handle
        image { url }
        productsCount
      }
    }`);
    const c = r.data?.collectionByHandle;
    if (c) {
      console.log(`  ${c.image ? '🖼️' : '⬜'} ${h}: ${c.productsCount} products, image: ${c.image ? 'YES' : 'NO'}`);
    } else {
      console.log(`  ❌ ${h}: NOT FOUND`);
    }
  }
  
  // Also check: how many products in quick-ship?
  console.log('\n=== QUICK-SHIP PRODUCTS ===');
  const qs = await gql(`{
    collectionByHandle(handle: "quick-ship") {
      title
      products(first: 5) {
        edges { node { title status } }
      }
      productsCount
    }
  }`);
  const qsc = qs.data?.collectionByHandle;
  if (qsc) {
    console.log(`Products: ${qsc.productsCount}`);
    (qsc.products?.edges || []).forEach(e => console.log(`  - ${e.node.title} (${e.node.status})`));
  }
  
  // Check homepage section order and position
  console.log('\n=== HOMEPAGE INDEX.JSON ORDER ===');
  const themeId = 156225110147;
  const asset = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=templates/index.json`, {
    headers: { 'X-Shopify-Access-Token': token }
  }).then(r => r.json());
  
  if (asset.asset) {
    const tmpl = JSON.parse(asset.asset.value);
    tmpl.order.forEach((key, i) => {
      const type = tmpl.sections[key]?.type;
      const isShowroom = key.startsWith('showroom_');
      console.log(`  ${String(i+1).padStart(2)}. ${key} (${type})${isShowroom ? ' ← SHOWROOM' : ''}`);
    });
  }
}
main().catch(console.error);
