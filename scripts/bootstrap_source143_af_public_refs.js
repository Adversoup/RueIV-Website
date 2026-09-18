#!/usr/bin/env node
/**
 * bootstrap_source143_af_public_refs.js
 * Fallback when RueIV-Source#143 is not accessible: builds a deterministic
 * 30-product Hub-shaped cohort from artisticframe.com public image refs.
 *
 * NOT a substitute for Source#143 fingerprints — use ingest after real export lands.
 *
 * Usage:
 *   node scripts/bootstrap_source143_af_public_refs.js
 *   node scripts/bootstrap_source143_af_public_refs.js --count 30 --write-fixture
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'fixtures', 'artistic_frame_demo');
const OUT_DIR = path.join(ROOT, 'out', 'source143_bootstrap');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const VENDOR_NAME = DEMO_CONFIG.vendor.display_name;
const TARGET = DEMO_CONFIG.limits.target_products;
const MAX_PRODUCTS = DEMO_CONFIG.limits.max_products;

const SEARCH_TERMS = [
  'chair', 'sofa', 'bench', 'ottoman', 'bed', 'mirror', 'console', 'table', 'desk', 'stool',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let count = TARGET;
  let writeFixture = args.includes('--write-fixture');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { count: Math.min(count, MAX_PRODUCTS), writeFixture };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'RueIV-AF-Demo-Bootstrap/1.0 (+https://github.com/Adversoup/RueIV-Website)' },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

async function discoverItemIds() {
  const ids = new Set();
  for (const term of SEARCH_TERMS) {
    try {
      const html = await fetchText(`https://www.artisticframe.com/search/${encodeURIComponent(term)}`);
      const matches = html.match(/browse\/item\/(\d+)/g) || [];
      for (const m of matches) ids.add(m.replace('browse/item/', ''));
      await sleep(150);
    } catch (err) {
      console.warn(`WARN: search "${term}" failed: ${err.message}`);
    }
  }
  return [...ids].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

function titleFromDescription(desc, sku) {
  const cleaned = (desc || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return `Artistic Frame ${sku}`;
  const sentence = cleaned.split(/[.!?]/)[0].trim();
  if (sentence.length < 8) return `Artistic Frame ${sku}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function parseProductPage(html, itemId) {
  const skuMatch = html.match(/Model Number:\s*([A-Za-z0-9\-]+)/i);
  const sku = skuMatch?.[1] || itemId;
  const descMatch = html.match(/class="productDescription[^"]*"[^>]*>\s*([^<]+)/i);
  const description = (descMatch?.[1] || '').replace(/\s+/g, ' ').trim();
  const imageMatches = [...html.matchAll(/public\/img\/items\/3\/([^"?]+\.(?:jpg|jpeg|png|webp))/gi)];
  const images = [...new Set(imageMatches.map((m) => `https://www.artisticframe.com/public/img/items/3/${m[1]}`))];

  if (!description && images.length === 0) return null;

  return {
    sku,
    title: titleFromDescription(description, sku),
    canonical_vendor: VENDOR_NAME,
    category: 'furniture',
    status: 'APPROVED',
    price: '0',
    price_authority: 'trade',
    description_html: description ? `<p>${description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '',
    images,
    brand: {
      tier: 'partner',
      collection_handle: DEMO_CONFIG.vendor.handle,
    },
    _bootstrap: {
      item_id: itemId,
      image_resolver_pattern: 'https://www.artisticframe.com/public/img/items/3/{filename}',
    },
  };
}

async function buildCohort(count) {
  const itemIds = await discoverItemIds();
  console.log(`Discovered ${itemIds.length} browse/item IDs from public search`);

  const products = [];
  for (const itemId of itemIds) {
    if (products.length >= count + 10) break;
    try {
      const html = await fetchText(`https://www.artisticframe.com/browse/item/${itemId}`);
      const product = parseProductPage(html, itemId);
      if (product && product.images.length > 0) {
        if (!products.some((p) => p.sku === product.sku)) products.push(product);
      }
      await sleep(120);
    } catch (err) {
      console.warn(`WARN: item ${itemId}: ${err.message}`);
    }
  }

  products.sort((a, b) => String(a.sku).localeCompare(String(b.sku), 'en', { numeric: true }));
  const selected = products.slice(0, count);

  if (selected.length < count) {
    throw new Error(`Only resolved ${selected.length}/${count} products from public refs`);
  }

  return selected.map(({ _bootstrap, ...rest }) => rest);
}

function writeBootstrapExport(products, count) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const exportPayload = {
    version: '1.0.0',
    gate: 'ARTISTIC_FRAME_SHOPIFY_EXPORT_PAYLOAD_BOOTSTRAP',
    vendor: VENDOR_NAME,
    generated_at: new Date().toISOString(),
    mode: 'bootstrap_public_refs',
    upstream: {
      note: 'Fallback bootstrap — replace with RueIV-Source#143 export when accessible',
      expected_manifest_fingerprint: 'c07ee64f47fc0dc9359389cc52f1d7a1e06de6bc0528dade8715a78f3d632989',
      expected_export_fingerprint: '23fe31223434e84d9e677a2bc0efccb41c43e4a6ed6e0f500b833168ffcba434',
      source_branch: 'cursor/artistic-frame-client-demo-143-32eb',
      source_commit: '04e009bba3988096307add331e28d95945d378cc',
    },
    products,
  };

  const cohortManifest = {
    version: '1.0.0',
    gate: 'ARTISTIC_FRAME_SHOWCASE_COHORT_MANIFEST_BOOTSTRAP',
    vendor: VENDOR_NAME,
    generated_at: new Date().toISOString(),
    mode: 'bootstrap_public_refs',
    selection_rules: [
      'Public-ref fallback: scrape artisticframe.com browse/search pages',
      'Deterministic select: sort by sku ascending, take first N',
      `Target cohort size: ${count}`,
    ],
    manifest: {
      selected_records: products.length,
      checksum_sha256: crypto.createHash('sha256').update(JSON.stringify(products)).digest('hex'),
      selection_rules: ['sort_by_sku_asc', `take_first_${count}`],
    },
    fingerprint: null,
    export_fingerprint: crypto.createHash('sha256').update(JSON.stringify(exportPayload)).digest('hex'),
  };

  fs.writeFileSync(
    path.join(OUT_DIR, 'artistic_frame_shopify_export_payload.json'),
    JSON.stringify(exportPayload, null, 2)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'artistic_frame_showcase_cohort_manifest.json'),
    JSON.stringify(cohortManifest, null, 2)
  );

  return OUT_DIR;
}

function writeFixtureDirect(products) {
  if (!fs.existsSync(FIXTURE_DIR)) fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const checksum = crypto.createHash('sha256').update(JSON.stringify(products)).digest('hex');

  fs.writeFileSync(path.join(FIXTURE_DIR, 'products.json'), JSON.stringify(products, null, 2));
  fs.writeFileSync(path.join(FIXTURE_DIR, 'manifest.json'), JSON.stringify({
    version: '1.0.0',
    gate: 'ARTISTIC_FRAME_SOURCE143_BOOTSTRAP_PUBLIC_REFS',
    generated_at: new Date().toISOString(),
    mode: 'bootstrap_public_refs',
    live_mutation: false,
    source: {
      upstream: DEMO_CONFIG.upstream.source_issue,
      status: 'bootstrap_fallback',
      fingerprint: null,
      export_fingerprint: null,
      ingested_at: new Date().toISOString(),
      note: 'Public-ref bootstrap — NOT Source#143 verified. Live sync blocked until real export ingested with matching fingerprints.',
      expected_manifest_fingerprint: 'c07ee64f47fc0dc9359389cc52f1d7a1e06de6bc0528dade8715a78f3d632989',
      expected_export_fingerprint: '23fe31223434e84d9e677a2bc0efccb41c43e4a6ed6e0f500b833168ffcba434',
    },
    demo: {
      vendor_display_name: VENDOR_NAME,
      vendor_handle: DEMO_CONFIG.vendor.handle,
      collection_handle: DEMO_CONFIG.collection.handle,
      collection_title: DEMO_CONFIG.collection.title,
      max_products: MAX_PRODUCTS,
      target_products: TARGET,
      price_hidden: DEMO_CONFIG.policy.price_hidden,
      hidden_from_navigation: DEMO_CONFIG.collection.hidden_from_navigation,
      default_product_status: DEMO_CONFIG.policy.default_product_status,
    },
    manifest: {
      selected_records: products.length,
      checksum_sha256: checksum,
      products_file: 'products.json',
      source143_selection_rules: ['bootstrap_public_refs_sort_by_sku'],
    },
    scaffold: {
      enabled: false,
      note: 'Bootstrap cohort — not scaffold; still blocked for live until Source#143 ingest',
    },
  }, null, 2));
}

async function main() {
  const { count, writeFixture } = parseArgs();
  console.log(`Bootstrapping ${count} Artistic Frame products from public refs…`);

  const products = await buildCohort(count);
  const exportDir = writeBootstrapExport(products, count);

  if (writeFixture) {
    writeFixtureDirect(products);
    console.log(`Fixture written: ${FIXTURE_DIR}/products.json (${products.length} records)`);
  } else {
    const ingest = spawnSync(
      process.execPath,
      [path.join(__dirname, 'ingest_source143_af_cohort.js'), '--from', exportDir, '--bootstrap'],
      { stdio: 'inherit', cwd: ROOT }
    );
    if (ingest.status !== 0) process.exit(ingest.status || 1);
  }

  console.log('\nBootstrap export dir:', exportDir);
  console.log('SKUs:', products.map((p) => p.sku).join(', '));
  console.log('\nNOTE: This is a public-ref fallback. For live demo, ingest real Source#143 export:');
  console.log('  node scripts/ingest_source143_af_cohort.js --from /path/to/source143/export \\');
  console.log('    --manifest-fingerprint c07ee64f… --export-fingerprint 23fe3122…');
}

main().catch((err) => {
  console.error('BOOTSTRAP FAILED:', err.message);
  process.exit(1);
});
