#!/usr/bin/env node
/**
 * artistic_frame_demo_rollback.js
 * Deterministic rollback for Artistic Frame demo cohort using captured manifest.
 *
 * Usage:
 *   node scripts/artistic_frame_demo_rollback.js --dry-run
 *   node scripts/artistic_frame_demo_rollback.js --live
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  hasShopifyCredentials,
  gqlFetch,
  getCollectionByHandle,
  sleep,
} = require('../lib/shopify_admin');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));

const LIVE = process.argv.includes('--live');
const DRY_RUN = !LIVE;

function loadRollbackManifest() {
  const manifestPath = path.join(OUT_DIR, 'artistic_frame_demo_rollback_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing rollback manifest: ${manifestPath}. Run preflight first.`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

async function setProductDraft(productId) {
  const query = `
    mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(input: $input, synchronous: $synchronous) {
        product { id status }
        userErrors { field message }
      }
    }
  `;
  await gqlFetch(query, { input: { id: productId, status: 'DRAFT' }, synchronous: true });
}

async function restoreProductPrior(prior) {
  if (!prior?.id) return;
  const query = `
    mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(input: $input, synchronous: $synchronous) {
        product { id status }
        userErrors { field message }
      }
    }
  `;
  await gqlFetch(query, {
    input: { id: prior.id, status: prior.status || 'DRAFT' },
    synchronous: true,
  });
}

async function removeDemoCollection(handle) {
  const collection = await getCollectionByHandle(handle);
  if (!collection?.id) return { action: 'not_found' };

  const query = `
    mutation collectionDelete($input: CollectionDeleteInput!) {
      collectionDelete(input: $input) {
        deletedCollectionId
        userErrors { field message }
      }
    }
  `;
  const result = await gqlFetch(query, { input: { id: collection.id } });
  return {
    action: 'deleted',
    id: result?.data?.collectionDelete?.deletedCollectionId || collection.id,
  };
}

async function main() {
  const manifest = loadRollbackManifest();
  const liveIds = manifest.live_product_ids || [];

  const summary = {
    gate: 'ARTISTIC_FRAME_DEMO_ROLLBACK',
    generated_at: new Date().toISOString(),
    mode: DRY_RUN ? 'dry_run' : 'live',
    live_mutation: !DRY_RUN,
    actions: [],
  };

  if (LIVE && !hasShopifyCredentials()) {
    throw new Error('Live rollback requires SHOPIFY_STORE and SHOPIFY_ADMIN_ACCESS_TOKEN');
  }

  for (const entry of manifest.products) {
    const liveEntry = liveIds.find((p) => p.sku === entry.sku);
    const productId = liveEntry?.id || entry.prior_state?.id;

    if (!productId && entry.intended_action === 'create') {
      summary.actions.push({ sku: entry.sku, action: 'skip', reason: 'no live id recorded' });
      continue;
    }

    if (DRY_RUN) {
      summary.actions.push({
        sku: entry.sku,
        action: entry.created_by_demo ? 'would_set_draft' : 'would_restore_prior',
        product_id: productId || null,
      });
      continue;
    }

    try {
      if (entry.created_by_demo || liveEntry?.action === 'create') {
        await setProductDraft(productId);
        summary.actions.push({ sku: entry.sku, action: 'set_draft', product_id: productId });
      } else if (entry.prior_state) {
        await restoreProductPrior(entry.prior_state);
        summary.actions.push({ sku: entry.sku, action: 'restored_prior', product_id: productId });
      }
      await sleep(200);
    } catch (err) {
      summary.actions.push({ sku: entry.sku, action: 'failed', error: err.message });
    }
  }

  if (manifest.collection?.created_by_demo) {
    if (DRY_RUN) {
      summary.collection = { action: 'would_delete', handle: manifest.collection.handle || DEMO_CONFIG.collection.handle };
    } else {
      summary.collection = await removeDemoCollection(DEMO_CONFIG.collection.handle);
    }
  } else {
    summary.collection = { action: 'unchanged', reason: 'collection existed before demo' };
  }

  const outPath = path.join(OUT_DIR, 'artistic_frame_demo_rollback_report.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Artistic Frame Demo Rollback — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${' '.repeat(DRY_RUN ? 21 : 26)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Actions: ${summary.actions.length}`);
  console.log(`Collection: ${summary.collection?.action || 'n/a'}`);
  console.log(`Report: ${outPath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('ROLLBACK FAILED:', err.message);
  process.exit(1);
});
