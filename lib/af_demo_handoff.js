/**
 * af_demo_handoff.js
 * Source#146 text-enriched remote-media handoff normalization.
 */

'use strict';

const REMOTE_MEDIA_HANDOFF_MODE = 'remote_source_url_import';

function extractRemoteSourceUrls(record) {
  const urls = [];
  if (record.primary_image_source_url) urls.push(record.primary_image_source_url);
  if (Array.isArray(record.primary_image_source_urls)) urls.push(...record.primary_image_source_urls);
  if (Array.isArray(record.gallery_image_source_urls)) urls.push(...record.gallery_image_source_urls);
  if (Array.isArray(record.images)) urls.push(...record.images.filter(Boolean));
  return [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))];
}

function resolveMediaHandoffMode(record, exportDoc) {
  return record.media_handoff_mode
    || exportDoc?.media_handoff_mode
    || exportDoc?.handoff?.media_handoff_mode
    || REMOTE_MEDIA_HANDOFF_MODE;
}

function normalizeHandoffProduct(record, exportDoc) {
  const mode = resolveMediaHandoffMode(record, exportDoc);
  const images = extractRemoteSourceUrls(record);
  const normalized = { ...record, images };

  if (mode) normalized.media_handoff_mode = mode;
  if (record.primary_image_source_url && !normalized.primary_image_source_url) {
    normalized.primary_image_source_url = record.primary_image_source_url;
  }
  if (record.primary_image_source_urls?.length && !normalized.primary_image_source_urls) {
    normalized.primary_image_source_urls = record.primary_image_source_urls;
  }
  if (record.gallery_image_source_urls?.length && !normalized.gallery_image_source_urls) {
    normalized.gallery_image_source_urls = record.gallery_image_source_urls;
  }

  return normalized;
}

function normalizeHandoffProducts(products, exportDoc) {
  return products.map((p) => normalizeHandoffProduct(p, exportDoc));
}

function validateRemoteMediaHandoff(products, exportDoc, options = {}) {
  const expectedMode = options.expectedMode || REMOTE_MEDIA_HANDOFF_MODE;
  const issues = [];

  const exportMode = exportDoc?.media_handoff_mode || exportDoc?.handoff?.media_handoff_mode;
  if (exportMode && exportMode !== expectedMode) {
    issues.push(`export media_handoff_mode must be ${expectedMode} (got ${exportMode})`);
  }

  for (const p of products) {
    const mode = resolveMediaHandoffMode(p, exportDoc);
    if (mode !== expectedMode) {
      issues.push(`SKU ${p.sku || '?'}: media_handoff_mode must be ${expectedMode} (got ${mode})`);
    }
    const urls = extractRemoteSourceUrls(p);
    if (urls.length === 0) {
      issues.push(`SKU ${p.sku || '?'}: missing primary_image_source_url(s) for remote media import`);
    } else if (!p.primary_image_source_url && !p.primary_image_source_urls?.length && !p.images?.length) {
      issues.push(`SKU ${p.sku || '?'}: no explicit primary_image_source_url — only gallery_image_source_urls`);
    }
  }

  return { ok: issues.length === 0, issues, expectedMode };
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
  REMOTE_MEDIA_HANDOFF_MODE,
  extractRemoteSourceUrls,
  resolveMediaHandoffMode,
  normalizeHandoffProduct,
  normalizeHandoffProducts,
  validateRemoteMediaHandoff,
  resolveAuthoritativePrice,
  validateAuthoritativePrices,
};
