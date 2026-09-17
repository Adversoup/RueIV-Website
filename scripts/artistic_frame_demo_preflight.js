#!/usr/bin/env node
/**
 * artistic_frame_demo_preflight.js
 * Safety gates before any Artistic Frame demo Shopify mutation.
 * Produces preflight report + rollback manifest skeleton.
 *
 * Usage:
 *   node scripts/artistic_frame_demo_preflight.js
 *   node scripts/artistic_frame_demo_preflight.js --allow-scaffold
 *   node scripts/artistic_frame_demo_preflight.js --verbose
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  mapHubProduct,
  buildValidationReport,
  hubToShopifyProduct,
} = require('../lib/hub_shopify_mapper');
const {
  hasShopifyCredentials,
  findProductByHandle,
  findProductsBySkuVendor,
  getCollectionByHandle,
} = require('../lib/shopify_admin');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'fixtures', 'artistic_frame_demo');
const OUT_DIR = path.join(ROOT, 'out');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));

const VERBOSE = process.argv.includes('--verbose');
const ALLOW_SCAFFOLD = process.argv.includes('--allow-scaffold');

function loadCohort() {
  const manifestPath = path.join(FIXTURE_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  let productsFile = manifest.manifest?.products_file || 'products.json';
  let usingScaffold = false;

  const productsPath = path.join(FIXTURE_DIR, productsFile);
  if (!fs.existsSync(productsPath)) {
    if (manifest.scaffold?.enabled && ALLOW_SCAFFOLD) {
      productsFile = manifest.scaffold.products_file;
      usingScaffold = true;
    } else {
      throw new Error(
        `Missing ${productsFile}. Run ingest_source143_af_cohort.js or pass --allow-scaffold for machinery dry-run.`
      );
    }
  }

  const productsPathResolved = path.join(FIXTURE_DIR, productsFile);
  const products = JSON.parse(fs.readFileSync(productsPathResolved, 'utf8'));
  const checksum = crypto.createHash('sha256').update(JSON.stringify(products)).digest('hex');

  if (!usingScaffold && manifest.manifest?.checksum_sha256 && manifest.manifest.checksum_sha256 !== checksum) {
    throw new Error(`Fixture checksum mismatch: expected ${manifest.manifest.checksum_sha256}, got ${checksum}`);
  }

  return { manifest, products, checksum, usingScaffold, productsFile };
}

async function lookupExistingProducts(products, vendorName) {
  if (!hasShopifyCredentials()) {
    return {
      mode: 'offline',
      note: 'No Shopify credentials — SKU/handle lookup skipped (mapping-only preflight)',
      matches: [],
    };
  }

  const matches = [];
  for (const hub of products) {
    const mapped = mapHubProduct(hub, { forcePriceHidden: true });
    const byHandle = await findProductByHandle(mapped.handle);
    const bySku = await findProductsBySkuVendor(hub.sku, vendorName);

    let action = 'create';
    let existing = null;

    if (byHandle) {
      existing = byHandle;
      action = 'update';
    } else if (bySku.length === 1) {
      existing = bySku[0];
      action = 'update';
    } else if (bySku.length > 1) {
      action = 'quarantine';
    }

    matches.push({
      sku: hub.sku,
      handle: mapped.handle,
      action,
      existing_id: existing?.id || null,
      existing_handle: existing?.handle || null,
      existing_status: existing?.status || null,
      duplicate_count: bySku.length,
    });
  }

  return { mode: 'live_lookup', matches };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const { manifest, products, checksum, usingScaffold, productsFile } = loadCohort();
  const vendorName = DEMO_CONFIG.vendor.display_name;
  const maxProducts = DEMO_CONFIG.limits.max_products;

  if (products.length > maxProducts) {
    throw new Error(`Cohort count ${products.length} exceeds max ${maxProducts}`);
  }

  const wrongVendor = products.filter((p) => (p.canonical_vendor || p.brand) !== vendorName);
  if (wrongVendor.length) {
    throw new Error(`${wrongVendor.length} records are not ${vendorName} — quarantine required`);
  }

  const mappedResults = products.map((hub) => {
    const mapped = mapHubProduct(hub, { forcePriceHidden: DEMO_CONFIG.policy.price_hidden });
    const shopify = hubToShopifyProduct(hub, {
      forcePriceHidden: DEMO_CONFIG.policy.price_hidden,
      productStatus: DEMO_CONFIG.policy.default_product_status,
    });
    return {
      sku: hub.sku,
      hub,
      mapped,
      shopify,
      field_report: buildValidationReport(hub, mapped),
    };
  });

  const quarantined = mappedResults.filter((r) => !r.mapped.validation.ok || r.field_report.publish_eligibility === 'quarantine');
  const mappingOk = quarantined.length === 0;

  const lookup = await lookupExistingProducts(products, vendorName);
  const collectionHandle = DEMO_CONFIG.collection.handle;
  const collectionState = hasShopifyCredentials()
    ? await getCollectionByHandle(collectionHandle)
    : { mode: 'offline', note: 'Collection state unknown without credentials' };

  const actions = lookup.matches?.length
    ? lookup.matches
    : mappedResults.map((r) => ({
        sku: r.sku,
        handle: r.mapped.handle,
        action: 'create',
        existing_id: null,
      }));

  const createCount = actions.filter((a) => a.action === 'create').length;
  const updateCount = actions.filter((a) => a.action === 'update').length;
  const quarantineCount = actions.filter((a) => a.action === 'quarantine').length;

  const source143Ready = manifest.source?.status === 'ingested' && Boolean(manifest.source?.fingerprint);
  const preflightPass = mappingOk
    && quarantineCount === 0
    && products.length <= maxProducts
    && (source143Ready || (usingScaffold && ALLOW_SCAFFOLD));

  const gate = preflightPass
    ? (usingScaffold ? 'ARTISTIC_FRAME_CLIENT_DEMO_PREFLIGHT_SCAFFOLD_OK' : DEMO_CONFIG.gates.preflight)
    : 'ARTISTIC_FRAME_CLIENT_DEMO_PREFLIGHT_BLOCKED';

  const report = {
    gate,
    generated_at: new Date().toISOString(),
    mode: usingScaffold ? 'scaffold_dry_run' : 'source143_preflight',
    live_mutation: false,
    prerequisite_gates: [
      'RUEIV_SHOPIFY_STAGING_SIMULATION_READY_FOR_BOUNDED_GO_LIVE_GATE',
      'RUEIV_REAL_HUB_DATA_STAGING_REHEARSAL_READY_FOR_BOUNDED_GO_LIVE_GATE',
    ],
    source143: {
      status: manifest.source?.status || 'pending',
      fingerprint: manifest.source?.fingerprint || null,
      ready: source143Ready,
      using_scaffold: usingScaffold,
    },
    cohort: {
      vendor: vendorName,
      count: products.length,
      max_allowed: maxProducts,
      checksum_sha256: checksum,
      products_file: productsFile,
    },
    collection: {
      handle: collectionHandle,
      title: DEMO_CONFIG.collection.title,
      hidden_from_navigation: DEMO_CONFIG.collection.hidden_from_navigation,
      current_state: collectionState,
    },
    summary: {
      mapping_deterministic: mappingOk,
      quarantined_records: quarantined.length,
      intended_create: createCount,
      intended_update: updateCount,
      intended_quarantine: quarantineCount,
      shopify_lookup_mode: lookup.mode,
      preflight_pass: preflightPass,
      live_mutation_authorized: false,
    },
    policy: DEMO_CONFIG.policy,
    field_mapping: mappedResults.map((r) => ({
      sku: r.sku,
      handle: r.mapped.handle,
      field_report: r.field_report,
      theme: r.mapped.theme,
    })),
    intended_actions: actions,
    quarantined: quarantined.map((r) => ({
      sku: r.sku,
      issues: r.mapped.validation.issues,
      warnings: r.mapped.validation.warnings,
    })),
  };

  const rollbackManifest = {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    gate: 'ARTISTIC_FRAME_DEMO_ROLLBACK_MANIFEST',
    source143_fingerprint: manifest.source?.fingerprint || null,
    cohort_checksum: checksum,
    collection: {
      handle: collectionHandle,
      prior_state: collectionState?.id
        ? { id: collectionState.id, handle: collectionState.handle, title: collectionState.title }
        : null,
      created_by_demo: !collectionState?.id,
    },
    products: actions.map((a) => {
      const mapped = mappedResults.find((r) => r.sku === a.sku);
      return {
        sku: a.sku,
        intended_action: a.action,
        handle: a.handle,
        prior_state: a.existing_id
          ? {
              id: a.existing_id,
              handle: a.existing_handle,
              status: a.existing_status,
            }
          : null,
        created_by_demo: a.action === 'create',
      };
    }),
    rollback_commands: [
      'node scripts/artistic_frame_demo_rollback.js',
      'node scripts/artistic_frame_demo_rollback.js --dry-run',
    ],
    notes: [
      'Rollback sets demo-created products to DRAFT; restores prior_state for updated records.',
      'Does not delete unrelated products or modify navigation/theme.',
    ],
  };

  const reportPath = path.join(OUT_DIR, 'artistic_frame_demo_preflight_report.json');
  const rollbackPath = path.join(OUT_DIR, 'artistic_frame_demo_rollback_manifest.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(rollbackPath, JSON.stringify(rollbackManifest, null, 2));

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Artistic Frame Demo Preflight — DRY RUN                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Gate: ${gate}`);
  console.log(`Cohort: ${products.length}/${maxProducts} (${vendorName})`);
  console.log(`Source#143: ${manifest.source?.status || 'pending'}${usingScaffold ? ' (scaffold)' : ''}`);
  console.log(`Mapping: ${mappingOk ? 'OK' : 'FAIL'} | Quarantine: ${quarantined.length}`);
  console.log(`Actions: create=${createCount} update=${updateCount} quarantine=${quarantineCount}`);
  console.log(`Preflight pass: ${preflightPass ? 'YES' : 'NO'}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rollback manifest: ${rollbackPath}`);

  if (VERBOSE) {
    for (const r of mappedResults) {
      console.log(`\n── ${r.sku}: ${r.mapped.title}`);
      console.log(`   price_hidden=${r.mapped.theme.priceHidden} images=${r.mapped.theme.imageCount}`);
      if (r.mapped.validation.warnings.length) {
        console.log(`   warnings: ${r.mapped.validation.warnings.join('; ')}`);
      }
    }
  }

  if (!source143Ready && !usingScaffold) {
    console.log('\nBLOCKED: Source#143 cohort not ingested. Run ingest_source143_af_cohort.js first.');
  }

  process.exit(preflightPass ? 0 : 1);
}

main().catch((err) => {
  console.error('PREFLIGHT FAILED:', err.message);
  process.exit(1);
});
