#!/usr/bin/env node
/**
 * Move showroom sections to the TOP of the homepage,
 * right after the hero slideshow (position 2-6).
 * Does NOT remove or modify any existing sections.
 */
require('dotenv').config();
const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function main() {
  // Read current
  const res = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=templates/index.json`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const j = await res.json();
  const tmpl = JSON.parse(j.asset.value);
  
  console.log('BEFORE:');
  tmpl.order.forEach((k, i) => console.log(`  ${String(i+1).padStart(2)}. ${k}${k.startsWith('showroom_') ? ' ← SHOWROOM' : ''}`));
  
  // Remove showroom keys from current position
  const showroomKeys = ['showroom_categories', 'showroom_quickship', 'showroom_designers', 'showroom_vibe', 'showroom_newsletter'];
  const newOrder = tmpl.order.filter(k => !showroomKeys.includes(k));
  
  // Insert after slideshow (position index 1, i.e. after slideshow_zKPFFV)
  const slideshowIdx = newOrder.indexOf('slideshow_zKPFFV');
  const insertPos = slideshowIdx >= 0 ? slideshowIdx + 1 : 0;
  newOrder.splice(insertPos, 0, ...showroomKeys);
  
  tmpl.order = newOrder;
  
  console.log('\nAFTER:');
  tmpl.order.forEach((k, i) => console.log(`  ${String(i+1).padStart(2)}. ${k}${k.startsWith('showroom_') ? ' ← SHOWROOM' : ''}`));
  
  // Deploy
  const putRes = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key: 'templates/index.json', value: JSON.stringify(tmpl, null, 2) } })
  });
  const putJ = await putRes.json();
  if (putJ.asset) {
    console.log('\n✅ Showroom sections moved to top — right after hero slideshow');
  } else {
    console.error('\n❌ Failed:', JSON.stringify(putJ.errors || putJ));
  }
}
main().catch(console.error);
