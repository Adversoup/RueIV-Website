/**
 * hub_shopify_mapper.js
 * Shared Hub → Shopify mapping (mirrors docs/hub_shopify_field_mapping.md).
 * Used by staging_simulation.js rehearsal mode and Artistic Frame demo sync.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { extractRemoteSourceUrls } = require('./af_demo_handoff');

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

function mapPriceAuthority(priceAuthority) {
  return ['quote', 'hidden', 'trade'].includes((priceAuthority || '').toLowerCase());
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

function resolveProductPrice(hub, options = {}) {
  const requireAuthoritative = options.requireAuthoritativePrice === true;
  if (hub.price != null && hub.price !== '') return String(hub.price);
  const variantWithPrice = (hub.variants || []).find((v) => v.price != null && v.price !== '');
  if (variantWithPrice) return String(variantWithPrice.price);
  if (requireAuthoritative) return null;
  return '0';
}

function mapHubProduct(hub, options = {}) {
  const forcePriceHidden = options.forcePriceHidden === true;
  const priceVisibility = options.priceVisibility
    || (forcePriceHidden ? 'hidden' : 'public');
  const vendor = hub.canonical_vendor || hub.brand;
  const categoryKey = (hub.product_type || hub.category || '').toLowerCase();
  const productType = CATEGORY_MAP[categoryKey] || hub.product_type || hub.category;
  const priceHidden = priceVisibility === 'hidden'
    || (priceVisibility !== 'auth_only' && mapPriceAuthority(hub.price_authority));
  const price = resolveProductPrice(hub, options);
  if (price == null) {
    return {
      handle: toHandle(hub.title, hub.sku),
      title: hub.title || hub.sku,
      vendor,
      productType,
      validation: { ok: false, issues: ['missing authoritative price'], warnings: [] },
      theme: { priceHidden: true, showPrice: false, imageCount: 0, variantCount: 0 },
    };
  }
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
  } else if (priceVisibility === 'auth_only') {
    metafields.push({ namespace: 'override', key: 'price_auth_only', type: 'boolean', value: 'true' });
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

  const images = extractRemoteSourceUrls(hub);
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
      priceVisibility,
      priceAuthOnly: priceVisibility === 'auth_only',
      shopifyPrice: price,
      tearsheetPresent: !!(hub.tearsheet_pdf || hub.spec_pdf),
      vendorCollectionUrl: vendorUrl,
      vendorCollectionFallback: `/collections/all?filter.p.vendor=${encodeURIComponent(vendor)}`,
      variantCount,
      imageCount: images.length,
    },
    validation: validateMapping(hub, { vendor, productType, registryEntry, collectionHandle, priceHidden, images, variants }),
  };
}

function buildValidationReport(hub, mapped) {
  return {
    vendor_brand: mapped.validation.ok && !!mapped.vendor ? 'pass' : 'fail',
    sku: hub.sku ? 'pass' : 'fail',
    title: hub.title ? 'pass' : 'fail',
    product_type: mapped.productType ? 'pass' : 'fail',
    description: mapped.descriptionHtml != null ? 'pass' : 'fail',
    images_gallery: mapped.theme.imageCount > 0 ? 'pass' : 'warn',
    tearsheet: mapped.theme.tearsheetPresent ? 'pass' : 'warn',
    price_hidden: mapped.theme.priceHidden ? 'pass' : mapped.theme.showPrice ? 'pass' : 'warn',
    options_variants: mapped.theme.variantCount > 1 ? 'pass' : 'pass',
    collection_handle: mapped.theme.vendorCollectionUrl.startsWith('/collections/') ? 'pass' : 'warn',
    child_brand_routing: hub.brand?.parent_brand ? 'pass' : 'n/a',
    publish_eligibility: hub.status === 'APPROVED' ? 'pass' : 'quarantine',
    mapping_ok: mapped.validation.ok,
    issues: mapped.validation.issues,
    warnings: mapped.validation.warnings,
  };
}

function hubToShopifyProduct(hub, options = {}) {
  const mapped = mapHubProduct(hub, options);
  const isMultiVariant = mapped.variants.length > 1
    || (mapped.variants[0] && mapped.variants[0].option1 !== 'Default Title');

  return {
    sku: hub.sku,
    title: mapped.title,
    handle: mapped.handle,
    descriptionHtml: mapped.descriptionHtml,
    vendor: mapped.vendor,
    productType: mapped.productType,
    tags: mapped.tags,
    status: options.productStatus || mapped.status,
    images: mapped.images,
    optionName: isMultiVariant ? 'Configuration' : 'Title',
    variants: mapped.variants.map((v) => ({
      sku: v.sku,
      price: parseFloat(v.price) || 0,
      options: [v.option1],
    })),
    metafields: mapped.metafields,
    _hub: hub,
    _mapped: mapped,
  };
}

function normalizeImageUrl(url) {
  let normalized = decodeURIComponent(url);
  const qIdx = normalized.indexOf('?');
  if (qIdx > 0) normalized = normalized.substring(0, qIdx);
  if (normalized.startsWith('http://')) {
    normalized = `https://${normalized.slice(7)}`;
  }
  return normalized;
}

module.exports = {
  FROZEN_PRODUCT_TYPES,
  CATEGORY_MAP,
  slugify,
  toHandle,
  loadRepresentedVendors,
  mapPriceAuthority,
  resolveProductPrice,
  mapHubProduct,
  buildValidationReport,
  hubToShopifyProduct,
  normalizeImageUrl,
};
