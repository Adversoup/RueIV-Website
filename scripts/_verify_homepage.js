#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;
const password = process.env.SHOPIFY_STORE_PASSWORD || 'niebow';

async function getAsset(key) {
  const res = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const j = await res.json();
  return j.asset ? j.asset.value : null;
}

async function fetchStorefront(urlPath) {
  const loginRes = await fetch(`https://${store}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `password=${password}`,
    redirect: 'manual'
  });
  const cookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
  const pageRes = await fetch(`https://${store}${urlPath}`, { headers: { 'Cookie': cookieStr } });
  return pageRes.text();
}

async function main() {
  // Check live index.json sections
  const idx = await getAsset('templates/index.json');
  if (idx) {
    const parsed = JSON.parse(idx);
    const order = parsed.order || [];
    console.log('=== Live Homepage Sections ===');
    console.log('Order:', order);
    Object.entries(parsed.sections || {}).forEach(([key, sec]) => {
      console.log(`  ${key}: type=${sec.type}`);
    });
  }

  // Check storefront renders
  console.log('\n=== Storefront Check ===');
  const html = await fetchStorefront('/');
  
  const checks = [
    ['Slideshow/Hero', html.includes('slideshow') || html.includes('EMBRACE VISION')],
    ['Navigation visible', html.includes('Textiles') && html.includes('Accessories')],
    ['Rich text section', html.includes('rich-text') || html.includes('rich_text')],
    ['Not empty page', html.length > 10000]
  ];
  
  checks.forEach(([name, ok]) => {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  });
  
  console.log(`\nPage size: ${html.length} chars`);
}
main().catch(console.error);
