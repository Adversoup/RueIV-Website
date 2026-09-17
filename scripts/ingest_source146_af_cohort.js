#!/usr/bin/env node
/**
 * ingest_source146_af_cohort.js
 * Ingest Source#146 enriched/polished AF demo payload into fixtures/artistic_frame_demo/.
 *
 * Applies quarantine exclusions (2532A, 2588S) and requires upstream gate:
 *   ARTISTIC_FRAME_DEMO_POPULATED_ENRICHED_READY_FOR_SHOPIFY_SYNC
 *
 * Usage:
 *   node scripts/ingest_source146_af_cohort.js --from /path/to/source146/export
 *   node scripts/ingest_source146_af_cohort.js --from /path \
 *     --manifest-fingerprint <hash> --export-fingerprint <hash>
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const REQUIRED_GATE = DEMO_CONFIG.upstream.required_gate;
const EXCLUDED_SKUS = new Set(DEMO_CONFIG.cohort?.excluded_skus || []);

const SOURCE146_MANIFEST_NAMES = [
  'artistic_frame_demo_enriched_cohort_manifest.json',
  'artistic_frame_showcase_cohort_manifest.json',
  'artistic_frame_demo_cohort_manifest.json',
  'manifest.json',
];
const SOURCE146_EXPORT_NAMES = [
  'artistic_frame_demo_enriched_export.json',
  'artistic_frame_shopify_export_payload.json',
  'artistic_frame_demo_shopify_export_payload.json',
  'products.json',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let fromDir = process.env.SOURCE146_DIR || null;
  let manifestFingerprint = process.env.SOURCE146_MANIFEST_FINGERPRINT || null;
  let exportFingerprint = process.env.SOURCE146_EXPORT_FINGERPRINT || null;
  let skipGate = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      fromDir = args[i + 1];
      i++;
    } else if (args[i] === '--manifest-fingerprint' && args[i + 1]) {
      manifestFingerprint = args[i + 1];
      i++;
    } else if (args[i] === '--export-fingerprint' && args[i + 1]) {
      exportFingerprint = args[i + 1];
      i++;
    } else if (args[i] === '--skip-gate-check') {
      skipGate = true;
    }
  }

  if (!fromDir) {
    console.error(`Usage: node scripts/ingest_source146_af_cohort.js --from /path/to/source146/export
       [--manifest-fingerprint <hash>] [--export-fingerprint <hash>] [--skip-gate-check]`);
    process.exit(1);
  }

  return {
    fromDir: path.resolve(fromDir),
    manifestFingerprint,
    exportFingerprint,
    skipGate,
  };
}

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveSourceFiles(fromDir) {
  const manifestPath = SOURCE146_MANIFEST_NAMES
    .map((name) => path.join(fromDir, name))
    .find((p) => fs.existsSync(p));
  const exportPath = SOURCE146_EXPORT_NAMES
    .map((name) => path.join(fromDir, name))
    .find((p) => fs.existsSync(p));

  if (!manifestPath) {
    throw new Error(`Missing manifest in ${fromDir}. Expected one of: ${SOURCE146_MANIFEST_NAMES.join(', ')}`);
  }
  if (!exportPath) {
    throw new Error(`Missing export in ${fromDir}. Expected one of: ${SOURCE146_EXPORT_NAMES.join(', ')}`);
  }

  return { manifestPath, exportPath };
}

function extractProducts(exportDoc) {
  if (Array.isArray(exportDoc)) return exportDoc;
  if (Array.isArray(exportDoc.products)) return exportDoc.products;
  if (Array.isArray(exportDoc.records)) return exportDoc.records;
  if (Array.isArray(exportDoc.payload)) return exportDoc.payload;
  throw new Error('Export payload must be an array or contain products/records/payload array');
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

function assertGate(manifest, exportDoc, skipGate) {
  if (skipGate) {
    console.warn('WARN: --skip-gate-check — upstream gate not verified');
    return;
  }
  const gate = manifest.gate || exportDoc.gate || manifest.manifest?.gate;
  if (gate !== REQUIRED_GATE) {
    throw new Error(`Upstream gate mismatch: expected ${REQUIRED_GATE}, got ${gate || '(none)'}`);
  }
}

function filterExcluded(products) {
  const excluded = [];
  const kept = [];
  for (const p of products) {
    if (EXCLUDED_SKUS.has(p.sku)) {
      excluded.push(p.sku);
    } else {
      kept.push(p);
    }
  }
  return { kept, excluded };
}

function main() {
  const { fromDir, manifestFingerprint, exportFingerprint, skipGate } = parseArgs();
  const { manifestPath, exportPath } = resolveSourceFiles(fromDir);

  const srcManifest = loadJson(manifestPath, 'Source#146 manifest');
  const exportDoc = loadJson(exportPath, 'Source#146 export');
  assertGate(srcManifest, exportDoc, skipGate);

  let products = extractProducts(exportDoc);
  const { kept, excluded } = filterExcluded(products);
  products = kept;

  if (excluded.length) {
    console.log(`Excluded SKUs (${excluded.length}): ${excluded.join(', ')}`);
  }
  if (products.length === 0) {
    throw new Error('No products remain after exclusion filter');
  }
  if (products.length > DEMO_CONFIG.limits.max_products) {
    throw new Error(`Cohort exceeds max ${DEMO_CONFIG.limits.max_products}: got ${products.length}`);
  }

  verifyFingerprint('Manifest', manifestFingerprint, srcManifest);
  verifyFingerprint('Export', exportFingerprint, exportDoc);

  const stagingDir = path.join(ROOT, 'out', 'source146_ingest_staging');
  if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });

  fs.writeFileSync(path.join(stagingDir, 'products.json'), JSON.stringify(products, null, 2));
  fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify({
    ...srcManifest,
    gate: REQUIRED_GATE,
    manifest: {
      ...(srcManifest.manifest || {}),
      selected_records: products.length,
      excluded_skus: excluded,
      checksum_sha256: sha256Json(products),
      products_file: 'products.json',
    },
  }, null, 2));

  const ingestArgs = [
    path.join(__dirname, 'ingest_source143_af_cohort.js'),
    '--from', stagingDir,
  ];

  const ingest = spawnSync(process.execPath, ingestArgs, { stdio: 'inherit', cwd: ROOT });
  if (ingest.status !== 0) process.exit(ingest.status || 1);

  const fixtureManifestPath = path.join(ROOT, 'fixtures', 'artistic_frame_demo', 'manifest.json');
  const fixtureManifest = JSON.parse(fs.readFileSync(fixtureManifestPath, 'utf8'));
  fixtureManifest.mode = 'source146_ingested';
  fixtureManifest.gate = 'ARTISTIC_FRAME_SOURCE146_COHORT_INGESTED';
  fixtureManifest.source = {
    ...(fixtureManifest.source || {}),
    upstream: DEMO_CONFIG.upstream.source_issue,
    status: 'ingested',
    required_gate: REQUIRED_GATE,
    excluded_skus: excluded,
    ingested_at: new Date().toISOString(),
    ingest_from: fromDir,
    source_files: {
      manifest: path.basename(manifestPath),
      export: path.basename(exportPath),
    },
  };
  fs.writeFileSync(fixtureManifestPath, JSON.stringify(fixtureManifest, null, 2));

  console.log('\nSource#146 ingest complete.');
  console.log(`Records: ${products.length} (excluded ${excluded.length})`);
  console.log(`Smoke SKU target: ${DEMO_CONFIG.cohort.smoke_sku}`);
  console.log('Next: npm run af-demo:preflight');
}

try {
  main();
} catch (err) {
  console.error('SOURCE146 INGEST FAILED:', err.message);
  process.exit(1);
}
