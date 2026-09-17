#!/usr/bin/env node
/**
 * artistic_frame_demo_sync.js
 * Bounded Artistic Frame demo Shopify sync — DRY_RUN by default.
 *
 * Usage:
 *   node scripts/artistic_frame_demo_sync.js              # dry-run
 *   node scripts/artistic_frame_demo_sync.js --live       # live (requires preflight pass + Source#143)
 *
 * Env: SHOPIFY_STORE, SHOPIFY_ADMIN_ACCESS_TOKEN, DRY_RUN=true|false
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { hubToShopifyProduct, normalizeImageUrl } = require('../lib/hub_shopify_mapper');
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

function loadPreflightReport() {
  const reportPath = path.join(OUT_DIR, 'artistic_frame_demo_preflight_report.json');
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Missing preflight report. Run: npm run af-demo:preflight`);
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

function loadProducts(productsFile) {
  const productsPath = path.join(FIXTURE_DIR, productsFile);
  return JSON.parse(fs.readFileSync(productsPath, 'utf8'));
}

async function createProduct(product) {
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
  if (created && product.images.length > 0) {
    await addProductMedia(created.id, product.images);
  }
  return created;
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

async function addProductMedia(productId, imageUrls) {
  const query = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        mediaUserErrors { field message code }
      }
    }
  `;
  const media = imageUrls.map((url) => ({
    mediaContentType: 'IMAGE',
    originalSource: normalizeImageUrl(url),
  }));
  await gqlFetch(query, { productId, media });
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

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const preflight = loadPreflightReport();
  const products = loadProducts(preflight.cohort.products_file);

  if (LIVE) {
    if (!hasShopifyCredentials()) {
      throw new Error('Live sync requires SHOPIFY_STORE and SHOPIFY_ADMIN_ACCESS_TOKEN');
    }
    if (!preflight.summary.preflight_pass) {
      throw new Error('Preflight did not pass — live sync blocked');
    }
    if (preflight.source143.using_scaffold) {
      throw new Error('Scaffold cohort cannot be used for live sync — ingest Source#143 first');
    }
    if (preflight.gate !== DEMO_CONFIG.gates.preflight) {
      throw new Error(`Preflight gate mismatch: ${preflight.gate}`);
    }
  }

  const summary = {
    gate: LIVE ? DEMO_CONFIG.gates.live_verified : 'ARTISTIC_FRAME_CLIENT_DEMO_SYNC_DRY_RUN',
    generated_at: new Date().toISOString(),
    mode: DRY_RUN ? 'dry_run' : 'live',
    live_mutation: !DRY_RUN,
    store: STORE || null,
    cohort_count: products.length,
    created: 0,
    updated: 0,
    failed: 0,
    products: [],
    collection: null,
    policy: {
      no_theme_publish: true,
      no_menu_changes: true,
      price_hidden: true,
    },
  };

  const productIds = [];

  for (const hub of products) {
    const product = hubToShopifyProduct(hub, {
      forcePriceHidden: DEMO_CONFIG.policy.price_hidden,
      productStatus: DEMO_CONFIG.policy.default_product_status,
    });
    product.images = product.images.map(normalizeImageUrl);

    const actionEntry = preflight.intended_actions.find((a) => a.sku === hub.sku);
    const action = actionEntry?.action || 'create';

    if (action === 'quarantine') {
      summary.products.push({ sku: hub.sku, action: 'quarantine', status: 'skipped' });
      continue;
    }

    try {
      if (DRY_RUN) {
        summary.products.push({
          sku: hub.sku,
          handle: product.handle,
          action,
          status: 'dry_run',
          would_create: action === 'create',
          would_update: action === 'update',
        });
        if (action === 'create') summary.created++;
        if (action === 'update') summary.updated++;
        continue;
      }

      let shopifyProduct;
      if (action === 'update' && actionEntry?.existing_id) {
        shopifyProduct = await updateProduct(actionEntry.existing_id, product);
        await upsertMetafields(actionEntry.existing_id, product.metafields);
        summary.updated++;
      } else {
        const existing = await findProductByHandle(product.handle);
        if (existing) {
          shopifyProduct = await updateProduct(existing.id, product);
          await upsertMetafields(existing.id, product.metafields);
          summary.updated++;
        } else {
          shopifyProduct = await createProduct(product);
          if (shopifyProduct) {
            await upsertMetafields(shopifyProduct.id, product.metafields);
          }
          summary.created++;
        }
      }

      if (shopifyProduct?.id) productIds.push(shopifyProduct.id);
      summary.products.push({
        sku: hub.sku,
        handle: product.handle,
        action,
        status: 'ok',
        shopify_id: shopifyProduct?.id || null,
      });
      await sleep(250);
    } catch (err) {
      summary.failed++;
      summary.products.push({ sku: hub.sku, action, status: 'failed', error: err.message });
    }
  }

  if (!DRY_RUN && productIds.length > 0) {
    summary.collection = await ensureDemoCollection(productIds);
  } else {
    summary.collection = {
      handle: DEMO_CONFIG.collection.handle,
      action: DRY_RUN ? 'would_ensure' : 'skipped',
      product_count: productIds.length,
    };
  }

  const outPath = path.join(OUT_DIR, 'artistic_frame_demo_sync_report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  if (!DRY_RUN) {
    const rollbackPath = path.join(OUT_DIR, 'artistic_frame_demo_rollback_manifest.json');
    if (fs.existsSync(rollbackPath)) {
      const rollback = JSON.parse(fs.readFileSync(rollbackPath, 'utf8'));
      rollback.executed_at = new Date().toISOString();
      rollback.live_product_ids = summary.products
        .filter((p) => p.shopify_id)
        .map((p) => ({ sku: p.sku, id: p.shopify_id, action: p.action }));
      rollback.collection_result = summary.collection;
      fs.writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2));
    }
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Artistic Frame Demo Sync — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${' '.repeat(DRY_RUN ? 24 : 29)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Gate: ${summary.gate}`);
  console.log(`Cohort: ${products.length} | created=${summary.created} updated=${summary.updated} failed=${summary.failed}`);
  console.log(`Collection: ${DEMO_CONFIG.collection.handle} (${summary.collection?.action || 'n/a'})`);
  console.log(`Report: ${outPath}`);

  if (VERBOSE) {
    for (const p of summary.products) {
      console.log(`  ${p.sku}: ${p.status} (${p.action})`);
    }
  }

  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('SYNC FAILED:', err.message);
  process.exit(1);
});
