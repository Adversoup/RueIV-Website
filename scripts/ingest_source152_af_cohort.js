#!/usr/bin/env node
/**
 * ingest_source152_af_cohort.js
 * Ingest merged Source#152 (issue-146 paths) handoff into fixtures/artistic_frame_demo/.
 *
 * Validates embedded provenance fingerprints and Source#152 product contract:
 *   - exactly 50 products
 *   - media_handoff_mode=hub_processed_media
 *   - media_sync_ready=true on every product
 *   - authoritative price + price_source
 *   - Hub-processed media refs only (raw vendor URLs are lineage)
 *
 * Usage:
 *   node scripts/ingest_source152_af_cohort.js
 *   node scripts/ingest_source152_af_cohort.js --from fixtures/artistic_frame_demo/source152_handoff
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  HUB_PROCESSED_MEDIA_MODE,
  normalizeHandoffProducts,
  validateSource152Provenance,
  validateHubProcessedMediaHandoff,
  validateAuthoritativePrices,
} = require('../lib/af_demo_handoff');

const ROOT = path.resolve(__dirname, '..');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const DEFAULT_HANDOFF_DIR = path.join(ROOT, DEMO_CONFIG.handoff_dir || 'fixtures/artistic_frame_demo/source152_handoff');

const SOURCE152_MANIFEST_NAMES = [
  'artistic_frame_demo_cohort_50_manifest.json',
  'artistic_frame_demo_cohort_manifest.json',
  'artistic_frame_showcase_cohort_manifest.json',
  'manifest.json',
];
const SOURCE152_EXPORT_NAMES = [
  'artistic_frame_demo_enriched_payload.json',
  'artistic_frame_shopify_export_payload.json',
  'products.json',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let fromDir = process.env.SOURCE152_DIR || null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      fromDir = args[i + 1];
      i++;
    }
  }

  if (!fromDir) {
    if (fs.existsSync(DEFAULT_HANDOFF_DIR)) {
      fromDir = DEFAULT_HANDOFF_DIR;
    } else {
      console.error(`Usage: node scripts/ingest_source152_af_cohort.js [--from /path/to/source152/export]
       Default handoff dir (when present): ${DEFAULT_HANDOFF_DIR}`);
      process.exit(1);
    }
  }

  return { fromDir: path.resolve(fromDir) };
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

function main() {
  const { fromDir } = parseArgs();
  const { manifestPath, exportPath } = resolveSourceFiles(fromDir);

  const srcManifest = loadJson(manifestPath, 'Source#152 manifest');
  const exportDoc = loadJson(exportPath, 'Source#152 export');

  const provenance = validateSource152Provenance(srcManifest, exportDoc, DEMO_CONFIG);
  if (!provenance.ok) {
    throw new Error(`Source#152 provenance validation failed:\n- ${provenance.issues.join('\n- ')}`);
  }

  const handoffOptions = {
    handoffDir: fromDir,
    root: ROOT,
    hubOrigins: DEMO_CONFIG.media_handoff?.hub_public_origins || [],
  };

  const products = normalizeHandoffProducts(extractProducts(exportDoc), exportDoc, handoffOptions);

  const handoffValidation = validateHubProcessedMediaHandoff(products, exportDoc, {
    expectedMode: DEMO_CONFIG.media_handoff?.mode || HUB_PROCESSED_MEDIA_MODE,
    ...handoffOptions,
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

  const resolvedExportFingerprint = provenance.fingerprints.payload_fingerprint_sha256;
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
    media_handoff_mode: HUB_PROCESSED_MEDIA_MODE,
    manifest: {
      ...(srcManifest.manifest || {}),
      selected_records: products.length,
      checksum_sha256: sha256Json(products),
      products_file: 'products.json',
      media_handoff_mode: HUB_PROCESSED_MEDIA_MODE,
    },
  }, null, 2));

  const ingest = spawnSync(process.execPath, [
    path.join(__dirname, 'ingest_source143_af_cohort.js'),
    '--from', stagingDir,
  ], { stdio: 'inherit', cwd: ROOT });
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
    media_handoff_mode: HUB_PROCESSED_MEDIA_MODE,
    price_policy: exportDoc.price_policy || null,
    ingested_at: new Date().toISOString(),
    ingest_from: fromDir,
    source_files: {
      manifest: path.basename(manifestPath),
      export: path.basename(exportPath),
    },
    manifest_fingerprint: provenance.fingerprints.manifest_fingerprint_sha256,
    export_fingerprint: provenance.fingerprints.payload_fingerprint_sha256,
    cohort_manifest_fingerprint: provenance.fingerprints.cohort_manifest_fingerprint,
    provenance,
  };
  fs.writeFileSync(fixtureManifestPath, JSON.stringify(fixtureManifest, null, 2));

  console.log('\nSource#152 ingest complete.');
  console.log(`Records: ${products.length} (target ${DEMO_CONFIG.limits.target_products})`);
  console.log(`Media handoff: ${HUB_PROCESSED_MEDIA_MODE}`);
  console.log(`Manifest fingerprint: ${provenance.fingerprints.manifest_fingerprint_sha256}`);
  console.log(`Payload fingerprint: ${provenance.fingerprints.payload_fingerprint_sha256}`);
  console.log(`Smoke SKU target: ${smokeSku}`);
  console.log('Next: npm run af-demo:preflight');
}

try {
  main();
} catch (err) {
  console.error('SOURCE152 INGEST FAILED:', err.message);
  process.exit(1);
}
