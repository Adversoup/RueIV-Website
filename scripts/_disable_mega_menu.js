#!/usr/bin/env node
/**
 * Disable mega menu — remove all rueiv_mega_* blocks from header-group.json
 * The Modiva theme falls back to standard nested dropdowns automatically.
 */
require('dotenv').config();

const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;
const REST    = `https://${store}/admin/api/${ver}`;

async function restGet(p) {
  const r = await fetch(`${REST}${p}`, { headers: { 'X-Shopify-Access-Token': token } });
  return r.json();
}

async function restPut(p, body) {
  const r = await fetch(`${REST}${p}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function main() {
  console.log('━━━ Disabling mega menu ━━━\n');

  // 1. Read current header-group.json
  const getRes = await restGet(`/themes/${themeId}/assets.json?asset[key]=sections/header-group.json`);
  if (!getRes.asset) {
    console.error('Could not read header-group.json:', JSON.stringify(getRes));
    return;
  }

  const data = JSON.parse(getRes.asset.value);
  const header = data.sections?.header;

  if (!header) {
    console.error('No header section found');
    return;
  }

  // 2. Show what we're removing
  const blockKeys = Object.keys(header.blocks || {});
  console.log('Current blocks:', blockKeys.join(', '));

  // 3. Remove all mega menu blocks
  header.blocks = {};
  header.block_order = [];

  console.log('Removed all mega menu blocks');
  console.log('Header settings preserved:', Object.keys(header.settings).join(', '));

  // 4. Write back
  const putRes = await restPut(`/themes/${themeId}/assets.json`, {
    asset: { key: 'sections/header-group.json', value: JSON.stringify(data, null, 2) }
  });

  if (putRes.asset) {
    console.log('\n✅ Mega menu disabled — standard dropdown navigation is now active');
  } else {
    console.error('\n✗ Write failed:', JSON.stringify(putRes.errors || putRes));
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
