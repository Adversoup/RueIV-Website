/**
 * af_demo_handoff.js
 * Source#146 handoff normalization and validation.
 * Website consumes Hub-processed sync-ready media — raw remote_source_url_import is rejected.
 */

'use strict';

const RAW_MEDIA_HANDOFF_MODE = 'remote_source_url_import';
const HUB_PROCESSED_MEDIA_MODE = 'hub_processed_media_sync_ready';
const HUB_MEDIA_READY_STATUSES = new Set(['sync_ready', 'ready', 'processed']);

function isRawSourceOnlyUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  return /artisticframe\.com\/public\/img/i.test(value)
    || (/^https?:\/\//i.test(value) && !isHubProcessedMediaRef(value));
}

function isHubProcessedMediaRef(url) {
  const value = String(url || '').trim();
  if (!value) return false;
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

function resolveMediaStatus(record, exportDoc) {
  return record.media_status
    || record.media_sync_status
    || exportDoc?.media_status
    || exportDoc?.handoff?.media_status
    || null;
}

function extractHubProcessedImages(record) {
  const refs = [];
  const arrays = [
    record.hub_processed_images,
    record.processed_media_refs,
    record.sync_ready_media_refs,
    record.media_refs,
  ];
  for (const arr of arrays) {
    if (Array.isArray(arr)) refs.push(...arr.filter(Boolean));
  }
  if (Array.isArray(record.images)) {
    for (const url of record.images.filter(Boolean)) {
      if (isHubProcessedMediaRef(url)) refs.push(url);
    }
  }
  return [...new Set(refs.map((u) => String(u).trim()).filter(Boolean))];
}

function extractRawSourceUrls(record) {
  const urls = [];
  if (record.primary_image_source_url) urls.push(record.primary_image_source_url);
  if (Array.isArray(record.primary_image_source_urls)) urls.push(...record.primary_image_source_urls);
  if (Array.isArray(record.gallery_image_source_urls)) urls.push(...record.gallery_image_source_urls);
  return [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))];
}

/** @deprecated use extractHubProcessedImages */
function extractRemoteSourceUrls(record) {
  const processed = extractHubProcessedImages(record);
  if (processed.length) return processed;
  const urls = [];
  if (Array.isArray(record.images)) urls.push(...record.images.filter(Boolean));
  urls.push(...extractRawSourceUrls(record));
  return [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))];
}

function normalizeHandoffProduct(record, exportDoc) {
  const mode = resolveMediaHandoffMode(record, exportDoc);
  const images = extractHubProcessedImages(record);
  const normalized = { ...record, images };

  if (mode) normalized.media_handoff_mode = mode;
  if (resolveMediaStatus(record, exportDoc)) {
    normalized.media_status = resolveMediaStatus(record, exportDoc);
  }

  return normalized;
}

function normalizeHandoffProducts(products, exportDoc) {
  return products.map((p) => normalizeHandoffProduct(p, exportDoc));
}

function validateHubProcessedMediaHandoff(products, exportDoc, options = {}) {
  const expectedMode = options.expectedMode || HUB_PROCESSED_MEDIA_MODE;
  const issues = [];

  const exportMode = resolveMediaHandoffMode({}, exportDoc) || exportDoc?.media_handoff_mode;
  if (exportMode === RAW_MEDIA_HANDOFF_MODE) {
    issues.push(`export media_handoff_mode ${RAW_MEDIA_HANDOFF_MODE} is raw-source-only — wait for Hub-processed sync-ready handoff`);
  }
  if (exportMode && exportMode !== expectedMode) {
    issues.push(`export media_handoff_mode must be ${expectedMode} (got ${exportMode})`);
  }

  const exportStatus = resolveMediaStatus({}, exportDoc);
  if (exportStatus && !HUB_MEDIA_READY_STATUSES.has(String(exportStatus).toLowerCase())) {
    issues.push(`export media_status must be sync-ready (got ${exportStatus})`);
  }

  for (const p of products) {
    const mode = resolveMediaHandoffMode(p, exportDoc);
    if (mode === RAW_MEDIA_HANDOFF_MODE) {
      issues.push(`SKU ${p.sku || '?'}: raw remote_source_url_import rejected — Hub-processed media required`);
      continue;
    }
    if (mode && mode !== expectedMode) {
      issues.push(`SKU ${p.sku || '?'}: media_handoff_mode must be ${expectedMode} (got ${mode})`);
    }

    const status = resolveMediaStatus(p, exportDoc);
    if (status && !HUB_MEDIA_READY_STATUSES.has(String(status).toLowerCase())) {
      issues.push(`SKU ${p.sku || '?'}: media_status must be sync-ready (got ${status})`);
    }

    const processed = extractHubProcessedImages(p);
    const rawOnly = extractRawSourceUrls(p).filter(isRawSourceOnlyUrl);
    if (processed.length === 0) {
      if (rawOnly.length > 0) {
        issues.push(`SKU ${p.sku || '?'}: raw primary_image_source_url(s) only — wait for Hub-processed media refs`);
      } else {
        issues.push(`SKU ${p.sku || '?'}: missing Hub-processed sync-ready media refs`);
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
    const resolved = resolveAuthoritativePrice(p);
    if (!resolved) {
      issues.push(`SKU ${p.sku || '?'}: missing authoritative price (price or variants[].price required; no fallback)`);
    }
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  RAW_MEDIA_HANDOFF_MODE,
  HUB_PROCESSED_MEDIA_MODE,
  REMOTE_MEDIA_HANDOFF_MODE: RAW_MEDIA_HANDOFF_MODE,
  isHubProcessedMediaRef,
  isRawSourceOnlyUrl,
  extractHubProcessedImages,
  extractRawSourceUrls,
  extractRemoteSourceUrls,
  resolveMediaHandoffMode,
  resolveMediaStatus,
  normalizeHandoffProduct,
  normalizeHandoffProducts,
  validateHubProcessedMediaHandoff,
  validateRemoteMediaHandoff,
  resolveAuthoritativePrice,
  validateAuthoritativePrices,
};
