#!/usr/bin/env node
/**
 * scripts/map_colors.js
 * ─────────────────────
 * Batch AI color mapping for all unmapped products.
 * Uses 4-stage pipeline: dictionary → NLP → GPT-4o Vision → consensus.
 *
 * Usage:
 *   node scripts/map_colors.js                   # map unmapped only
 *   node scripts/map_colors.js --force            # re-map ALL (except overrides)
 *   node scripts/map_colors.js --dry-run          # preview only
 *   node scripts/map_colors.js --skip-vision      # skip GPT-4o (text-only)
 *   node scripts/map_colors.js --limit 5          # process first N unmapped only
 */
'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { mapColor, FAMILY_NAMES } = require('../lib/color_mapper');

const STORE     = process.env.SHOPIFY_STORE;
const TOKEN     = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const VERSION   = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL   = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep     = ms => new Promise(r => setTimeout(r, ms));

// Parse CLI args
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const FORCE     = args.includes('--force');
const SKIP_VIS  = args.includes('--skip-vision');
const limitIdx  = args.indexOf('--limit');
const LIMIT     = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ─── GQL helper ───────────────────────────────────────────────────────────────
let pts = 1000, lastT = Date.now();
async function gql(query, variables = {}) {
  const now = Date.now(); pts = Math.min(1000, pts + (now - lastT) / 1000 * 50); lastT = now;
  if (pts < 100) { const w = Math.ceil((100 - pts) / 50) * 1000; await sleep(w); pts = Math.min(1000, pts + w / 1000 * 50); lastT = Date.now(); }
  for (let a = 1; a <= 3; a++) {
    const r = await fetch(GQL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN }, body: JSON.stringify({ query, variables }) });
    if (r.status === 429) { await sleep(parseFloat(r.headers.get('Retry-After') || '2') * 1000); continue; }
    const j = await r.json();
    if (j.extensions?.cost) pts = j.extensions.cost.throttleStatus?.currentlyAvailable ?? pts;
    if (j.errors?.some(e => e.message?.includes('Throttled')) && a < 3) { await sleep(2000); continue; }
    return j;
  }
  throw new Error('Max retries');
}

