#!/usr/bin/env node
/**
 * pull_homepage.js — Pull latest index.json + all rueiv section files from live theme
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;
const REST    = `https://${store}/admin/api/${ver}`;

async function getAsset(key) {
  const r = await fetch(`${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const d = await r.json();
  return d.asset ? d.asset.value : null;
}

async function main() {
  console.log('Pulling from live theme...\n');

  // 1. index.json
  const idx = await getAsset('templates/index.json');
  if (idx) {
    const parsed = JSON.parse(idx);
    fs.mkdirSync('theme/templates', { recursive: true });
    fs.writeFileSync('theme/templates/index.json', JSON.stringify(parsed, null, 2));
    console.log(`✓ index.json — ${Object.keys(parsed.sections).length} sections`);
    console.log(`  Order: ${parsed.order.join(', ')}`);
  } else {
    console.error('✗ Could not fetch index.json');
  }

  // 2. All rueiv section files
  const sectionFiles = [
    'rueiv-hero.liquid',
    'rueiv-category-grid.liquid',
    'rueiv-quick-ship.liquid',
    'rueiv-new-arrivals.liquid',
    'rueiv-vibe-studio.liquid',
    'rueiv-featured-designers.liquid',
    'rueiv-lookbook.liquid',
    'rueiv-newsletter.liquid',
    'rueiv-closing-banner.liquid',
    'rueiv-events.liquid',
    'rueiv-testimonials.liquid'
  ];

  for (const file of sectionFiles) {
    const content = await getAsset(`sections/${file}`);
    if (content) {
      fs.writeFileSync(`theme/sections/${file}`, content);
      console.log(`✓ sections/${file}`);
    }
  }

  // 3. CSS
  const css = await getAsset('assets/rueiv-homepage.css');
  if (css) {
    fs.writeFileSync('theme/assets/rueiv-homepage.css', css);
    console.log(`✓ assets/rueiv-homepage.css (${css.length} chars)`);
  }

  console.log('\nDone — local files synced with live theme.');
}

main().catch(e => { console.error(e); process.exit(1); });
