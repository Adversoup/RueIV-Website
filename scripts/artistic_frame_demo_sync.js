#!/usr/bin/env node
/**
 * artistic_frame_demo_sync.js
 * Bounded Artistic Frame demo Shopify sync — DRY_RUN by default.
 *
 * Remote media: productCreateMedia + originalSource (Shopify CDN fetch), with
 * poll-until-READY/FAILED and automatic proxy staged-upload fallback.
 *
 * Usage:
 *   node scripts/artistic_frame_demo_sync.js                    # dry-run full cohort
 *   node scripts/artistic_frame_demo_sync.js --live               # smoke SKU then remaining cohort
 *   node scripts/artistic_frame_demo_sync.js --live --smoke-only  # 1-product media smoke only
 *   node scripts/artistic_frame_demo_sync.js --live --skip-smoke    # remaining cohort (after smoke pass)
 *
 * Env: SHOPIFY_STORE, SHOPIFY_ADMIN_ACCESS_TOKEN
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { hubToShopifyProduct, normalizeImageUrl } = require('../lib/hub_shopify_mapper');
const { demoMapOptions } = require('../lib/af_demo_mapping');
const { resolveAuthoritativePrice } = require('../lib/af_demo_handoff');
const { attachRemoteProductImages } = require('../lib/shopify_remote_media');
const {
  hasShopifyCredentials,
  gqlFetch,
  findProductByHandle,
  getCollectionByHandle,
  sleep,
  STORE,
} = require('../lib/shopify_admin');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'fixtures', 'artistic_frame_demo');
const OUT_DIR = path.join(ROOT, 'out');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));

const LIVE = process.argv.includes('--live');
const DRY_RUN = !LIVE;
const VERBOSE = process.argv.includes('--verbose');
const SMOKE_ONLY = process.argv.includes('--smoke-only');
const SKIP_SMOKE = process.argv.includes('--skip-smoke');

const SMOKE_SKU = process.env.AF_DEMO_SMOKE_SKU || DEMO_CONFIG.cohort?.smoke_sku || '2505A';
const SMOKE_REPORT_PATH = path.join(OUT_DIR, 'artistic_frame_demo_media_smoke_report.json');

function loadPreflightReport() {
  const reportPath = path.join(OUT_DIR, 'artistic_frame_demo_preflight_report.json');
  if (!fs.existsSync(reportPath)) {
    throw new Error('Missing preflight report. Run: npm run af-demo:preflight');
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

function loadProducts(productsFile) {
  const productsPath = path.join(FIXTURE_DIR, productsFile);
  return JSON.parse(fs.readFileSync(productsPath, 'utf8'));
}

function loadSmokeReport() {
  if (!fs.existsSync(SMOKE_REPORT_PATH)) return null;
  return JSON.parse(fs.readFileSync(SMOKE_REPORT_PATH, 'utf8'));
}

function assertLiveAuthorized(preflight) {
  if (!hasShopifyCredentials()) {
    throw new Error('Live sync requires SHOPIFY_STORE and SHOPIFY_ADMIN_ACCESS_TOKEN');
  }
  if (!preflight.summary.preflight_pass) {
    throw new Error('Preflight did not pass — live sync blocked');
  }
  if (preflight.source143?.using_scaffold) {
    throw new Error('Scaffold cohort cannot be used for live sync — ingest Source#146 export first');
  }
  if (preflight.source143?.using_bootstrap) {
    throw new Error('Bootstrap cohort cannot be used for live sync — ingest verified Source#146 export first');
  }
  if (preflight.gate !== DEMO_CONFIG.gates.preflight) {
    throw new Error(`Preflight gate mismatch: ${preflight.gate}`);
  }
  if (preflight.source146?.stale_28_product_fingerprint) {
    throw new Error('Stale 28-product handoff — live sync blocked until revised 50-product Source#146 ingest');
  }
  if (preflight.cohort?.count !== DEMO_CONFIG.limits?.target_products) {
    throw new Error(
      `Cohort count ${preflight.cohort?.count} !== target ${DEMO_CONFIG.limits?.target_products} — live sync blocked`
    );
  }
  if (preflight.source146 && !preflight.source146.authoritative_price_ok) {
    throw new Error('Authoritative price preflight failed — live sync blocked');
  }
  if (preflight.source146?.raw_source_media_rejected || preflight.source146?.hub_processed_media_ok === false) {
    throw new Error('Hub-processed media preflight failed — live sync blocked until sync-ready handoff');
  }
}

function smokePriceChecks(hub) {
  const authoritative = resolveAuthoritativePrice(hub);
  const mapped = hubToShopifyProduct(hub, demoMapOptions(DEMO_CONFIG));
  const variantPrice = mapped?.variants?.[0]?.price;
  return {
    authoritative_price: authoritative?.price || null,
    shopify_variant_price: variantPrice != null ? String(variantPrice) : null,
    price_carried: authoritative?.price != null && parseFloat(variantPrice) > 0,
    theme_price_visibility: 'unchanged (existing Modiva login-based resolver)',
  };
}

async function createProduct(product, options = {}) {
  const query = `
    mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(input: $input, synchronous: $synchronous) {
        product {
          id
          handle
          title
          variants(first: 100) { edges { node { id sku } } }
        }
        userErrors { field message code }
      }
    }
  `;

  const isMultiVariant = product.variants.length > 1
    || (product.variants[0] && product.variants[0].options[0] !== 'Default Title');
  const optionName = product.optionName || 'Configuration';
  const optionValues = isMultiVariant
    ? [...new Set(product.variants.map((v) => v.options[0]))]
    : ['Default Title'];

  const variants = product.variants.map((v) => ({
    optionValues: isMultiVariant
      ? [{ optionName, name: v.options[0] }]
      : [{ optionName: 'Title', name: 'Default Title' }],
    price: parseFloat(v.price) || 0,
    inventoryPolicy: 'DENY',
    sku: v.sku || product.sku,
  }));

  const input = {
    title: product.title,
    handle: product.handle,
    descriptionHtml: product.descriptionHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: [...new Set([...(product.tags || []), DEMO_CONFIG.collection.demo_tag])],
    status: product.status || DEMO_CONFIG.policy.default_product_status,
    productOptions: isMultiVariant
      ? [{ name: optionName, values: optionValues.map((v) => ({ name: v })) }]
      : [{ name: 'Title', values: [{ name: 'Default Title' }] }],
    variants,
  };

  const result = await gqlFetch(query, { input, synchronous: true });
  if (result?.data?.productSet?.userErrors?.length) {
    throw new Error(`productSet failed: ${JSON.stringify(result.data.productSet.userErrors)}`);
  }
  const created = result?.data?.productSet?.product;
  if (!created) return null;

  let mediaResult = null;
  if (product.images.length > 0) {
    mediaResult = await attachRemoteProductImages(created.id, product.images, {
      sku: product.sku,
      allowProxyFallback: options.allowProxyFallback !== false,
      pollIntervalMs: DEMO_CONFIG.sync?.media_poll_interval_ms,
      pollMaxAttempts: DEMO_CONFIG.sync?.media_poll_max_attempts,
      onPollTick: VERBOSE
        ? ({ attempt, statuses }) => console.log(`    media poll #${attempt}: ${statuses.join(', ')}`)
        : null,
    });
    if (!mediaResult.ok) {
      const blocker = mediaResult.blocker || 'Media attach/poll failed';
      throw new Error(`${blocker}: ${JSON.stringify(mediaResult.errors).slice(0, 400)}`);
    }
  }

  return { product: created, media: mediaResult };
}

async function updateProduct(shopifyId, product) {
  const query = `
    mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(input: $input, synchronous: $synchronous) {
        product { id handle title }
        userErrors { field message code }
      }
    }
  `;
  const input = {
    id: shopifyId,
    title: product.title,
    descriptionHtml: product.descriptionHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: [...new Set([...(product.tags || []), DEMO_CONFIG.collection.demo_tag])],
    status: product.status || DEMO_CONFIG.policy.default_product_status,
  };
  const result = await gqlFetch(query, { input, synchronous: true });
  if (result?.data?.productSet?.userErrors?.length) {
    throw new Error(`Update failed: ${JSON.stringify(result.data.productSet.userErrors)}`);
  }
  return result?.data?.productSet?.product;
}

async function upsertMetafields(ownerId, metafields) {
  if (!metafields?.length) return;
  const query = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `;
  const batch = metafields.map((mf) => ({
    ownerId,
    namespace: mf.namespace,
    key: mf.key,
    value: mf.value,
    type: mf.type,
  }));
  await gqlFetch(query, { metafields: batch });
}

async function ensureDemoCollection(productIds) {
  const handle = DEMO_CONFIG.collection.handle;
  const existing = await getCollectionByHandle(handle);

  if (existing?.id) {
    if (productIds.length > 0) {
      await addProductsToCollection(existing.id, productIds);
    }
    return { action: 'exists', collection: existing, product_ids: productIds };
  }

  const query = `
    mutation collectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id handle title }
        userErrors { field message }
      }
    }
  `;

  const input = {
    title: DEMO_CONFIG.collection.title,
    handle,
    descriptionHtml: DEMO_CONFIG.collection.description_html,
    sortOrder: 'MANUAL',
  };

  const result = await gqlFetch(query, { input });
  const collection = result?.data?.collectionCreate?.collection;
  if (!collection) {
    throw new Error(`collectionCreate failed: ${JSON.stringify(result?.data?.collectionCreate?.userErrors || result)}`);
  }

  if (productIds.length > 0) {
    await addProductsToCollection(collection.id, productIds);
  }

  return { action: 'created', collection, product_ids: productIds };
}

async function addProductsToCollection(collectionId, productIds) {
  const query = `
    mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection { id }
        userErrors { field message }
      }
    }
  `;
  await gqlFetch(query, { id: collectionId, productIds });
}

function selectCohortProducts(products, phase) {
  const smokeHub = products.find((p) => p.sku === SMOKE_SKU);
  if (!smokeHub && (phase === 'smoke' || SMOKE_ONLY)) {
    throw new Error(`Smoke SKU ${SMOKE_SKU} not found in cohort — cannot run remote-media smoke`);
  }

  if (phase === 'smoke' || SMOKE_ONLY) {
    return [smokeHub];
  }

  if (phase === 'remaining') {
    return products.filter((p) => p.sku !== SMOKE_SKU);
  }

  return products;
}

async function syncProduct(hub, preflight, summary) {
  const mapOptions = demoMapOptions(DEMO_CONFIG);
  const product = hubToShopifyProduct(hub, {
    ...mapOptions,
    productStatus: DEMO_CONFIG.policy.default_product_status,
  });
  product.images = product.images.map(normalizeImageUrl);

  const actionEntry = preflight.intended_actions.find((a) => a.sku === hub.sku);
  const action = actionEntry?.action || 'create';

  if (action === 'quarantine') {
    summary.products.push({ sku: hub.sku, action: 'quarantine', status: 'skipped' });
    return null;
  }

  if (DRY_RUN) {
    summary.products.push({
      sku: hub.sku,
      handle: product.handle,
      action,
      status: 'dry_run',
      would_create: action === 'create',
      would_update: action === 'update',
      image_count: product.images.length,
      shopify_price: product.variants?.[0]?.price ?? null,
      media_attach: 'Hub-processed sync-ready refs only',
    });
    if (action === 'create') summary.created++;
    if (action === 'update') summary.updated++;
    return null;
  }

  let shopifyProduct;
  let mediaResult = null;

  if (action === 'update' && actionEntry?.existing_id) {
    shopifyProduct = await updateProduct(actionEntry.existing_id, product);
    await upsertMetafields(actionEntry.existing_id, product.metafields);
    if (product.images.length > 0) {
      mediaResult = await attachRemoteProductImages(actionEntry.existing_id, product.images, {
        sku: hub.sku,
        pollIntervalMs: DEMO_CONFIG.sync?.media_poll_interval_ms,
        pollMaxAttempts: DEMO_CONFIG.sync?.media_poll_max_attempts,
      });
      if (!mediaResult.ok) {
        throw new Error(mediaResult.blocker || 'Media attach failed on update');
      }
    }
    summary.updated++;
  } else {
    const existing = await findProductByHandle(product.handle);
    if (existing) {
      shopifyProduct = await updateProduct(existing.id, product);
      await upsertMetafields(existing.id, product.metafields);
      summary.updated++;
    } else {
      const created = await createProduct(product);
      shopifyProduct = created.product;
      mediaResult = created.media;
      if (shopifyProduct) {
        await upsertMetafields(shopifyProduct.id, product.metafields);
      }
      summary.created++;
    }
  }

  const entry = {
    sku: hub.sku,
    handle: product.handle,
    action,
    status: 'ok',
    shopify_id: shopifyProduct?.id || null,
    media: mediaResult
      ? {
          ok: mediaResult.ok,
          attach_method: mediaResult.attachMethod,
          poll: mediaResult.poll,
          errors: mediaResult.errors,
        }
      : null,
  };
  summary.products.push(entry);
  await sleep(250);
  return shopifyProduct?.id || null;
}

async function runPhase(phase, products, preflight) {
  const cohort = selectCohortProducts(products, phase);
  const summary = {
    gate: LIVE ? DEMO_CONFIG.gates.live_verified : 'ARTISTIC_FRAME_CLIENT_DEMO_SYNC_DRY_RUN',
    generated_at: new Date().toISOString(),
    mode: DRY_RUN ? 'dry_run' : 'live',
    live_mutation: !DRY_RUN,
    phase,
    smoke_sku: SMOKE_SKU,
    store: STORE || null,
    cohort_count: cohort.length,
    created: 0,
    updated: 0,
    failed: 0,
    products: [],
    collection: null,
    policy: {
      no_theme_publish: true,
      no_menu_changes: true,
      require_authoritative_price: DEMO_CONFIG.policy?.require_authoritative_price === true,
      hub_processed_media_only: DEMO_CONFIG.sync?.hub_processed_media_only === true,
      theme_price_visibility: 'unchanged',
    },
  };

  const productIds = [];

  for (const hub of cohort) {
    try {
      const id = await syncProduct(hub, preflight, summary);
      if (id) productIds.push(id);
    } catch (err) {
      summary.failed++;
      summary.products.push({
        sku: hub.sku,
        action: preflight.intended_actions.find((a) => a.sku === hub.sku)?.action || 'create',
        status: 'failed',
        error: err.message,
      });
      if (phase === 'smoke' || SMOKE_ONLY) {
        summary.blocker = err.message;
        break;
      }
    }
  }

  if (!DRY_RUN && phase !== 'smoke' && !SMOKE_ONLY && productIds.length > 0) {
    summary.collection = await ensureDemoCollection(productIds);
  } else {
    summary.collection = {
      handle: DEMO_CONFIG.collection.handle,
      action: DRY_RUN ? 'would_ensure' : (phase === 'smoke' || SMOKE_ONLY ? 'deferred_until_full_sync' : 'skipped'),
      product_count: productIds.length,
    };
  }

  return { summary, productIds };
}

function writeSmokeReport(summary, smokeHub) {
  const smokeProduct = summary.products.find((p) => p.sku === SMOKE_SKU);
  const priceChecks = smokeHub ? smokePriceChecks(smokeHub) : null;
  const priceOk = !priceChecks || priceChecks.price_carried;
  const report = {
    gate: summary.failed === 0 && smokeProduct?.status === 'ok' && priceOk
      ? 'ARTISTIC_FRAME_REMOTE_MEDIA_SMOKE_READY'
      : 'ARTISTIC_FRAME_REMOTE_MEDIA_SMOKE_FAILED',
    generated_at: new Date().toISOString(),
    smoke_sku: SMOKE_SKU,
    store: STORE || null,
    status: summary.failed === 0 && priceOk ? 'pass' : 'fail',
    blocker: summary.blocker || (priceOk ? null : 'Smoke SKU authoritative price not carried to Shopify variant'),
    product: smokeProduct || null,
    price_checks: priceChecks,
    media: smokeProduct?.media || null,
    sync_summary: summary,
  };
  fs.writeFileSync(SMOKE_REPORT_PATH, JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const preflight = loadPreflightReport();
  const products = loadProducts(preflight.cohort.products_file);

  if (LIVE) {
    assertLiveAuthorized(preflight);
  }

  let finalSummary;

  if (DRY_RUN) {
    finalSummary = (await runPhase('full', products, preflight)).summary;
  } else if (SMOKE_ONLY) {
    finalSummary = (await runPhase('smoke', products, preflight)).summary;
    const smokeReport = writeSmokeReport(finalSummary, products.find((p) => p.sku === SMOKE_SKU));
    if (smokeReport.status !== 'pass') {
      console.error(`SMOKE FAILED: ${smokeReport.blocker || 'see report'}`);
      process.exit(1);
    }
  } else if (SKIP_SMOKE) {
    const priorSmoke = loadSmokeReport();
    if (!priorSmoke || priorSmoke.status !== 'pass') {
      throw new Error('skip-smoke requires prior passing smoke report — run --smoke-only first');
    }
    finalSummary = (await runPhase('remaining', products, preflight)).summary;
  } else {
    const smokeResult = await runPhase('smoke', products, preflight);
    const smokeHub = products.find((p) => p.sku === SMOKE_SKU);
    const smokeReport = writeSmokeReport(smokeResult.summary, smokeHub);
    if (smokeReport.status !== 'pass') {
      console.error(`SMOKE FAILED — full cohort blocked: ${smokeReport.blocker || 'see smoke report'}`);
      console.error(`Smoke report: ${SMOKE_REPORT_PATH}`);
      process.exit(1);
    }
    console.log(`Smoke SKU ${SMOKE_SKU} media+price READY — proceeding with remaining ${products.length - 1} products…`);
    const remainingResult = await runPhase('remaining', products, preflight);
    finalSummary = {
      ...remainingResult.summary,
      phase: 'smoke_then_remaining',
      smoke_report: smokeReport,
      smoke_summary: smokeResult.summary,
    };
  }

  const outPath = path.join(OUT_DIR, 'artistic_frame_demo_sync_report.json');
  fs.writeFileSync(outPath, JSON.stringify(finalSummary, null, 2));

  if (!DRY_RUN) {
    const rollbackPath = path.join(OUT_DIR, 'artistic_frame_demo_rollback_manifest.json');
    if (fs.existsSync(rollbackPath)) {
      const rollback = JSON.parse(fs.readFileSync(rollbackPath, 'utf8'));
      rollback.executed_at = new Date().toISOString();
      rollback.live_product_ids = finalSummary.products
        .filter((p) => p.shopify_id)
        .map((p) => ({ sku: p.sku, id: p.shopify_id, action: p.action }));
      rollback.collection_result = finalSummary.collection;
      rollback.media_smoke = loadSmokeReport();
      fs.writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2));
    }
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Artistic Frame Demo Sync — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${' '.repeat(DRY_RUN ? 24 : 29)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Gate: ${finalSummary.gate}`);
  console.log(`Phase: ${finalSummary.phase || 'full'}`);
  console.log(`Cohort: ${finalSummary.cohort_count} | created=${finalSummary.created} updated=${finalSummary.updated} failed=${finalSummary.failed}`);
  console.log(`Collection: ${DEMO_CONFIG.collection.handle} (${finalSummary.collection?.action || 'n/a'})`);
  console.log(`Report: ${outPath}`);
  if (LIVE && fs.existsSync(SMOKE_REPORT_PATH)) {
    console.log(`Smoke report: ${SMOKE_REPORT_PATH}`);
  }

  if (VERBOSE) {
    for (const p of finalSummary.products) {
      console.log(`  ${p.sku}: ${p.status} (${p.action})${p.media?.attach_method ? ` media=${p.media.attach_method}` : ''}`);
    }
  }

  process.exit(finalSummary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('SYNC FAILED:', err.message);
  process.exit(1);
});
