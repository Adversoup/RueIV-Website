#!/usr/bin/env node
/**
 * ingest_source143_af_cohort.js
 * Validates and copies Source#143 Artistic Frame cohort into fixtures/artistic_frame_demo/.
 * READ-ONLY toward Hub/Shopify — local fixture ingest only.
 *
 * Accepts either legacy layout:
 *   manifest.json + products.json
 * Or Source#143 readiness layout:
 *   artistic_frame_showcase_cohort_manifest.json
 *   artistic_frame_shopify_export_payload.json
 *
 * Usage:
 *   node scripts/ingest_source143_af_cohort.js --from /path/to/source143/export
 *   node scripts/ingest_source143_af_cohort.js --from /path \
 *     --manifest-fingerprint c07ee64f… --export-fingerprint 23fe3122…
 *   node scripts/ingest_source143_af_cohort.js --from /path --bootstrap
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { ROOT, fixtureDir } = require('../lib/af_demo_paths');
const FIXTURE_DIR = fixtureDir();
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const MAX_PRODUCTS = DEMO_CONFIG.limits.max_products;
const VENDOR_NAME = DEMO_CONFIG.vendor.display_name;

const SOURCE_MANIFEST_NAMES = [
  'artistic_frame_showcase_cohort_manifest.json',
  'manifest.json',
];
const SOURCE_EXPORT_NAMES = [
  'artistic_frame_shopify_export_payload.json',
  'products.json',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let fromDir = process.env.SOURCE143_DIR || null;
  let fingerprint = process.env.SOURCE143_FINGERPRINT || null;
  let exportFingerprint = process.env.SOURCE143_EXPORT_FINGERPRINT || null;
  let bootstrap = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      fromDir = args[i + 1];
      i++;
    } else if (args[i] === '--fingerprint' && args[i + 1]) {
      fingerprint = args[i + 1];
      i++;
    } else if (args[i] === '--manifest-fingerprint' && args[i + 1]) {
      fingerprint = args[i + 1];
      i++;
    } else if (args[i] === '--export-fingerprint' && args[i + 1]) {
      exportFingerprint = args[i + 1];
      i++;
    } else if (args[i] === '--bootstrap') {
      bootstrap = true;
    }
  }

  if (!fromDir) {
    console.error(`Usage: node scripts/ingest_source143_af_cohort.js --from /path/to/source143/export
       [--manifest-fingerprint <hash>] [--export-fingerprint <hash>] [--bootstrap]`);
    process.exit(1);
  }

  return { fromDir: path.resolve(fromDir), fingerprint, exportFingerprint, bootstrap };
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveSourceFiles(fromDir) {
  const manifestPath = SOURCE_MANIFEST_NAMES
    .map((name) => path.join(fromDir, name))
    .find((p) => fs.existsSync(p));
  const exportPath = SOURCE_EXPORT_NAMES
    .map((name) => path.join(fromDir, name))
    .find((p) => fs.existsSync(p));

  if (!manifestPath) {
    throw new Error(`Missing manifest in ${fromDir}. Expected one of: ${SOURCE_MANIFEST_NAMES.join(', ')}`);
  }
  if (!exportPath) {
    throw new Error(`Missing export in ${fromDir}. Expected one of: ${SOURCE_EXPORT_NAMES.join(', ')}`);
  }

  return { manifestPath, exportPath };
}

function vendorName(record) {
  if (typeof record.brand === 'string') return record.brand;
  return record.canonical_vendor || record.brand?.display_name || null;
}

function extractProducts(exportDoc) {
  if (Array.isArray(exportDoc)) return exportDoc;
  if (Array.isArray(exportDoc.products)) return exportDoc.products;
  if (Array.isArray(exportDoc.records)) return exportDoc.records;
  if (Array.isArray(exportDoc.payload)) return exportDoc.payload;
  throw new Error('Export payload must be an array or contain products/records/payload array');
}

function validateProducts(products) {
  if (!Array.isArray(products)) {
    throw new Error('products export must be an array');
  }
  if (products.length === 0) {
    throw new Error('products export is empty');
  }
  if (products.length > MAX_PRODUCTS) {
    throw new Error(`Cohort exceeds max ${MAX_PRODUCTS}: got ${products.length}`);
  }

  const issues = [];
  for (const p of products) {
    const vendor = vendorName(p);
    if (vendor !== VENDOR_NAME) {
      issues.push(`SKU ${p.sku || '?'}: vendor must be "${VENDOR_NAME}" (got ${vendor || 'null'})`);
    }
    if (!p.sku) issues.push('Record missing sku');
    if (!p.title) issues.push(`SKU ${p.sku || '?'}: missing title`);
  }

  if (issues.length) {
    throw new Error(`Validation failed:\n- ${issues.join('\n- ')}`);
  }
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function verifyFingerprint(label, expected, actualDoc) {
  if (!expected) return;
  const computed = sha256Json(actualDoc);
  if (computed !== expected) {
    throw new Error(`${label} fingerprint mismatch: expected ${expected}, computed ${computed}`);
  }
}

function main() {
  const { fromDir, fingerprint, exportFingerprint, bootstrap } = parseArgs();
  const { manifestPath, exportPath } = resolveSourceFiles(fromDir);

  const srcManifest = loadJson(manifestPath, 'Source#143 manifest');
  const exportDoc = loadJson(exportPath, 'Source#143 export');
  const products = extractProducts(exportDoc);
  validateProducts(products);

  const checksum = sha256Json(products);
  const srcChecksum = srcManifest.manifest?.checksum_sha256
    || srcManifest.checksum_sha256
    || srcManifest.export_checksum_sha256;
  if (srcChecksum && srcChecksum !== checksum) {
    throw new Error(`Checksum mismatch: manifest=${srcChecksum}, computed=${checksum}`);
  }

  const resolvedFingerprint = fingerprint
    || srcManifest.source?.fingerprint
    || srcManifest.fingerprint
    || null;
  const resolvedExportFingerprint = exportFingerprint
    || srcManifest.export_fingerprint
    || exportDoc.fingerprint
    || exportDoc.export_fingerprint
    || null;

  if (!bootstrap) {
    verifyFingerprint('Manifest', fingerprint, srcManifest);
    verifyFingerprint('Export', exportFingerprint, exportDoc);
  }

  const isBootstrap = bootstrap || srcManifest.mode === 'bootstrap_public_refs' || exportDoc.mode === 'bootstrap_public_refs';
  if (!resolvedFingerprint && !isBootstrap) {
    console.warn('WARN: No Source#143 manifest fingerprint — manifest will record fingerprint=null');
  }

  if (!fs.existsSync(FIXTURE_DIR)) fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  fs.writeFileSync(path.join(FIXTURE_DIR, 'products.json'), JSON.stringify(products, null, 2));

  const outManifest = {
    version: '1.0.0',
    gate: isBootstrap ? 'ARTISTIC_FRAME_SOURCE143_BOOTSTRAP_PUBLIC_REFS' : 'ARTISTIC_FRAME_SOURCE143_COHORT_INGESTED',
    generated_at: new Date().toISOString(),
    mode: isBootstrap ? 'bootstrap_public_refs' : 'source143_ingested',
    live_mutation: false,
    source: {
      upstream: DEMO_CONFIG.upstream.source_issue,
      status: isBootstrap ? 'bootstrap_fallback' : 'ingested',
      fingerprint: resolvedFingerprint,
      export_fingerprint: resolvedExportFingerprint,
      ingested_at: new Date().toISOString(),
      ingest_from: fromDir,
      source_files: {
        manifest: path.basename(manifestPath),
        export: path.basename(exportPath),
      },
      source_commit: srcManifest.upstream?.source_commit || exportDoc.upstream?.source_commit || null,
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
      source143_selection_rules: srcManifest.manifest?.selection_rules
        || srcManifest.selection_rules
        || [],
    },
    scaffold: {
      enabled: false,
      note: isBootstrap
        ? 'Bootstrap public-ref cohort — live sync blocked until verified Source#143 ingest'
        : 'Source#143 cohort ingested — scaffold disabled',
    },
  };

  fs.writeFileSync(path.join(FIXTURE_DIR, 'manifest.json'), JSON.stringify(outManifest, null, 2));

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Artistic Frame Source#143 ${isBootstrap ? 'bootstrap' : 'cohort ingested'}${' '.repeat(isBootstrap ? 15 : 16)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Records: ${products.length} (max ${MAX_PRODUCTS})`);
  console.log(`Checksum: ${checksum}`);
  console.log(`Manifest fingerprint: ${resolvedFingerprint || '(none)'}`);
  console.log(`Export fingerprint: ${resolvedExportFingerprint || '(none)'}`);
  console.log(`Output: ${FIXTURE_DIR}`);
  if (isBootstrap) {
    console.log('\nBLOCKED FOR LIVE: bootstrap fallback — ingest real Source#143 export with matching fingerprints.');
  } else {
    console.log('\nNext: npm run af-demo:preflight');
  }
}

try {
  main();
} catch (err) {
  console.error('INGEST FAILED:', err.message);
  process.exit(1);
}
