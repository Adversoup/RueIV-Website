#!/usr/bin/env node
/**
 * scripts/taxonomy_report.js
 * ──────────────────────────
 * Generates 5 taxonomy health reports as CSV files:
 *   1. missing_taxonomy.csv   — Products missing color_family
 *   2. low_confidence.csv     — Products with color_confidence < 0.5
 *   3. missing_images.csv     — Products without featured image
 *   4. override_audit.csv     — Products with any override.* metafield set
 *   5. collection_health.csv  — Collections with product counts
 *
 * Usage:
 *   node scripts/taxonomy_report.js
 *
 * Output:
 *   out/reports/missing_taxonomy.csv
 *   out/reports/low_confidence.csv
 *   out/reports/missing_images.csv
 *   out/reports/override_audit.csv
 *   out/reports/collection_health.csv
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const STORE   = process.env.SHOPIFY_STORE;
const API_VER = process.env.SHOPIFY_API_VERSION;

const OUT_DIR = path.join(__dirname, '..', 'out', 'reports');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VER}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

function writeCsv(filename, headers, rows) {
  const fp = path.join(OUT_DIR, filename);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const val = (row[h] || '').toString().replace(/"/g, '""');
      return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
    }).join(','));
  }
  fs.writeFileSync(fp, lines.join('\n') + '\n', 'utf8');
  console.log(`  ✓ ${filename} — ${rows.length} rows`);
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
            id title handle vendor productType
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

async function fetchCollections() {
  let cursor = null;
  const all = [];
  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      collections(first: 100${afterClause}) {
        edges {
          cursor
          node {
            id title handle productsCount { count }
            ruleSet { rules { column relation condition } }
          }
        }
        pageInfo { hasNextPage }
      }
    }`);
    data.collections.edges.forEach(e => all.push(e.node));
    if (!data.collections.pageInfo.hasNextPage) break;
    cursor = data.collections.edges[data.collections.edges.length - 1].cursor;
  }
  return all;
}

async function run() {
  console.log('Generating taxonomy health reports...\n');

  const products = await fetchAllProducts();
  console.log(`  Fetched ${products.length} products`);

  // Build metafields map per product
  const productData = products.map(p => {
    const mf = {};
    p.metafields.edges.forEach(e => {
      mf[`${e.node.namespace}.${e.node.key}`] = e.node.value;
    });
    return { ...p, mf };
  });

  // ── Report 1: Missing Taxonomy ──
  const missingTaxonomy = productData
    .filter(p => {
      const cf = p.mf['taxonomy.color_family'];
      return !cf || cf.trim() === '';
    })
    .map(p => ({
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      product_type: p.productType,
      has_image: p.featuredImage ? 'yes' : 'no',
      specs_color: p.mf['specs.color'] || ''
    }));
  writeCsv('missing_taxonomy.csv', ['handle', 'title', 'vendor', 'product_type', 'has_image', 'specs_color'], missingTaxonomy);

  // ── Report 2: Low Confidence ──
  const lowConfidence = productData
    .filter(p => {
      const conf = parseFloat(p.mf['taxonomy.color_confidence'] || '1.0');
      return conf < 0.5;
    })
    .map(p => ({
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      color_family: p.mf['taxonomy.color_family'] || '',
      confidence: p.mf['taxonomy.color_confidence'] || '',
      source: p.mf['taxonomy.color_source'] || ''
    }));
  writeCsv('low_confidence.csv', ['handle', 'title', 'vendor', 'color_family', 'confidence', 'source'], lowConfidence);

  // ── Report 3: Missing Images ──
  const missingImages = productData
    .filter(p => !p.featuredImage)
    .map(p => ({
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      product_type: p.productType
    }));
  writeCsv('missing_images.csv', ['handle', 'title', 'vendor', 'product_type'], missingImages);

  // ── Report 4: Override Audit ──
  const overrideAudit = productData
    .filter(p => {
      return Object.keys(p.mf).some(k => k.startsWith('override.'));
    })
    .map(p => {
      const overrides = Object.entries(p.mf)
        .filter(([k]) => k.startsWith('override.'))
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      return {
        handle: p.handle,
        title: p.title,
        vendor: p.vendor,
        overrides
      };
    });
  writeCsv('override_audit.csv', ['handle', 'title', 'vendor', 'overrides'], overrideAudit);

  // ── Report 5: Collection Health ──
  const collections = await fetchCollections();
  console.log(`  Fetched ${collections.length} collections`);

  const collectionHealth = collections.map(c => {
    const ruleType = c.ruleSet?.rules?.length > 0 ? 'smart' : 'manual';
    const ruleCount = c.ruleSet?.rules?.length || 0;
    return {
      handle: c.handle,
      title: c.title,
      products: c.productsCount?.count || 0,
      type: ruleType,
      rules: ruleCount,
      status: (c.productsCount?.count || 0) < 3 ? 'SPARSE' : 'OK'
    };
  }).sort((a, b) => a.products - b.products);

  writeCsv('collection_health.csv', ['handle', 'title', 'products', 'type', 'rules', 'status'], collectionHealth);

  // ── Summary ──
  console.log('\n=== SUMMARY ===');
  console.log(`  Missing taxonomy:  ${missingTaxonomy.length} products`);
  console.log(`  Low confidence:    ${lowConfidence.length} products`);
  console.log(`  Missing images:    ${missingImages.length} products`);
  console.log(`  With overrides:    ${overrideAudit.length} products`);
  console.log(`  Sparse collections: ${collectionHealth.filter(c => c.status === 'SPARSE').length} / ${collectionHealth.length}`);
  console.log(`\nReports saved to: ${OUT_DIR}`);
}

run().catch(console.error);
