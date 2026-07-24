#!/usr/bin/env node
'use strict';
require('dotenv').config();

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const STORE = process.env.SHOPIFY_STORE;

async function test() {
  // Try custom_collections
  let resp = await fetch(`https://${STORE}/admin/api/2024-10/custom_collections.json?limit=1`, {
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Accept': 'application/json' }
  });
  console.log('custom_collections:', resp.status);
  let json = await resp.json();
  if (json.custom_collections?.[0]) {
    const col = json.custom_collections[0];
    console.log('  id:', col.id, 'title:', col.title);
    
    // Try updating image with base64
    const fs = require('fs');
    const path = require('path');
    const tmpDir = path.join(__dirname, '..', 'tmp_wallpaper_crops');
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg'));
    if (files.length > 0) {
      const buf = fs.readFileSync(path.join(tmpDir, files[0]));
      console.log('  Testing PUT with base64 on collection', col.id, '...');
      
      const putResp = await fetch(`https://${STORE}/admin/api/2024-10/custom_collections/${col.id}.json`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Shopify-Access-Token': TOKEN 
        },
        body: JSON.stringify({
          custom_collection: {
            id: col.id,
            image: {
              attachment: buf.toString('base64'),
              filename: 'test-crop.jpg'
            }
          }
        })
      });
      console.log('  PUT status:', putResp.status);
      const putJson = await putResp.json();
      console.log('  image:', putJson.custom_collection?.image?.src?.substring(0, 80) || JSON.stringify(putJson.errors)?.substring(0, 200));
    }
  }

  // Try smart_collections
  resp = await fetch(`https://${STORE}/admin/api/2024-10/smart_collections.json?limit=1`, {
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Accept': 'application/json' }
  });
  console.log('smart_collections:', resp.status);
  json = await resp.json();
  if (json.smart_collections?.[0]) {
    console.log('  id:', json.smart_collections[0].id, 'title:', json.smart_collections[0].title);
  }
}

test().catch(console.error);
