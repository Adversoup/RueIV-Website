#!/usr/bin/env node
/**
 * ingest_source152_af_cohort.js
 * Ingest Source#152 text+price+Hub-processed-media handoff into fixtures/artistic_frame_demo/.
 *
 * Requires upstream gate:
 *   ARTISTIC_FRAME_DEMO_TEXT_PRICE_HUB_PROCESSED_MEDIA_READY_FOR_SHOPIFY_SYNC
 *
 * Handoff contract: exactly 50 products, Hub-processed sync-ready media + authoritative price.
 * Raw vendor image URLs are lineage only — MUST NOT be the final Shopify media source.
 *
 * Usage:
 *   node scripts/ingest_source152_af_cohort.js
 *   node scripts/ingest_source152_af_cohort.js --from fixtures/artistic_frame_demo/source152_handoff
 *   node scripts/ingest_source152_af_cohort.js --from /path/to/source152/export \
 *     --manifest-fingerprint <hash> --export-fingerprint <hash>
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  HUB_PROCESSED_MEDIA_MODE,
  normalizeHandoffProducts,
  validateHubProcessedMediaHandoff,
  validateAuthoritativePrices,
} = require('../lib/af_demo_handoff');

const ROOT = path.resolve(__dirname, '..');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const DEFAULT_HANDOFF_DIR = path.join(ROOT, DEMO_CONFIG.handoff_dir || 'fixtures/artistic_frame_demo/source152_handoff');
const REQUIRED_GATE = DEMO_CONFIG.upstream.required_gate;
const LEGACY_GATES = new Set(DEMO_CONFIG.upstream.legacy_gates || []);

const SOURCE152_MANIFEST_NAMES = [
  'artistic_frame_showcase_cohort_manifest.json',
  'artistic_frame_demo_text_price_hub_processed_manifest.json',
  'artistic_frame_demo_cohort_manifest.json',
  'artistic_frame_demo_enrichment_manifest.json',
  'manifest.json',
];
const SOURCE152_EXPORT_NAMES = [
  'artistic_frame_shopify_export_payload.json',
  'artistic_frame_demo_text_price_hub_processed_payload.json',
  'artistic_frame_demo_enriched_payload.json',
  'artistic_frame_demo_shopify_export_payload.json',
  'products.json',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let fromDir = process.env.SOURCE152_DIR || null;
  let manifestFingerprint = process.env.SOURCE152_MANIFEST_FINGERPRINT
    || DEMO_CONFIG.upstream.manifest_fingerprint
    || null;
  let exportFingerprint = process.env.SOURCE152_EXPORT_FINGERPRINT
    || DEMO_CONFIG.upstream.payload_fingerprint
    || null;
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
    if (fs.existsSync(DEFAULT_HANDOFF_DIR)) {
      fromDir = DEFAULT_HANDOFF_DIR;
    } else {
      console.error(`Usage: node scripts/ingest_source152_af_cohort.js [--from /path/to/source152/export]
       Default handoff dir (when present): ${DEFAULT_HANDOFF_DIR}
       [--manifest-fingerprint <hash>] [--export-fingerprint <hash>] [--skip-gate-check]`);
      process.exit(1);
    }
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
  const manifestPath = SOURCE152_MANIFEST_NAMES
    .map((name) => path.join(fromDir, name))
    .find((p) => fs.existsSync(p));
  const exportPath = SOURCE152_EXPORT_NAMES
    .map((name) => path.join(fromDir, name))
    .find((p) => fs.existsSync(p));

  if (!manifestPath) {
    throw new Error(`Missing manifest in ${fromDir}. Expected one of: ${SOURCE152_MANIFEST_NAMES.join(', ')}`);
  }
  if (!exportPath) {
    throw new Error(`Missing export in ${fromDir}. Expected one of: ${SOURCE152_EXPORT_NAMES.join(', ')}`);
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
  const gate = manifest.gate || exportDoc.gate || manifest.manifest?.gate || exportDoc.handoff?.gate;
  if (gate === REQUIRED_GATE) return;
  if (LEGACY_GATES.has(gate)) {
    throw new Error(
      `Upstream gate is legacy (${gate}). Expected ${REQUIRED_GATE} from Source#152 PR #152 handoff.`
    );
  }
  throw new Error(`Upstream gate mismatch: expected ${REQUIRED_GATE}, got ${gate || '(none)'}`);
}

function main() {
  const { fromDir, manifestFingerprint, exportFingerprint, skipGate } = parseArgs();
  const { manifestPath, exportPath } = resolveSourceFiles(fromDir);

  const srcManifest = loadJson(manifestPath, 'Source#152 manifest');
  const exportDoc = loadJson(exportPath, 'Source#152 export');
  assertGate(srcManifest, exportDoc, skipGate);

  const products = normalizeHandoffProducts(extractProducts(exportDoc), exportDoc);

  const handoffValidation = validateHubProcessedMediaHandoff(products, exportDoc, {
    expectedMode: DEMO_CONFIG.media_handoff?.mode || HUB_PROCESSED_MEDIA_MODE,
  });
  if (!handoffValidation.ok) {
    throw new Error(`Hub-processed media handoff validation failed:\n- ${handoffValidation.issues.join('\n- ')}`);
  }

  if (DEMO_CONFIG.policy?.require_authoritative_price) {
    const priceValidation = validateAuthoritativePrices(products);
    if (!priceValidation.ok) {
      throw new Error(`Authoritative price validation failed:\n- ${priceValidation.issues.join('\n- ')}`);
    }
  }

  if (products.length === 0) {
    throw new Error('No products in export payload');
  }
  if (products.length > DEMO_CONFIG.limits.max_products) {
    throw new Error(`Cohort exceeds max ${DEMO_CONFIG.limits.max_products}: got ${products.length}`);
  }
  const targetProducts = DEMO_CONFIG.limits.target_products;
  if (targetProducts && products.length !== targetProducts) {
    throw new Error(`Cohort count must be exactly ${targetProducts}: got ${products.length}`);
  }

  const smokeSku = DEMO_CONFIG.cohort?.smoke_sku;
  if (smokeSku && !products.some((p) => p.sku === smokeSku)) {
    throw new Error(`Smoke SKU ${smokeSku} missing from cohort — cannot run live media smoke`);
  }

  verifyFingerprint('Manifest', manifestFingerprint, srcManifest);
  verifyFingerprint('Export', exportFingerprint, exportDoc);

  const resolvedExportFingerprint = exportFingerprint || sha256Json(exportDoc);
  if ((DEMO_CONFIG.upstream?.legacy_payload_fingerprints || []).includes(resolvedExportFingerprint)) {
    throw new Error(
      `Stale legacy payload fingerprint ${resolvedExportFingerprint} — wait for Source#152 50-product handoff`
    );
  }

  const stagingDir = path.join(ROOT, 'out', 'source152_ingest_staging');
  if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });

  fs.writeFileSync(path.join(stagingDir, 'products.json'), JSON.stringify(products, null, 2));
  fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify({
    ...srcManifest,
    gate: REQUIRED_GATE,
    media_handoff_mode: HUB_PROCESSED_MEDIA_MODE,
    manifest: {
      ...(srcManifest.manifest || {}),
      selected_records: products.length,
      checksum_sha256: sha256Json(products),
      products_file: 'products.json',
      media_handoff_mode: HUB_PROCESSED_MEDIA_MODE,
    },
  }, null, 2));

  const ingestArgs = [
    path.join(__dirname, 'ingest_source143_af_cohort.js'),
    '--from', stagingDir,
  ];

  const ingest = spawnSync(process.execPath, ingestArgs, { stdio: 'inherit', cwd: ROOT });
  if (ingest.status !== 0) process.exit(ingest.status || 1);

  const { fixtureDir } = require('../lib/af_demo_paths');
  const fixtureManifestPath = path.join(fixtureDir(), 'manifest.json');
  const fixtureManifest = JSON.parse(fs.readFileSync(fixtureManifestPath, 'utf8'));
  fixtureManifest.mode = 'source152_ingested';
  fixtureManifest.gate = 'ARTISTIC_FRAME_SOURCE152_COHORT_INGESTED';
  fixtureManifest.source = {
    ...(fixtureManifest.source || {}),
    upstream: DEMO_CONFIG.upstream.source_issue,
    status: 'ingested',
    required_gate: REQUIRED_GATE,
    media_handoff_mode: HUB_PROCESSED_MEDIA_MODE,
    ingested_at: new Date().toISOString(),
    ingest_from: fromDir,
    source_files: {
      manifest: path.basename(manifestPath),
      export: path.basename(exportPath),
    },
    manifest_fingerprint: manifestFingerprint || srcManifest.fingerprint || sha256Json(srcManifest),
    export_fingerprint: resolvedExportFingerprint,
  };
  fs.writeFileSync(fixtureManifestPath, JSON.stringify(fixtureManifest, null, 2));

  console.log('\nSource#152 ingest complete.');
  console.log(`Records: ${products.length} (target ${DEMO_CONFIG.limits.target_products})`);
  console.log(`Media handoff: ${HUB_PROCESSED_MEDIA_MODE}`);
  console.log(`Smoke SKU target: ${smokeSku}`);
  console.log('Next: npm run af-demo:preflight');
}

try {
  main();
} catch (err) {
  console.error('SOURCE152 INGEST FAILED:', err.message);
  process.exit(1);
}
