#!/usr/bin/env node
require('dotenv').config();
const https = require('https');
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER   = process.env.SHOPIFY_API_VERSION;

function gql(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: STORE, path: `/admin/api/${VER}/graphql.json`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
      family: 4
    }, res => { let d=''; res.on('data', c => d+=c); res.on('end', () => {
      try { resolve(JSON.parse(d).data); } catch(e){reject(e);}
    }); });
    req.on('error', reject); req.end(body);
  });
}

(async () => {
  const v = await gql(`{
    furniture: productsCount(query: "tag:'category:furniture'") { count }
    lighting: productsCount(query: "tag:'category:lighting'") { count }
    accessories: productsCount(query: "tag:'category:accessories'") { count }
    textiles: productsCount(query: "tag:'category:textiles'") { count }
    wallcovering: productsCount(query: "tag:'category:wallcovering'") { count }
  }`);
  console.log('Current category tag counts:');
  console.log('  furniture:   ', v.furniture.count);
  console.log('  lighting:    ', v.lighting.count);
  console.log('  accessories: ', v.accessories.count);
  console.log('  textiles:    ', v.textiles.count);
  console.log('  wallcovering:', v.wallcovering.count);
  const total = v.furniture.count + v.lighting.count + v.accessories.count + v.textiles.count + v.wallcovering.count;
  console.log('  TOTAL:       ', total, '(target: each product = 1 category, so ~2757)');
  
  // Also check multi-tagged products
  let multiTagged = 0;
  let cursor = null;
  for (let page = 0; page < 100; page++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      products(first: 100${after}) {
        edges { cursor node { id tags } }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of data.products.edges) {
      const cats = e.node.tags.filter(t => t.startsWith('category:'));
      if (cats.length > 1) multiTagged++;
      cursor = e.cursor;
    }
    if (!data.products.pageInfo.hasNextPage) break;
  }
  console.log('\n  Multi-tagged products:', multiTagged, '(target: 0)');
})();
