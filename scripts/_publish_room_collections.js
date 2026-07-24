#!/usr/bin/env node
require('dotenv').config();
const S = process.env.SHOPIFY_STORE;
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION;

const handles = ['living-room', 'bedroom', 'dining-room', 'office', 'outdoor', 'hospitality'];

async function run() {
  for (const h of handles) {
    // Find collection
    const r = await fetch(`https://${S}/admin/api/${V}/smart_collections.json?handle=${h}`, {
      headers: { 'X-Shopify-Access-Token': T }
    });
    const d = await r.json();
    const col = (d.smart_collections || [])[0];
    if (!col) { console.log(h, '- NOT FOUND'); continue; }

    // Publish it
    const r2 = await fetch(`https://${S}/admin/api/${V}/smart_collections/${col.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
      body: JSON.stringify({ smart_collection: { id: col.id, published: true } })
    });
    const d2 = await r2.json();
    const pub = d2.smart_collection ? d2.smart_collection.published_at : 'FAILED';
    console.log(h, '- published_at:', pub);
  }
}

run().catch(e => console.error(e));