// ─── Fetch all products with metafields ───────────────────────────────────────
async function fetchAll() {
  const products = [];
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50${after}) {
        edges { cursor node {
          id handle title productType vendor tags
          featuredImage { url }
          metafields(first: 30) {
            edges { node { namespace key value } }
          }
        }}
        pageInfo { hasNextPage }
      }
    }`);

    for (const e of result.data.products.edges) {
      const mf = {};
      for (const m of e.node.metafields.edges) {
        mf[`${m.node.namespace}.${m.node.key}`] = m.node.value;
      }
      products.push({
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        productType: e.node.productType,
        vendor: e.node.vendor,
        tags: e.node.tags || [],
        rawColor: mf['specs.color'] || '',
        imageUrl: e.node.featuredImage?.url || '',
        existingFamily: mf['taxonomy.color_family'] || '',
        existingConfidence: parseFloat(mf['taxonomy.color_confidence'] || '0'),
        existingSource: mf['taxonomy.color_source'] || '',
        overrideColor: mf['override.color_family'] || ''
      });
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
    await sleep(200);
  }
  return products;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══ AI Color Mapping Pipeline ═══');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Force: ${FORCE} | Vision: ${SKIP_VIS ? 'OFF' : 'ON'} | Limit: ${LIMIT === Infinity ? 'ALL' : LIMIT}`);
  if (!OPENAI_KEY && !SKIP_VIS) {
    console.warn('⚠  OPENAI_API_KEY not set — vision analysis disabled');
  }
  console.log('');

  const allProducts = await fetchAll();
  console.log(`Total products: ${allProducts.length}`);

  // Filter to products that need mapping
  let toProcess;
  if (FORCE) {
    // Re-map everything except manual overrides
    toProcess = allProducts.filter(p => !p.overrideColor);
  } else {
    // Only unmapped (no color family, or confidence 0)
    toProcess = allProducts.filter(p =>
      !p.overrideColor && (!p.existingFamily || p.existingConfidence === 0)
    );
  }

  if (LIMIT < toProcess.length) {
    toProcess = toProcess.slice(0, LIMIT);
  }

  console.log(`To process: ${toProcess.length}\n`);

  const results = [];
  let mapped = 0, failed = 0, skipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const p = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] ${p.title}`);

    try {
      const result = await mapColor(
        {
          rawColor: p.rawColor,
          imageUrl: p.imageUrl,
          overrideColor: p.overrideColor,
          title: p.title,
          productType: p.productType
        },
        SKIP_VIS ? null : OPENAI_KEY,
        { skipVision: SKIP_VIS }
      );

      const entry = {
        title: p.title,
        handle: p.handle,
        productType: p.productType,
        vendor: p.vendor,
        rawColor: p.rawColor,
        family: result.family || '—',
        secondary: result.secondary || '',
        confidence: result.confidence,
        source: result.source,
        reasoning: result.reasoning || '',
        previousFamily: p.existingFamily || '',
        previousConfidence: p.existingConfidence
      };
      results.push(entry);

      if (!result.family) {
        console.log(`  → UNCLASSIFIED (${result.source})`);
        failed++;
        continue;
      }

      // Don't overwrite if existing has higher confidence (unless forced)
      if (!FORCE && p.existingFamily && p.existingConfidence >= result.confidence) {
        console.log(`  → SKIP (existing ${p.existingFamily} conf=${p.existingConfidence} ≥ new ${result.family} conf=${result.confidence})`);
        skipped++;
        continue;
      }

      const slug = result.family.toLowerCase().replace(/\s+/g, '-');
      console.log(`  → ${result.family} (${result.confidence.toFixed(2)}) [${result.source}] ${result.reasoning ? '— ' + result.reasoning : ''}`);

      if (!DRY_RUN) {
        // Build tags
        const cleanTags = p.tags.filter(t => !t.startsWith('color:'));
        cleanTags.push(`color:${slug}`);
        if (result.secondary) {
          const secSlug = result.secondary.toLowerCase().replace(/\s+/g, '-');
          cleanTags.push(`color-secondary:${secSlug}`);
        }

        // Update tags
        await gql(`mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) { product { id } userErrors { message field } }
        }`, { input: { id: p.id, tags: cleanTags } });

        // Write metafields
        const metafields = [
          { ownerId: p.id, namespace: 'taxonomy', key: 'color_family', value: result.family, type: 'single_line_text_field' },
          { ownerId: p.id, namespace: 'taxonomy', key: 'color_confidence', value: String(result.confidence), type: 'number_decimal' },
          { ownerId: p.id, namespace: 'taxonomy', key: 'color_source', value: result.source, type: 'single_line_text_field' }
        ];
        if (result.secondary) {
          metafields.push({ ownerId: p.id, namespace: 'taxonomy', key: 'color_family_secondary', value: result.secondary, type: 'single_line_text_field' });
        }
        if (p.rawColor) {
          metafields.push({ ownerId: p.id, namespace: 'taxonomy', key: 'color_raw', value: p.rawColor, type: 'single_line_text_field' });
        }

        await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { metafields { id } userErrors { message field } }
        }`, { metafields });

        await sleep(500); // be nice to APIs
      }

      mapped++;
    } catch (err) {
      console.error(`  ERR: ${err.message}`);
      results.push({
        title: p.title, handle: p.handle, productType: p.productType,
        vendor: p.vendor, rawColor: p.rawColor, family: 'ERROR',
        secondary: '', confidence: 0, source: 'error',
        reasoning: err.message, previousFamily: p.existingFamily,
        previousConfidence: p.existingConfidence
      });
      failed++;
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n═══ Summary ═══');
  console.log(`Mapped:      ${mapped}`);
  console.log(`Failed:      ${failed}`);
  console.log(`Skipped:     ${skipped}`);
  console.log(`Total:       ${toProcess.length}`);

  // ─── Write report ─────────────────────────────────────────────────────────
  const reportDir = path.resolve(__dirname, '..', 'out', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const csvLines = ['title,handle,productType,vendor,rawColor,family,secondary,confidence,source,reasoning,previousFamily,previousConfidence'];
  for (const r of results) {
    const esc = s => `"${String(s).replace(/"/g, '""')}"`;
    csvLines.push([
      esc(r.title), esc(r.handle), esc(r.productType), esc(r.vendor),
      esc(r.rawColor), esc(r.family), esc(r.secondary), r.confidence,
      esc(r.source), esc(r.reasoning), esc(r.previousFamily), r.previousConfidence
    ].join(','));
  }
  const reportPath = path.join(reportDir, 'ai_color_mapping.csv');
  fs.writeFileSync(reportPath, csvLines.join('\n'), 'utf8');
  console.log(`\nReport: ${reportPath}`);

  // ─── Confidence distribution ──────────────────────────────────────────────
  const confBuckets = { high: 0, medium: 0, low: 0, zero: 0 };
  for (const r of results) {
    if (r.confidence >= 0.8) confBuckets.high++;
    else if (r.confidence >= 0.5) confBuckets.medium++;
    else if (r.confidence > 0) confBuckets.low++;
    else confBuckets.zero++;
  }
  console.log(`\nConfidence distribution:`);
  console.log(`  High (≥0.8):   ${confBuckets.high}`);
  console.log(`  Medium (0.5+): ${confBuckets.medium}`);
  console.log(`  Low (<0.5):    ${confBuckets.low}`);
  console.log(`  Zero:          ${confBuckets.zero}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
