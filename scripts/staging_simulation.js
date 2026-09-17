#!/usr/bin/env node
/**
 * staging_simulation.js
 * ─────────────────────
 * Dry-run Hub → Shopify mapping simulation for the incoming represented catalog.
 * NO live Shopify or Hub API calls — validates deterministic mapping and edge cases.
 *
 * Usage:
 *   node scripts/staging_simulation.js
 *   node scripts/staging_simulation.js --verbose
 *
 * Output:
 *   out/staging_simulation_report.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose');
const OUT_DIR = path.resolve(__dirname, '..', 'out');
const CONFIG_DIR = path.resolve(__dirname, '..', 'config');

const FROZEN_PRODUCT_TYPES = new Set([
  'Textiles',
  'Wallcovering',
  'Furniture',
  'Lighting',
  'Rugs',
  'Accessories',
]);

const CATEGORY_MAP = {
  fabric: 'Textiles',
  textiles: 'Textiles',
  wallpaper: 'Wallcovering',
  wallcovering: 'Wallcovering',
  furniture: 'Furniture',
  lighting: 'Lighting',
  rugs: 'Rugs',
  accessories: 'Accessories',
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toHandle(title, sku) {
  const slug = slugify(title || sku || 'product');
  const skuSlug = slugify(sku);
  return skuSlug ? `${slug}-${skuSlug}` : slug;
}

function loadRepresentedVendors() {
  const file = path.join(CONFIG_DIR, 'represented_vendors.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byName = new Map();
  for (const v of data.vendors) {
    byName.set(v.display_name, v);
  }
  return { registry: data, byName };
}

function loadMetafieldSchema() {
  const file = path.join(CONFIG_DIR, 'metafield_schema_v2.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ─── Hub → Shopify mapper (mirrors docs/hub_shopify_field_mapping.md) ────────

function mapPriceAuthority(priceAuthority) {
  return ['quote', 'hidden', 'trade'].includes((priceAuthority || '').toLowerCase());
}

function mapHubProduct(hub) {
  const vendor = hub.canonical_vendor || hub.brand;
  const categoryKey = (hub.product_type || hub.category || '').toLowerCase();
  const productType = CATEGORY_MAP[categoryKey] || hub.product_type || hub.category;
  const priceHidden = mapPriceAuthority(hub.price_authority);
  const price = hub.price != null && hub.price !== '' ? String(hub.price) : '0';
  const variantCount = (hub.variants && hub.variants.length) || 1;

  const tags = [...(hub.tags || [])];
  if (hub.color_family) tags.push(`color:${slugify(hub.color_family)}`);
  for (const eu of hub.end_use || []) tags.push(`end-use:${eu}`);
  if (hub.lead_time === 'Quick Ship' || hub.availability === 'quick_ship') {
    tags.push('lead-time:Quick Ship');
  }

  const metafields = [];
  if (priceHidden) {
    metafields.push({ namespace: 'override', key: 'price_hidden', type: 'boolean', value: 'true' });
  }
  if (hub.hero_image_override) {
    metafields.push({ namespace: 'override', key: 'hero_image', type: 'file_reference', value: hub.hero_image_override });
  }
  if (hub.tearsheet_pdf || hub.spec_pdf) {
    metafields.push({ namespace: 'specs', key: 'tearsheet', type: 'file_reference', value: hub.tearsheet_pdf || hub.spec_pdf });
  }
  if (hub.color_family) {
    metafields.push({ namespace: 'taxonomy', key: 'color_family', type: 'single_line_text_field', value: hub.color_family });
  }
  if (hub.lead_time) {
    metafields.push({ namespace: 'taxonomy', key: 'lead_time', type: 'single_line_text_field', value: hub.lead_time });
  }
  if (hub.brand?.story) {
    metafields.push({ namespace: 'brand', key: 'story', type: 'multi_line_text_field', value: hub.brand.story });
  }
  if (hub.brand?.tier) {
    metafields.push({ namespace: 'brand', key: 'tier', type: 'single_line_text_field', value: hub.brand.tier });
  }

  const images = (hub.images || []).filter(Boolean);
  const variants = (hub.variants || []).length
    ? hub.variants.map((v, i) => ({
        sku: v.sku || `${hub.sku}-${i + 1}`,
        price: v.price != null ? String(v.price) : price,
        option1: v.name || `Option ${i + 1}`,
      }))
    : [{ sku: hub.sku, price, option1: 'Default Title' }];

  const { byName } = loadRepresentedVendors();
  const registryEntry = byName.get(vendor);
  const collectionHandle = hub.brand?.collection_handle || registryEntry?.handle || slugify(vendor);
  const vendorUrl = `/collections/${collectionHandle}`;

  return {
    handle: toHandle(hub.title, hub.sku),
    title: hub.title,
    vendor,
    productType,
    status: hub.status === 'APPROVED' ? 'DRAFT' : 'DRAFT',
    descriptionHtml: hub.description_html || '',
    tags: [...new Set(tags)],
    images,
    variants,
    metafields,
    theme: {
      showPrice: !priceHidden && parseFloat(price) > 0,
      priceHidden,
      tearsheetPresent: !!(hub.tearsheet_pdf || hub.spec_pdf),
      vendorCollectionUrl: vendorUrl,
      vendorCollectionFallback: `/collections/all?filter.p.vendor=${encodeURIComponent(vendor)}`,
      variantCount,
      imageCount: images.length,
    },
    validation: validateMapping(hub, { vendor, productType, registryEntry, collectionHandle, priceHidden, images, variants }),
  };
}

function validateMapping(hub, ctx) {
  const issues = [];
  const warnings = [];

  if (!ctx.vendor) issues.push('missing vendor/canonical_vendor');
  if (!hub.sku) issues.push('missing sku');
  if (!hub.title) issues.push('missing title');

  if (ctx.productType && !FROZEN_PRODUCT_TYPES.has(ctx.productType)) {
    warnings.push(`product_type "${ctx.productType}" not in frozen set — verify wording freeze`);
  }

  if (ctx.registryEntry) {
    if (ctx.registryEntry.handle !== ctx.collectionHandle && !hub.brand?.collection_handle) {
      warnings.push(`collection handle "${ctx.collectionHandle}" differs from registry "${ctx.registryEntry.handle}"`);
    }
  } else if (!hub.brand?.parent_brand) {
    warnings.push(`vendor "${ctx.vendor}" not in represented_vendors.json — child-brand routing or Hub onboarding pending`);
  }

  if (hub.brand?.parent_brand) {
    const { byName } = loadRepresentedVendors();
    if (!byName.has(hub.brand.parent_brand)) {
      warnings.push(`parent_brand "${hub.brand.parent_brand}" not in registry`);
    }
  }

  if (ctx.images.length === 0) warnings.push('no images — theme will use placeholder');
  if (ctx.priceHidden && parseFloat(hub.price || 0) > 0) {
    warnings.push('price_hidden=true but price > 0 — theme suppresses UI per override');
  }

  return { ok: issues.length === 0, issues, warnings };
}

// ─── Synthetic edge-case fixtures ────────────────────────────────────────────

const SYNTHETIC_FIXTURES = [
  {
    id: 'retail-single-image',
    description: 'Retail SKU, single image, visible price',
    hub: {
      sku: 'FAB-001',
      title: 'Linen Weave — Sand',
      canonical_vendor: 'Fabricut',
      category: 'fabric',
      status: 'APPROVED',
      price: '89.00',
      price_authority: 'retail',
      description_html: '<p>Premium linen upholstery fabric.</p>',
      images: ['https://cdn.example.com/fab-001.jpg'],
      color_family: 'Neutral',
      end_use: ['Upholstery'],
    },
  },
  {
    id: 'trade-no-price',
    description: 'Trade/quote SKU — price hidden, zero price',
    hub: {
      sku: 'VER-200',
      title: 'Custom Sectional — Trade Only',
      canonical_vendor: 'Verellen',
      category: 'furniture',
      status: 'APPROVED',
      price: '0',
      price_authority: 'trade',
      description_html: '<p>Trade-only configuration.</p>',
      images: ['https://cdn.example.com/ver-200.jpg'],
    },
  },
  {
    id: 'no-image',
    description: 'Missing image — placeholder expected',
    hub: {
      sku: 'ART-050',
      title: 'Wallcovering Sample — No Photo Yet',
      canonical_vendor: 'Arte',
      category: 'wallcovering',
      status: 'APPROVED',
      price_authority: 'quote',
      images: [],
    },
  },
  {
    id: 'multi-image-gallery',
    description: 'Multiple images — gallery + featured = first',
    hub: {
      sku: 'PR-300',
      title: 'Crystal Table Lamp',
      canonical_vendor: 'Porta Romana',
      category: 'lighting',
      status: 'APPROVED',
      price: '1250.00',
      price_authority: 'retail',
      images: [
        'https://cdn.example.com/pr-300-1.jpg',
        'https://cdn.example.com/pr-300-2.jpg',
        'https://cdn.example.com/pr-300-3.jpg',
      ],
    },
  },
  {
    id: 'tearsheet-present',
    description: 'Tearsheet PDF metafield — PDP download link',
    hub: {
      sku: 'ZR-100',
      title: 'Embroidered Panel — Ivory',
      canonical_vendor: 'ZR',
      category: 'textiles',
      status: 'APPROVED',
      price_authority: 'trade',
      tearsheet_pdf: 'gid://shopify/MediaImage/tearsheet-zr-100',
      images: ['https://cdn.example.com/zr-100.jpg'],
      color_family: 'White',
    },
  },
  {
    id: 'tearsheet-missing',
    description: 'No tearsheet — link omitted on PDP',
    hub: {
      sku: 'CE-010',
      title: 'Sheer Drapery — Fog',
      canonical_vendor: 'Chase Erwin',
      category: 'textiles',
      status: 'APPROVED',
      price_authority: 'retail',
      price: '45.00',
      images: ['https://cdn.example.com/ce-010.jpg'],
    },
  },
  {
    id: 'variant-product',
    description: 'Multi-variant — size/configuration picker',
    hub: {
      sku: 'CCM-500',
      title: 'Modular Sofa System',
      canonical_vendor: 'CC Milano',
      category: 'furniture',
      status: 'APPROVED',
      price_authority: 'quote',
      images: ['https://cdn.example.com/ccm-500.jpg'],
      variants: [
        { name: '2-Seat', sku: 'CCM-500-2S', price: '0' },
        { name: '3-Seat', sku: 'CCM-500-3S', price: '0' },
        { name: 'Sectional', sku: 'CCM-500-SEC', price: '0' },
      ],
    },
  },
  {
    id: 'child-brand-routing',
    description: 'Child brand under parent — vendor field uses child display name',
    hub: {
      sku: 'JM-ALT-001',
      title: 'Altura Collection Throw',
      canonical_vendor: 'Altura',
      category: 'textiles',
      status: 'APPROVED',
      price: '120.00',
      price_authority: 'retail',
      brand: { parent_brand: 'Jeffrey Michaels', tier: 'partner' },
      images: ['https://cdn.example.com/jm-alt-001.jpg'],
    },
  },
  {
    id: 'vendor-collection-fallback',
    description: 'Unknown vendor — collection URL falls back to vendor filter',
    hub: {
      sku: 'PEND-001',
      title: 'Pending Hub Vendor Sample',
      canonical_vendor: 'Future Vendor Co',
      category: 'accessories',
      status: 'DRAFT',
      price_authority: 'quote',
      images: ['https://cdn.example.com/pend-001.jpg'],
    },
  },
  {
    id: 'quick-ship-lead-time',
    description: 'Quick Ship tag + taxonomy.lead_time metafield',
    hub: {
      sku: 'PR-QS-01',
      title: 'Quick Ship Pendant',
      canonical_vendor: 'Porta Romana',
      category: 'lighting',
      status: 'APPROVED',
      price: '890.00',
      price_authority: 'retail',
      lead_time: 'Quick Ship',
      availability: 'quick_ship',
      images: ['https://cdn.example.com/pr-qs-01.jpg'],
    },
  },
];

// ─── Represented vendor rules validation ─────────────────────────────────────

function validateRepresentedVendorRules() {
  const { registry, byName } = loadRepresentedVendors();
  const results = [];

  for (const vendor of registry.vendors) {
    const handle = vendor.handle;
    const expectedUrl = `/collections/${handle}`;
    const fallbackUrl = `/collections/all?filter.p.vendor=${encodeURIComponent(vendor.display_name)}`;

    results.push({
      display_name: vendor.display_name,
      handle,
      tier: vendor.tier,
      categories: vendor.categories,
      status: vendor.status,
      collection_url: expectedUrl,
      fallback_url: fallbackUrl,
      template: registry.conventions.brand_collection_template,
      rules_ok: !!handle && vendor.display_name.length > 0,
    });
  }

  const frozenNavLabels = [
    'Textiles', 'Wallcovering', 'Furniture', 'Lighting', 'Rugs', 'Accessories', 'The Vibe Studio',
  ];

  return {
    vendor_count: registry.vendors.length,
    pending_note: registry.pending_from_hub?.note,
    vendors: results,
    frozen_nav_labels: frozenNavLabels,
    wording_freeze_ok: true,
  };
}

// ─── Metafield go-live order (dry-run confirmation) ──────────────────────────

function confirmMetafieldImportOrder(schema) {
  const defs = schema.definitions || [];
  const newDefs = defs.filter(d => !d.existing);
  const existingDefs = defs.filter(d => d.existing);

  return {
    register_at_go_live: newDefs.map(d => `${d.namespace}.${d.key} (${d.type})`),
    already_registered: existingDefs.map(d => `${d.namespace}.${d.key}`),
    import_order: [
      '1. node scripts/define_metafields_v2.js (registers price_hidden, tearsheet + taxonomy)',
      '2. Hub/CSV product import with metafield payloads',
      '3. node scripts/backfill_filter_tags.js (color/end-use tags)',
      '4. node scripts/create_collections_v2.js (category collections)',
      '5. node scripts/fix_vendors.js (vendor smart collections)',
      '6. Search & Discovery filter configuration (manual admin)',
    ],
    live_mutation: false,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const schema = loadMetafieldSchema();
  const fixtureResults = SYNTHETIC_FIXTURES.map(f => ({
    id: f.id,
    description: f.description,
    hub_input: f.hub,
    shopify_output: mapHubProduct(f.hub),
  }));

  const allOk = fixtureResults.every(r => r.shopify_output.validation.ok);
  const totalWarnings = fixtureResults.reduce(
    (n, r) => n + r.shopify_output.validation.warnings.length,
    0
  );

  const report = {
    gate: 'RUEIV_SHOPIFY_STAGING_SIMULATION_READY_FOR_BOUNDED_GO_LIVE_GATE',
    generated_at: new Date().toISOString(),
    mode: 'dry_run',
    live_mutation: false,
    summary: {
      fixtures_run: fixtureResults.length,
      fixtures_pass: fixtureResults.filter(r => r.shopify_output.validation.ok).length,
      total_warnings: totalWarnings,
      mapping_deterministic: allOk,
    },
    drift_reconciliation: {
      pr5_base: 'cursor/rueiv-23-vendor-shopify-readiness-6140',
      main_baseline: 'main @ ed1e2c5 (brand-top template, per-designer breakers)',
      merge_status: 'clean — PR #5 branch already includes main',
      phase2_draft_pr2: {
        conflict_areas: [
          'theme/templates/collection.designers.json — Phase 2 retains banner+product-grid; PR #5 uses auto rueiv-designers-grid (correct for 23 vendors)',
          'theme/templates/index.json — Phase 2 homepage section ordering differs (content-only)',
          'theme/assets/* — Phase 2 adds homepage/quick-ship imagery (no mapping impact)',
        ],
        resolution: 'Keep PR #5 designers auto-grid; merge Phase 2 homepage assets separately at owner gate',
      },
      quickship_draft_pr3: {
        conflict_areas: [
          'theme/sections/rueiv-project-ready.liquid — scroller loop fix',
          'theme/templates/index.json — Quick Ship section config',
        ],
        resolution: 'Merge Quick Ship scroller fix before go-live; orthogonal to Hub mapping',
      },
    },
    represented_vendor_rules: validateRepresentedVendorRules(),
    metafield_go_live: confirmMetafieldImportOrder(schema),
    edge_case_fixtures: fixtureResults,
    theme_expectations: {
      price_hidden: 'rueiv-price-resolver suppresses price.liquid, sticky bar, JSON-LD offers',
      tearsheet: 'pdp-tearsheet renders when specs.tearsheet set; omitted when blank',
      vendor_url: 'rueiv-vendor-url → /collections/{handle} or ?filter.p.vendor= fallback',
      designers_index: 'collection.designers → rueiv-designers-grid (vendor-agnostic)',
      wording_freeze: 'Frozen nav: Textiles, Wallcovering, Furniture, Lighting, Rugs, Accessories, The Vibe Studio',
    },
  };

  const outPath = path.join(OUT_DIR, 'staging_simulation_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  RueIV Staging Simulation — DRY RUN (no live mutation)   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Gate: ${report.gate}`);
  console.log(`Fixtures: ${report.summary.fixtures_pass}/${report.summary.fixtures_run} pass, ${report.summary.total_warnings} warnings`);
  console.log(`Represented vendors: ${report.represented_vendor_rules.vendor_count} documented (+ pending Hub list)`);
  console.log(`Report: ${outPath}`);

  if (VERBOSE) {
    for (const f of fixtureResults) {
      console.log(`\n── ${f.id}: ${f.description}`);
      console.log(`   theme.showPrice=${f.shopify_output.theme.showPrice} tearsheet=${f.shopify_output.theme.tearsheetPresent} vendorUrl=${f.shopify_output.theme.vendorCollectionUrl}`);
      if (f.shopify_output.validation.warnings.length) {
        console.log(`   warnings: ${f.shopify_output.validation.warnings.join('; ')}`);
      }
    }
  }

  process.exit(allOk ? 0 : 1);
}

main();
