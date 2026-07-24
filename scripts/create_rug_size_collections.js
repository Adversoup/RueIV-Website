#!/usr/bin/env node
/**
 * create_rug_size_collections.js — Creates Smart Collections for rug sizes
 * 
 * Collections: Small Rugs, Medium Rugs, Large Rugs, Oversize Rugs
 * Rules: product_type=Rugs AND tag=size:Small (etc.)
 * 
 * Usage: node scripts/create_rug_size_collections.js
 */

require('dotenv').config();

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const STORE = process.env.SHOPIFY_STORE || 'ruefour.myshopify.com';
const API = `https://${STORE}/admin/api/2024-10`;

async function rest(method, endpoint, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}/${endpoint}`, opts);
  if (r.status === 429) {
    const retry = parseFloat(r.headers.get('Retry-After') || '2');
    console.log(`  Rate limited, waiting ${retry}s...`);
    await new Promise(ok => setTimeout(ok, retry * 1000));
    return rest(method, endpoint, body);
  }
  const data = await r.json();
  if (!r.ok) {
    console.error(`HTTP ${r.status}:`, JSON.stringify(data).slice(0, 300));
    return null;
  }
  return data;
}

const SIZES = [
  { title: 'Small Rugs', handle: 'rugs-small', tag: 'size:Small' },
  { title: 'Medium Rugs', handle: 'rugs-medium', tag: 'size:Medium' },
  { title: 'Large Rugs', handle: 'rugs-large', tag: 'size:Large' },
  { title: 'Oversize Rugs', handle: 'rugs-oversize', tag: 'size:Oversize' },
];

async function main() {
  // Check existing collections
  const existing = await rest('GET', 'smart_collections.json?limit=250');
  const existingHandles = new Set(existing.smart_collections.map(c => c.handle));

  for (const size of SIZES) {
    if (existingHandles.has(size.handle)) {
      console.log(`✓ ${size.handle} already exists, skipping`);
      continue;
    }

    const payload = {
      smart_collection: {
        title: size.title,
        handle: size.handle,
        rules: [
          { column: 'tag', relation: 'equals', condition: 'category:rugs' },
          { column: 'tag', relation: 'equals', condition: size.tag },
        ],
        disjunctive: false, // AND logic
        published: true,
        sort_order: 'best-selling',
      },
    };

    console.log(`Creating ${size.title} (${size.handle})...`);
    const result = await rest('POST', 'smart_collections.json', payload);
    if (result?.smart_collection) {
      console.log(`  ✓ Created: ${result.smart_collection.id}`);
    }
  }

  console.log('\nDone! Collections will populate once tag enrichment completes.');
}

main().catch(console.error);
