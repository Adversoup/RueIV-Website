#!/usr/bin/env node
/**
 * Restore the original homepage template to the live theme
 */
require('dotenv').config();
const fs = require('fs');
const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function main() {
  // Read the original index.json from git
  const original = fs.readFileSync('/tmp/original_index.json', 'utf-8');
  console.log(`Original homepage: ${original.length} chars, restoring...`);
  
  const res = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key: 'templates/index.json', value: original } })
  });
  const result = await res.json();
  
  if (result.asset) {
    console.log('✅ Homepage restored successfully!');
  } else {
    console.error('❌ Failed:', JSON.stringify(result.errors || result));
  }
}
main().catch(console.error);
