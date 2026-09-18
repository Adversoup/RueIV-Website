/**
 * af_demo_handoff.js
 * Source#152 handoff normalization and validation.
 * Website consumes Hub-processed sync-ready media — raw vendor URLs are lineage only.
 */

'use strict';

const { resolveProductHubMedia } = require('./hub_media_resolver');

const RAW_MEDIA_HANDOFF_MODE = 'remote_source_url_import';
const HUB_PROCESSED_MEDIA_MODE = 'hub_processed_media';
const LEGACY_HUB_PROCESSED_MEDIA_MODE = 'hub_processed_media_sync_ready';

function isRawSourceOnlyUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  return /artisticframe\.com\/public\/img/i.test(value)
    || (/^https?:\/\//i.test(value) && !isHubProcessedMediaRef(value));
}

function isHubProcessedMediaRef(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('/media/')) return true;
  if (value.startsWith('file://')) return true;
  if (value.startsWith('gid://')) return true;
  if (/cdn\.shopify\.com/i.test(value)) return true;
  if (/consortium|rueiv|hub-processed|hub\.media/i.test(value)) return true;
  return !isRawSourceOnlyUrl(value) && /^https?:\/\//i.test(value);
}

function resolveMediaHandoffMode(record, exportDoc) {
  return record.media_handoff_mode
    || exportDoc?.media_handoff_mode
    || exportDoc?.handoff?.media_handoff_mode
    || null;
}

function productSku(record) {
  return record.vendor_sku || record.sku || null;
}

function extractHubProcessedImages(record, options = {}) {
  const refs = [];
  const media = resolveProductHubMedia(record, options);
  if (media.localProcessed?.url) {
    refs.push(media.localProcessed.url);
  } else if (media.hubPublicCandidates[0]?.url) {
    refs.push(media.hubPublicCandidates[0].url);
  } else if (media.primary?.url) {
    refs.push(media.primary.url);
  }

  const arrays = [
    record.hub_processed_images,
    record.processed_media_refs,
    record.sync_ready_media_refs,
    record.media_refs,
  ];
  for (const arr of arrays) {
    if (Array.isArray(arr)) {
      for (const url of arr.filter(Boolean)) {
        const value = String(url).trim();
        if (isHubProcessedMediaRef(value) && !refs.includes(value)) refs.push(value);
      }
    }
  }

  if (Array.isArray(record.images)) {
    for (const url of record.images.filter(Boolean)) {
      const value = String(url).trim();
      if (isHubProcessedMediaRef(value) && !refs.includes(value)) refs.push(value);
    }
  }

  return refs;
}

function extractRawSourceUrls(record) {
  const urls = [];
  if (record.primary_image_source_url) urls.push(record.primary_image_source_url);
  if (Array.isArray(record.primary_image_source_urls)) urls.push(...record.primary_image_source_urls);
  if (Array.isArray(record.gallery_image_source_urls)) urls.push(...record.gallery_image_source_urls);
  return [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))];
}

/** @deprecated use extractHubProcessedImages */
function extractRemoteSourceUrls(record, options = {}) {
  const processed = extractHubProcessedImages(record, options);
  if (processed.length) return processed;
  const urls = [];
  if (Array.isArray(record.images)) urls.push(...record.images.filter(Boolean));
  urls.push(...extractRawSourceUrls(record));
  return [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))];
}

function normalizeSource152Product(record, exportDoc, options = {}) {
  const sku = productSku(record);
  const brandName = typeof record.brand === 'string'
    ? record.brand
    : (record.canonical_vendor || record.brand?.display_name || 'Artistic Frame');
  const images = extractHubProcessedImages(record, options);
  const media = resolveProductHubMedia(record, options);

  const normalized = {
    ...record,
    sku,
    vendor_sku: sku,
    title: record.title,
    canonical_vendor: brandName,
    category: record.category || record.product_type || 'furniture',
    product_type: record.product_type || record.category,
    status: record.status || 'APPROVED',
    description_html: record.description_html || record.description || '',
    price: record.price != null ? String(record.price) : record.price,
    price_source: record.price_source || null,
    price_hidden: record.price_hidden,
    images,
    hub_media: media,
    media_sync_ready: record.media_sync_ready === true,
    media_handoff_mode: resolveMediaHandoffMode(record, exportDoc) || exportDoc?.media_handoff_mode,
    brand: typeof record.brand === 'object'
      ? record.brand
      : { tier: 'partner', collection_handle: 'artistic-frame', display_name: brandName },
  };

  return normalized;
}

