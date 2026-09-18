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
  HUB_PROCESSED_MEDIA_MODE,
  validateHubProcessedMediaHandoff,
  validateAuthoritativePrices,
} = require('../lib/af_demo_handoff');
const { probeProductMediaAccessibility } = require('../lib/hub_media_resolver');
const { demoMapOptions } = require('../lib/af_demo_mapping');
const {
  hasShopifyCredentials,
  findProductByHandle,
  findProductsBySkuVendor,
  getCollectionByHandle,
} = require('../lib/shopify_admin');

const { ROOT, fixtureDir, outDir } = require('../lib/af_demo_paths');
const FIXTURE_DIR = fixtureDir();
const OUT_DIR = outDir();
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
    const mapped = mapHubProduct(hub, demoMapOptions(DEMO_CONFIG));
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

  const wrongVendor = products.filter((p) => {
    const vendor = p.canonical_vendor || (typeof p.brand === 'string' ? p.brand : p.brand?.display_name);
    return vendor !== vendorName;
  });
  if (wrongVendor.length) {
    throw new Error(`${wrongVendor.length} records are not ${vendorName} — quarantine required`);
  }

  const mapOptions = demoMapOptions(DEMO_CONFIG);
  const mappedResults = products.map((hub) => {
    const mapped = mapHubProduct(hub, mapOptions);
    const shopify = hubToShopifyProduct(hub, {
      ...mapOptions,
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

  const usingBootstrap = manifest.mode === 'bootstrap_public_refs'
    || manifest.source?.status === 'bootstrap_fallback';
  const usingSource152 = manifest.mode === 'source152_ingested'
    || manifest.mode === 'source146_ingested'
    || manifest.source?.upstream?.includes('#152')
    || manifest.source?.upstream?.includes('#146');
  const mediaHandoffMode = manifest.source?.media_handoff_mode
    || DEMO_CONFIG.media_handoff?.mode
    || HUB_PROCESSED_MEDIA_MODE;
  const handoffOptions = {
    handoffDir: path.join(ROOT, DEMO_CONFIG.handoff_dir || 'fixtures/artistic_frame_demo/source152_handoff'),
    root: ROOT,
    hubOrigins: DEMO_CONFIG.media_handoff?.hub_public_origins || [],
  };
  const handoffValidation = usingSource152
    ? validateHubProcessedMediaHandoff(products, { media_handoff_mode: mediaHandoffMode }, {
      expectedMode: DEMO_CONFIG.media_handoff?.mode || HUB_PROCESSED_MEDIA_MODE,
      ...handoffOptions,
    })
    : { ok: true, issues: [] };
  const priceValidation = usingSource152 && DEMO_CONFIG.policy?.require_authoritative_price
    ? validateAuthoritativePrices(products)
    : { ok: true, issues: [] };
  const staleFingerprint = usingSource152
    && manifest.source?.export_fingerprint
    && (DEMO_CONFIG.upstream?.legacy_payload_fingerprints || []).includes(manifest.source.export_fingerprint);
  const targetProducts = DEMO_CONFIG.limits?.target_products;
  const cohortCountOk = !usingSource152
    || !targetProducts
    || products.length === targetProducts;
  let mediaAccessibility = null;
  if (usingSource152) {
    const smokeSku = DEMO_CONFIG.cohort?.smoke_sku;
    const smokeProduct = products.find((p) => p.sku === smokeSku) || products[0];
    const smokeProbe = smokeProduct
      ? await probeProductMediaAccessibility(smokeProduct, handoffOptions)
      : { ok: false, blocker: 'no products to probe' };
    mediaAccessibility = {
      smoke_sku: smokeSku,
      smoke_probe_ok: smokeProbe.ok,
      selected_url: smokeProbe.selectedUrl || null,
      selected_source: smokeProbe.selectedSource || null,
      attempts: smokeProbe.attempts || [],
      live_sync_ready: smokeProbe.ok,
      blocker: smokeProbe.ok ? null : (smokeProbe.blocker || 'Hub media not fetchable for smoke SKU'),
    };
  }

  const source152Ready = usingSource152
    && manifest.source?.status === 'ingested'
    && manifest.source?.media_handoff_mode === (DEMO_CONFIG.media_handoff?.mode || HUB_PROCESSED_MEDIA_MODE)
    && handoffValidation.ok
    && priceValidation.ok
    && !staleFingerprint
    && cohortCountOk
    && products.some((p) => p.sku === DEMO_CONFIG.cohort?.smoke_sku)
    && (manifest.gate === 'ARTISTIC_FRAME_SOURCE152_COHORT_INGESTED'
      || manifest.mode === 'source152_ingested');
  const source143Ready = !usingBootstrap
    && !usingSource152
    && manifest.source?.status === 'ingested'
    && Boolean(manifest.source?.fingerprint);
  const cohortReady = source152Ready || source143Ready || (usingScaffold && ALLOW_SCAFFOLD) || usingBootstrap;
  const preflightPass = mappingOk
    && quarantineCount === 0
    && products.length <= maxProducts
    && cohortReady
    && (!usingSource152 || (handoffValidation.ok && priceValidation.ok && !staleFingerprint && cohortCountOk));

  const gate = preflightPass
    ? (usingScaffold
      ? 'ARTISTIC_FRAME_CLIENT_DEMO_PREFLIGHT_SCAFFOLD_OK'
      : usingBootstrap
        ? 'ARTISTIC_FRAME_CLIENT_DEMO_PREFLIGHT_BOOTSTRAP_OK'
        : DEMO_CONFIG.gates.preflight)
    : 'ARTISTIC_FRAME_CLIENT_DEMO_PREFLIGHT_BLOCKED';

  const report = {
    gate,
    generated_at: new Date().toISOString(),
    mode: usingScaffold
      ? 'scaffold_dry_run'
      : usingBootstrap
        ? 'bootstrap_dry_run'
        : usingSource152
          ? 'source152_preflight'
          : 'source143_preflight',
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
      using_bootstrap: usingBootstrap,
    },
    source152: {
      ready: source152Ready,
      media_handoff_mode: mediaHandoffMode,
      price_policy: manifest.source?.price_policy || null,
      hub_processed_media_ok: handoffValidation.ok,
      hub_processed_media_issues: handoffValidation.issues || [],
      raw_source_media_rejected: mediaHandoffMode === 'remote_source_url_import',
      authoritative_price_ok: priceValidation.ok,
      authoritative_price_issues: priceValidation.issues || [],
      stale_legacy_fingerprint: staleFingerprint || false,
      manifest_fingerprint: manifest.source?.manifest_fingerprint || null,
      export_fingerprint: manifest.source?.export_fingerprint || null,
      cohort_manifest_fingerprint: manifest.source?.cohort_manifest_fingerprint || null,
      expected_manifest_fingerprint: DEMO_CONFIG.upstream?.manifest_fingerprint || null,
      expected_export_fingerprint: DEMO_CONFIG.upstream?.payload_fingerprint || null,
      media_accessibility: mediaAccessibility,
      theme_price_visibility: 'unchanged (existing Modiva login-based resolver)',
      smoke_sku: DEMO_CONFIG.cohort?.smoke_sku || null,
      target_products: DEMO_CONFIG.limits?.target_products || null,
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
  if (usingSource152) {
    console.log(`Hub-processed media: ${handoffValidation.ok ? 'OK' : 'FAIL'} (${mediaHandoffMode})`);
    console.log(`Authoritative price: ${priceValidation.ok ? 'OK' : 'FAIL'}`);
    if (mediaAccessibility) {
      console.log(`Media accessibility (smoke): ${mediaAccessibility.smoke_probe_ok ? 'OK' : 'BLOCKED'}${mediaAccessibility.selected_url ? ` via ${mediaAccessibility.selected_source}` : ''}`);
      if (mediaAccessibility.blocker) console.log(`Media blocker: ${mediaAccessibility.blocker}`);
    }
    if (mediaHandoffMode === 'remote_source_url_import') {
      console.log('BLOCKED: raw remote_source_url_import — Hub-processed media required');
    }
    if (staleFingerprint) console.log('BLOCKED: stale legacy payload fingerprint — wait for Source#152 50-product handoff');
    if (!cohortCountOk) console.log(`BLOCKED: cohort count ${products.length} !== target ${targetProducts}`);
  }
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

  if (!source152Ready && !source143Ready && !usingScaffold && !usingBootstrap) {
    console.log('\nBLOCKED: Source#152 cohort not ingested. Run npm run af-demo:ingest:152 first.');
  } else if (usingBootstrap) {
    console.log('\nBOOTSTRAP OK (dry-run only): ingest verified Source#152 export before live sync.');
  } else if (source152Ready) {
    console.log(`\nSource#152 ready (${products.length} products). Live path: smoke ${DEMO_CONFIG.cohort?.smoke_sku} → remaining cohort.`);
  }

  process.exit(preflightPass ? 0 : 1);
}

main().catch((err) => {
  console.error('PREFLIGHT FAILED:', err.message);
  process.exit(1);
});
