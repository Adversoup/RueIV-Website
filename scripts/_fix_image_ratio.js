#!/usr/bin/env node
/**
 * Update all showroom homepage sections to use 1:1 (square) image ratio
 */
require('dotenv').config();
const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function main() {
  // Read current index.json
  const res = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=templates/index.json`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const j = await res.json();
  const tmpl = JSON.parse(j.asset.value);

  // Update showroom_categories (collection-list) — card_image_ratio to square
  if (tmpl.sections.showroom_categories) {
    tmpl.sections.showroom_categories.settings.card_image_ratio = 'square';
    console.log('✅ showroom_categories → card_image_ratio: square');
  }

  // Update showroom_designers (collection-list) — card_image_ratio to square
  if (tmpl.sections.showroom_designers) {
    tmpl.sections.showroom_designers.settings.card_image_ratio = 'square';
    console.log('✅ showroom_designers → card_image_ratio: square');
  }

  // Update showroom_quickship (featured-collection) — image_ratio to square
  if (tmpl.sections.showroom_quickship) {
    tmpl.sections.showroom_quickship.settings.image_ratio = 'square';
    tmpl.sections.showroom_quickship.settings.card_image_ratio = 'square';
    console.log('✅ showroom_quickship → image_ratio: square');
  }

  // Also check existing collection_list and other sections for reference
  const existingSections = ['collection_list_Jbx97m', 'custom_content_FQyrQN', 'custom_content_zRk47d'];
  for (const key of existingSections) {
    if (tmpl.sections[key]) {
      const s = tmpl.sections[key].settings;
      console.log(`\n  [existing] ${key}: image_ratio=${s.card_image_ratio || s.image_ratio || 'not set'}`);
    }
  }

  // Deploy
  const putRes = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key: 'templates/index.json', value: JSON.stringify(tmpl, null, 2) } })
  });
  const putJ = await putRes.json();
  if (putJ.asset) console.log('\n✅ All showroom sections updated to 1:1 square images');
  else console.error('\n❌ Failed:', JSON.stringify(putJ.errors || putJ));
}
main().catch(console.error);