function normalizeHandoffProduct(record, exportDoc, options = {}) {
  if (record.vendor_sku || record.primary_image_hub_url || record.primary_image_processed_ref) {
    return normalizeSource152Product(record, exportDoc, options);
  }

  const mode = resolveMediaHandoffMode(record, exportDoc);
  const images = extractHubProcessedImages(record, options);
  const normalized = { ...record, images };

  if (mode) normalized.media_handoff_mode = mode;
  if (record.media_status || exportDoc?.media_status) {
    normalized.media_status = record.media_status || exportDoc?.media_status;
  }

  return normalized;
}

function normalizeHandoffProducts(products, exportDoc, options = {}) {
  return products.map((p) => normalizeHandoffProduct(p, exportDoc, options));
}

function validateSource152Provenance(manifest, exportDoc, config = {}) {
  const issues = [];
  const upstream = config.upstream || {};
  const targetCount = config.limits?.target_products || 50;

  const manifestFp = manifest.fingerprint_sha256 || manifest.manifest?.fingerprint_sha256 || null;
  const payloadFp = exportDoc.payload_fingerprint_sha256 || exportDoc.export_fingerprint_sha256 || null;
  const cohortFp = exportDoc.cohort_manifest_fingerprint || null;

  if (upstream.manifest_fingerprint && manifestFp !== upstream.manifest_fingerprint) {
    issues.push(`manifest fingerprint_sha256 mismatch: expected ${upstream.manifest_fingerprint}, got ${manifestFp || '(none)'}`);
  }
  if (upstream.payload_fingerprint && payloadFp !== upstream.payload_fingerprint) {
    issues.push(`payload payload_fingerprint_sha256 mismatch: expected ${upstream.payload_fingerprint}, got ${payloadFp || '(none)'}`);
  }
  if (upstream.manifest_fingerprint && cohortFp && cohortFp !== upstream.manifest_fingerprint) {
    issues.push(`payload cohort_manifest_fingerprint mismatch: expected ${upstream.manifest_fingerprint}, got ${cohortFp}`);
  }

  const manifestCount = manifest.cohort_size ?? manifest.manifest?.selected_records ?? null;
  const payloadCount = exportDoc.product_count
    ?? (Array.isArray(exportDoc.products) ? exportDoc.products.length : null);

  if (manifestCount != null && manifestCount !== targetCount) {
    issues.push(`manifest cohort_size must be ${targetCount} (got ${manifestCount})`);
  }
  if (payloadCount != null && payloadCount !== targetCount) {
    issues.push(`payload product_count must be ${targetCount} (got ${payloadCount})`);
  }

  const mediaMode = exportDoc.media_handoff_mode;
  if (mediaMode !== HUB_PROCESSED_MEDIA_MODE) {
    issues.push(`payload media_handoff_mode must be ${HUB_PROCESSED_MEDIA_MODE} (got ${mediaMode || '(none)'})`);
  }

  return {
    ok: issues.length === 0,
    issues,
    fingerprints: {
      manifest_fingerprint_sha256: manifestFp,
      payload_fingerprint_sha256: payloadFp,
      cohort_manifest_fingerprint: cohortFp,
    },
    counts: {
      manifest_cohort_size: manifestCount,
      payload_product_count: payloadCount,
    },
  };
}

