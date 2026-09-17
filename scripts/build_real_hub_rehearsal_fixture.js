#!/usr/bin/env node
/**
 * build_real_hub_rehearsal_fixture.js
 * ───────────────────────────────────
 * READ-ONLY: transforms checked-in Hub CSV exports (mnt/data/) into a
 * sanitized, deterministic Hub-shaped rehearsal fixture. No Hub or Shopify
 * API calls. No credentials or PII — product/catalog fields only.
 *
 * Usage:
 *   node scripts/build_real_hub_rehearsal_fixture.js
 *
 * Output:
 *   fixtures/real_hub_rehearsal/manifest.json
 *   fixtures/real_hub_rehearsal/products.json
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'mnt', 'data');
const FIXTURE_DIR = path.join(ROOT, 'fixtures', 'real_hub_rehearsal');
const MANIFEST_TARGET = 75;

const REQUIRED_SCENARIOS = [
  { id: 'zr-family', label: 'ZR family', match: (p) => p.canonical_vendor === 'ZR' },
  { id: 'arte', label: 'Arte', match: (p) => p.canonical_vendor === 'Arte' },
  { id: 'missing-image', label: 'Missing image', match: (p) => p.images.length === 0 },
  { id: 'gallery-present', label: 'Image/gallery present', match: (p) => p.images.length >= 2 },
  { id: 'price-hidden', label: 'Price-hidden / no-price', match: (p) => p.price_authority !== 'retail' },
  { id: 'retail-price', label: 'Retail price visible', match: (p) => p.price_authority === 'retail' && parseFloat(p.price) > 0 },
  { id: 'variants', label: 'Variant/options-like data', match: (p) => (p.variants || []).length > 1 },
  { id: 'tearsheet-missing', label: 'Tearsheet missing', match: (p) => !p.tearsheet_pdf && !p.spec_pdf },
];

const PENDING_HUB_EXPORT = [
  { id: 'artistic-frame', label: 'Artistic Frame', reason: 'Vendor not present in current Hub CSV export snapshot' },
  { id: 'jab-family', label: 'JAB family + child identities', reason: 'Vendor not present in current Hub CSV export snapshot' },
  { id: 'innovations', label: 'Innovations', reason: 'Vendor not present in current Hub CSV export snapshot' },
  { id: 'chaddock-powell-bonnell', label: 'Chaddock / Powell & Bonnell', reason: 'Vendor not present in current Hub CSV export snapshot' },
  { id: 'child-brand-routing', label: 'Child-brand routing (e.g. Altura under Jeffrey Michaels)', reason: 'No parent_brand rows in current export; covered by synthetic fixture child-brand-routing' },
  { id: 'tearsheet-present', label: 'Tearsheet present', reason: 'No tearsheet_pdf/spec_pdf in current export; covered by synthetic fixture tearsheet-present' },
];

const MUST_INCLUDE_SKUS = [
  'TWL52S',
  'FAB-FAB-8099AEA2',
  'ADR OTTO',
  'CRW SECT',
  'TWL174',
  '11037415',
  '97912',
  '3170002',
  'VER-FUR-37AF0949',
];

function readCsv(filename) {
  const filepath = path.join(SOURCE_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Missing Hub export CSV: ${filepath}`);
  }
  return parse(fs.readFileSync(filepath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
}

function derivePriceAuthority(vendor, price) {
  const amount = parseFloat(price);
  if (!Number.isNaN(amount) && amount > 0) return 'retail';
  if (['Verellen', 'ZR', 'Fabricut', 'Arte'].includes(vendor)) return 'trade';
  return 'quote';
}

function htmlEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadVariantMap() {
  const rows = readCsv('furniture_variants.csv');
  const bySku = new Map();
  for (const row of rows) {
    const sku = row.sku;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(row);
  }
  return bySku;
}

function mapCsvRowToHub(row, variantMap) {
  const images = [row.image_url_1, row.image_url_2, row.image_url_3]
    .map((url) => (url || '').trim())
    .filter(Boolean);

  const variantRows = variantMap.get(row.sku) || [];
  const variants = variantRows
    .filter((v) => (v.variant_name || '').trim())
    .map((v, index) => ({
      name: v.variant_name.trim(),
      sku: `${row.sku}-${index + 1}`,
      price: (v.price || row.price || '0').trim() || '0',
    }));

  const price = (row.price || '').trim() || '0';

  return {
    sku: row.sku,
    title: row.name,
    canonical_vendor: row.vendor,
    category: row.category,
    status: row.status || 'APPROVED',
    price,
    price_authority: derivePriceAuthority(row.vendor, price),
    description_html: row.description ? `<p>${htmlEscape(row.description)}</p>` : '',
    images,
    color_family: (row.color || '').split(',')[0]?.trim() || undefined,
    tags: row.category ? [row.category] : [],
    variants: variants.length ? variants : undefined,
    _source: {
      export_file: 'mnt/data/core_products.csv',
      source_url: row.source_url || null,
      updated_at: row.updated_at || null,
    },
  };
}

function sanitizeHubRecord(record) {
  const clean = { ...record };
  delete clean._source;
  return clean;
}

function selectDeterministicManifest(allProducts) {
  const bySku = new Map(allProducts.map((p) => [p.sku, p]));
  const selected = new Map();
  const vendors = [...new Set(allProducts.map((p) => p.canonical_vendor))].sort();
  const perVendorTarget = Math.max(3, Math.floor(MANIFEST_TARGET / vendors.length));

  for (const sku of MUST_INCLUDE_SKUS) {
    if (bySku.has(sku)) selected.set(sku, bySku.get(sku));
  }

  for (const vendor of vendors) {
    const vendorProducts = allProducts
      .filter((p) => p.canonical_vendor === vendor)
      .sort((a, b) => {
        const categoryCmp = (a.category || '').localeCompare(b.category || '');
        if (categoryCmp !== 0) return categoryCmp;
        return a.sku.localeCompare(b.sku);
      });

    let added = 0;
    for (const product of vendorProducts) {
      if (added >= perVendorTarget) break;
      if (!selected.has(product.sku)) {
        selected.set(product.sku, product);
        added += 1;
      }
    }
  }

  const sorted = [...allProducts].sort((a, b) => {
    const vendorCmp = a.canonical_vendor.localeCompare(b.canonical_vendor);
    if (vendorCmp !== 0) return vendorCmp;
    const categoryCmp = (a.category || '').localeCompare(b.category || '');
    if (categoryCmp !== 0) return categoryCmp;
    return a.sku.localeCompare(b.sku);
  });

  for (const product of sorted) {
    if (selected.size >= MANIFEST_TARGET) break;
    selected.set(product.sku, product);
  }

  return [...selected.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}

function buildCoverage(products) {
  const scenarioResults = REQUIRED_SCENARIOS.map((scenario) => {
    const matched = products.filter(scenario.match);
    return {
      id: scenario.id,
      label: scenario.label,
      covered: matched.length > 0,
      sample_skus: matched.slice(0, 3).map((p) => p.sku),
      count: matched.length,
    };
  });

  const vendorCounts = products.reduce((acc, product) => {
    acc[product.canonical_vendor] = (acc[product.canonical_vendor] || 0) + 1;
    return acc;
  }, {});

  return {
    scenarios: scenarioResults,
    vendors_in_fixture: vendorCounts,
    pending_hub_export: PENDING_HUB_EXPORT,
    all_required_scenarios_covered: scenarioResults.every((s) => s.covered),
  };
}

function fingerprint(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function main() {
  const coreRows = readCsv('core_products.csv');
  const variantMap = loadVariantMap();
  const allProducts = coreRows.map((row) => mapCsvRowToHub(row, variantMap));
  const selected = selectDeterministicManifest(allProducts);
  const sanitizedProducts = selected.map(sanitizeHubRecord);
  const checksum = fingerprint(sanitizedProducts);

  if (!fs.existsSync(FIXTURE_DIR)) fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const manifest = {
    version: '1.0.0',
    gate: 'RUEIV_REAL_HUB_DATA_STAGING_REHEARSAL_READY_FOR_BOUNDED_GO_LIVE_GATE',
    generated_at: new Date().toISOString(),
    mode: 'read_only_hub_csv_export',
    live_mutation: false,
    source: {
      export_dir: 'mnt/data',
      export_files: [
        'core_products.csv',
        'fabric_attributes.csv',
        'furniture_attributes.csv',
        'furniture_variants.csv',
        'lighting_attributes.csv',
        'wallpaper_attributes.csv',
      ],
      source_product_count: allProducts.length,
      snapshot_note: 'Checked-in operator artifact from production-complete vendors; no Hub writes performed',
    },
    manifest: {
      target_records: MANIFEST_TARGET,
      selected_records: sanitizedProducts.length,
      selection_rules: [
        'Must-include edge-case SKUs (no-image, multi-variant, retail-price)',
        'Deterministic fill: sort by vendor, category, sku until target count',
      ],
      must_include_skus: MUST_INCLUDE_SKUS,
      checksum_sha256: checksum,
    },
    coverage: buildCoverage(selected),
    wording_freeze: {
      preserved: true,
      note: 'Fixture generation does not modify theme or customer-visible labels',
    },
  };

  fs.writeFileSync(path.join(FIXTURE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(FIXTURE_DIR, 'products.json'), JSON.stringify(sanitizedProducts, null, 2));

  console.log('Real Hub rehearsal fixture built (read-only)');
  console.log(`Selected records: ${sanitizedProducts.length}/${allProducts.length}`);
  console.log(`Checksum: ${checksum}`);
  console.log(`Coverage gaps pending Hub export: ${PENDING_HUB_EXPORT.length}`);
  console.log(`Output: ${FIXTURE_DIR}`);
}

main();
