#!/usr/bin/env node
'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

async function gql(query) {
  const r = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query })
  });
  return r.json();
}

async function run() {
  let cursor = null;
  const unmapped = [];
  const mapped = [];

  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50${after}) {
        edges { cursor node { id handle title productType vendor
          featuredImage { url }
          metafields(first: 30) {
            edges { node { namespace key value } }
          }
        }}
        pageInfo { hasNextPage }
      }
    }`);

    for (const e of result.data.products.edges) {
      const mf = {};
      for (const m of e.node.metafields.edges) {
        mf[`${m.node.namespace}.${m.node.key}`] = m.node.value;
      }
      const conf = parseFloat(mf['taxonomy.color_confidence'] || '0');
      const entry = {
        title: e.node.title,
        type: e.node.productType,
        vendor: e.node.vendor,
        rawColor: mf['specs.color'] || '',
        colorFamily: mf['taxonomy.color_family'] || '',
        confidence: conf,
        source: mf['taxonomy.color_source'] || '',
        hasImage: !!e.node.featuredImage,
        imageUrl: e.node.featuredImage?.url || ''
      };
      if (conf === 0 || !mf['taxonomy.color_family']) {
        unmapped.push(entry);
      } else {
        mapped.push(entry);
      }
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
  }

  console.log(`=== MAPPED (${mapped.length}) ===`);
  for (const m of mapped) {
    console.log(`  ${m.title.padEnd(45)} → ${m.colorFamily.padEnd(12)} (${m.confidence}) [${m.source}]`);
  }

  console.log(`\n=== UNMAPPED (${unmapped.length}) ===`);
  for (const u of unmapped) {
    console.log(`  ${u.title.padEnd(45)} | raw: ${(u.rawColor || '(empty)').padEnd(35)} | src: ${u.source.padEnd(14)} | img: ${u.hasImage ? 'YES' : 'NO'}`);
  }

  // Breakdown
  const bySource = {};
  for (const u of unmapped) {
    const s = u.source || 'none';
    bySource[s] = (bySource[s] || 0) + 1;
  }
  console.log(`\n=== UNMAPPED BREAKDOWN ===`);
  for (const [s, c] of Object.entries(bySource)) console.log(`  ${s}: ${c}`);
  console.log(`  with image:    ${unmapped.filter(u => u.hasImage).length}`);
  console.log(`  without image: ${unmapped.filter(u => !u.hasImage).length}`);

  // By vendor
  const byVendor = {};
  for (const u of unmapped) {
    byVendor[u.vendor] = (byVendor[u.vendor] || 0) + 1;
  }
  console.log(`\n=== UNMAPPED BY VENDOR ===`);
  for (const [v, c] of Object.entries(byVendor)) console.log(`  ${v}: ${c}`);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