function validateHubProcessedMediaHandoff(products, exportDoc, options = {}) {
  const expectedMode = options.expectedMode || HUB_PROCESSED_MEDIA_MODE;
  const issues = [];

  const exportMode = resolveMediaHandoffMode({}, exportDoc) || exportDoc?.media_handoff_mode;
  if (exportMode === RAW_MEDIA_HANDOFF_MODE) {
    issues.push(`export media_handoff_mode ${RAW_MEDIA_HANDOFF_MODE} is raw-source-only — Hub-processed media required`);
  }
  if (exportMode === LEGACY_HUB_PROCESSED_MEDIA_MODE) {
    issues.push(`export media_handoff_mode ${LEGACY_HUB_PROCESSED_MEDIA_MODE} is legacy — expected ${HUB_PROCESSED_MEDIA_MODE}`);
  }
  if (exportMode && exportMode !== expectedMode) {
    issues.push(`export media_handoff_mode must be ${expectedMode} (got ${exportMode})`);
  }

  for (const p of products) {
    const sku = productSku(p) || '?';
    const mode = resolveMediaHandoffMode(p, exportDoc);
    if (mode === RAW_MEDIA_HANDOFF_MODE) {
      issues.push(`SKU ${sku}: raw remote_source_url_import rejected — Hub-processed media required`);
      continue;
    }

    if (p.media_sync_ready !== true) {
      issues.push(`SKU ${sku}: media_sync_ready must be true`);
    }

    const processed = extractHubProcessedImages(p, options);
    const rawOnly = extractRawSourceUrls(p).filter(isRawSourceOnlyUrl);
    const hasHubRef = Boolean(p.primary_image_hub_url || p.primary_image_processed_ref || processed.length);

    if (!hasHubRef || processed.length === 0) {
      if (rawOnly.length > 0) {
        issues.push(`SKU ${sku}: raw primary_image_source_url(s) only — Hub-processed media ref required`);
      } else {
        issues.push(`SKU ${sku}: missing Hub-processed media ref / hub URL`);
      }
    }
  }

  return { ok: issues.length === 0, issues, expectedMode };
}

/** @deprecated */
function validateRemoteMediaHandoff(products, exportDoc, options = {}) {
  return validateHubProcessedMediaHandoff(products, exportDoc, options);
}

function resolveAuthoritativePrice(record) {
  if (record.price != null && record.price !== '') {
    const parsed = parseFloat(record.price);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return { price: String(record.price), source: 'price' };
    }
  }
  const variants = Array.isArray(record.variants) ? record.variants : [];
  for (const variant of variants) {
    if (variant.price != null && variant.price !== '') {
      const parsed = parseFloat(variant.price);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return { price: String(variant.price), source: 'variants[].price' };
      }
    }
  }
  return null;
}

function validateAuthoritativePrices(products) {
  const issues = [];
  for (const p of products) {
    const sku = productSku(p) || '?';
    const resolved = resolveAuthoritativePrice(p);
    if (!resolved) {
      issues.push(`SKU ${sku}: missing authoritative numeric price`);
      continue;
    }
    if (!p.price_source) {
      issues.push(`SKU ${sku}: missing price_source`);
    }
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  RAW_MEDIA_HANDOFF_MODE,
  HUB_PROCESSED_MEDIA_MODE,
  LEGACY_HUB_PROCESSED_MEDIA_MODE,
  REMOTE_MEDIA_HANDOFF_MODE: RAW_MEDIA_HANDOFF_MODE,
  isHubProcessedMediaRef,
  isRawSourceOnlyUrl,
  extractHubProcessedImages,
  extractRawSourceUrls,
  extractRemoteSourceUrls,
  resolveMediaHandoffMode,
  productSku,
  normalizeSource152Product,
  normalizeHandoffProduct,
  normalizeHandoffProducts,
  validateSource152Provenance,
  validateHubProcessedMediaHandoff,
  validateRemoteMediaHandoff,
  resolveAuthoritativePrice,
  validateAuthoritativePrices,
};
