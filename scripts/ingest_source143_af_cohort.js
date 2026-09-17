#!/usr/bin/env node
/**
 * ingest_source143_af_cohort.js
 * Validates and copies Source#143 Artistic Frame cohort into fixtures/artistic_frame_demo/.
 * READ-ONLY toward Hub/Shopify — local fixture ingest only.
 *
 * Usage:
 *   node scripts/ingest_source143_af_cohort.js --from /path/to/source143/export
 *   node scripts/ingest_source143_af_cohort.js --from /path --fingerprint abc123
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'fixtures', 'artistic_frame_demo');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const MAX_PRODUCTS = DEMO_CONFIG.limits.max_products;
const VENDOR_NAME = DEMO_CONFIG.vendor.display_name;

function parseArgs() {
  const args = process.argv.slice(2);
  let fromDir = process.env.SOURCE143_DIR || null;
  let fingerprint = process.env.SOURCE143_FINGERPRINT || null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      fromDir = args[i + 1];
      i++;
    } else if (args[i] === '--fingerprint' && args[i + 1]) {
      fingerprint = args[i + 1];
      i++;
    }
  }

  if (!fromDir) {
    console.error('Usage: node scripts/ingest_source143_af_cohort.js --from /path/to/source143/export [--fingerprint <hash>]');
    process.exit(1);
  }

  return { fromDir: path.resolve(fromDir), fingerprint };
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateProducts(products) {
  if (!Array.isArray(products)) {
    throw new Error('products.json must be an array');
  }
  if (products.length === 0) {
    throw new Error('products.json is empty');
  }
  if (products.length > MAX_PRODUCTS) {
    throw new Error(`Cohort exceeds max ${MAX_PRODUCTS}: got ${products.length}`);
  }

  const issues = [];
  for (const p of products) {
    if ((p.canonical_vendor || p.brand) !== VENDOR_NAME) {
      issues.push(`SKU ${p.sku}: vendor must be "${VENDOR_NAME}"`);
    }
    if (!p.sku) issues.push('Record missing sku');
    if (!p.title) issues.push(`SKU ${p.sku || '?'}: missing title`);
  }

  if (issues.length) {
    throw new Error(`Validation failed:\n- ${issues.join('\n- ')}`);
  }
}

function main() {
  const { fromDir, fingerprint } = parseArgs();
  const srcManifestPath = path.join(fromDir, 'manifest.json');
  const srcProductsPath = path.join(fromDir, 'products.json');

  const srcManifest = loadJson(srcManifestPath, 'Source#143 manifest');
  const products = loadJson(srcProductsPath, 'Source#143 products');
  validateProducts(products);

  const checksum = crypto.createHash('sha256').update(JSON.stringify(products)).digest('hex');
  const srcChecksum = srcManifest.manifest?.checksum_sha256 || srcManifest.checksum_sha256;
  if (srcChecksum && srcChecksum !== checksum) {
    throw new Error(`Checksum mismatch: manifest=${srcChecksum}, computed=${checksum}`);
  }

  const resolvedFingerprint = fingerprint
    || srcManifest.source?.fingerprint
    || srcManifest.fingerprint
    || null;

  if (!resolvedFingerprint) {
    console.warn('WARN: No Source#143 fingerprint provided — manifest will record fingerprint=null');
  }

  if (!fs.existsSync(FIXTURE_DIR)) fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const outProductsPath = path.join(FIXTURE_DIR, 'products.json');
  fs.writeFileSync(outProductsPath, JSON.stringify(products, null, 2));

  const outManifest = {
    version: '1.0.0',
    gate: 'ARTISTIC_FRAME_SOURCE143_COHORT_INGESTED',
    generated_at: new Date().toISOString(),
    mode: 'source143_ingested',
    live_mutation: false,
    source: {
      upstream: DEMO_CONFIG.upstream.source_issue,
      status: 'ingested',
      fingerprint: resolvedFingerprint,
      ingested_at: new Date().toISOString(),
      ingest_from: fromDir,
    },
    demo: {
      vendor_display_name: VENDOR_NAME,
      vendor_handle: DEMO_CONFIG.vendor.handle,
      collection_handle: DEMO_CONFIG.collection.handle,
      collection_title: DEMO_CONFIG.collection.title,
      max_products: MAX_PRODUCTS,
      target_products: DEMO_CONFIG.limits.target_products,
      price_hidden: DEMO_CONFIG.policy.price_hidden,
      hidden_from_navigation: DEMO_CONFIG.collection.hidden_from_navigation,
      default_product_status: DEMO_CONFIG.policy.default_product_status,
    },
    manifest: {
      selected_records: products.length,
      checksum_sha256: checksum,
      products_file: 'products.json',
      source143_selection_rules: srcManifest.manifest?.selection_rules || srcManifest.selection_rules || [],
    },
    scaffold: {
      enabled: false,
      note: 'Source#143 cohort ingested — scaffold disabled',
    },
  };

  fs.writeFileSync(path.join(FIXTURE_DIR, 'manifest.json'), JSON.stringify(outManifest, null, 2));

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Artistic Frame Source#143 cohort ingested               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Records: ${products.length} (max ${MAX_PRODUCTS})`);
  console.log(`Checksum: ${checksum}`);
  console.log(`Fingerprint: ${resolvedFingerprint || '(none)'}`);
  console.log(`Output: ${FIXTURE_DIR}`);
  console.log('\nNext: npm run af-demo:preflight');
}

try {
  main();
} catch (err) {
  console.error('INGEST FAILED:', err.message);
  process.exit(1);
}
