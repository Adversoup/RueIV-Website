#!/usr/bin/env node
// Full metafield audit across all products
require('dotenv').config();

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const STORE = process.env.SHOPIFY_STORE;
const API_VER = process.env.SHOPIFY_API_VERSION;

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VER}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function fetchAllProducts() {
  let cursor = null;
  const all = [];
  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      products(first: 50${afterClause}) {
        edges {
          cursor
          node {
            id title handle vendor productType tags
            featuredImage { url }
            metafields(first: 40) {
              edges { node { namespace key value type } }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }`);
    data.products.edges.forEach(e => all.push(e.node));
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.edges[data.products.edges.length - 1].cursor;
  }
  return all;
}

async function run() {
  const products = await fetchAllProducts();
  console.log(`Total products: ${products.length}\n`);

  const catStats = {};
  const issues = [];

  for (const p of products) {
    const mfMap = {};
    p.metafields.edges.forEach(e => {
      mfMap[`${e.node.namespace}.${e.node.key}`] = e.node.value;
    });

    const cat = (p.productType || 'Unknown').toLowerCase();
    if (!catStats[cat]) catStats[cat] = { count: 0, fields: {} };
    catStats[cat].count++;

    // Count each field present
    for (const k of Object.keys(mfMap)) {
      catStats[cat].fields[k] = (catStats[cat].fields[k] || 0) + 1;
    }

    // Check missing critical fields
    const missing = [];

    // Taxonomy (all products)
    if (!mfMap['taxonomy.color_family']) missing.push('taxonomy.color_family');

    // Image (all products)
    if (!mfMap['image.square_src']) missing.push('image.square_src');

    // Category-specific specs
    if (cat === 'fabric') {
      for (const k of ['specs.material', 'specs.color', 'specs.width', 'specs.repeat', 'specs.content']) {
        if (!mfMap[k]) missing.push(k);
      }
    } else if (cat === 'furniture') {
      for (const k of ['specs.material', 'specs.color', 'specs.dimensions']) {
        if (!mfMap[k]) missing.push(k);
      }
    } else if (cat === 'lighting') {
      for (const k of ['specs.material', 'specs.color']) {
        if (!mfMap[k]) missing.push(k);
      }
    } else if (cat === 'wallpaper') {
      for (const k of ['specs.material', 'specs.color', 'specs.width', 'specs.repeat']) {
        if (!mfMap[k]) missing.push(k);
      }
    }

    if (missing.length > 0) {
      issues.push({
        title: p.title,
        handle: p.handle,
        vendor: p.vendor,
        category: cat,
        missing,
        mfCount: Object.keys(mfMap).length,
        hasImage: !!p.featuredImage
      });
    }
  }

  // Print category summaries
  for (const [cat, data] of Object.entries(catStats).sort()) {
    console.log(`=== ${cat.toUpperCase()} (${data.count} products) ===`);
    const sorted = Object.entries(data.fields).sort((a, b) => b[1] - a[1]);
    for (const [k, cnt] of sorted) {
      const pct = Math.round(cnt / data.count * 100);
      const flag = pct < 100 ? ' ⚠️' : ' ✅';
      console.log(`  ${k}: ${cnt}/${data.count} (${pct}%)${flag}`);
    }
    console.log('');
  }

  // Print issues
  if (issues.length > 0) {
    console.log(`\n=== PRODUCTS WITH MISSING FIELDS (${issues.length}) ===`);
    for (const i of issues) {
      console.log(`  [${i.category}] ${i.title} (${i.vendor}) — missing: ${i.missing.join(', ')} (has ${i.mfCount} mf, img: ${i.hasImage})`);
    }

    // Summary by missing field
    console.log('\n=== MISSING FIELD SUMMARY ===');
    const fieldCounts = {};
    for (const i of issues) {
      for (const f of i.missing) {
        fieldCounts[f] = (fieldCounts[f] || 0) + 1;
      }
    }
    for (const [f, cnt] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${f}: ${cnt} products missing`);
    }
  } else {
    console.log('✅ All products have complete metafields!');
  }

  // Overall score
  const total = products.length;
  const clean = total - issues.length;
  console.log(`\n=== OVERALL: ${clean}/${total} products fully populated (${Math.round(clean/total*100)}%) ===`);
}

run().catch(console.error);
