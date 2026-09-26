/**
 * hub_media_resolver.js
 * Resolve Hub-processed media refs from Source#152 handoff into fetchable URLs.
 *
 * Priority:
 *   1) Consortium Hub public origin + primary_image_hub_url (/media/images/...)
 *   2) Checked-in processed asset under handoff media/ or repo-relative processed_ref
 *
 * Raw vendor URLs are never used as final Shopify media sources.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function loadHubOrigins(configOrigins = []) {
  const fromEnv = process.env.CONSORTIUM_HUB_PUBLIC_ORIGIN
    || process.env.HUB_PUBLIC_ORIGIN
    || null;
  const defaults = ['https://hub.rueiv.com', 'https://www.rueiv.com'];
  return [...new Set([fromEnv, ...configOrigins, ...defaults].filter(Boolean))];
}

function basenameFromProcessedRef(processedRef) {
  if (!processedRef) return null;
  return path.basename(String(processedRef).replace(/\\/g, '/'));
}

function localProcessedCandidates(record, options = {}) {
  const handoffDir = options.handoffDir || null;
  const root = options.root || process.cwd();
  const basename = basenameFromProcessedRef(record.primary_image_processed_ref);
  const sku = record.vendor_sku || record.sku;
  const candidates = [];

  if (handoffDir && basename) {
    candidates.push(path.join(handoffDir, 'media', 'processed', 'artistic-frame', basename));
    candidates.push(path.join(handoffDir, 'media', 'processed', basename));
  }
  if (handoffDir && sku) {
    candidates.push(path.join(handoffDir, 'media', 'processed', 'artistic-frame', `${sku}.jpg`));
    candidates.push(path.join(handoffDir, 'media', 'processed', 'artistic-frame', `${sku}.jpeg`));
  }
  if (record.primary_image_processed_ref) {
    candidates.push(path.join(root, String(record.primary_image_processed_ref).replace(/\\/g, '/')));
  }

  return [...new Set(candidates)];
}

function resolveHubPublicUrls(record, hubOrigins = []) {
  const hubPath = String(record.primary_image_hub_url || '').trim();
  if (!hubPath.startsWith('/media/')) return [];

  return hubOrigins.map((origin) => ({
    url: `${String(origin).replace(/\/$/, '')}${hubPath}`,
    source: 'hub_public',
    origin,
    hubPath,
  }));
}

function resolveLocalProcessedAsset(record, options = {}) {
  for (const candidate of localProcessedCandidates(record, options)) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return {
        url: `file://${candidate}`,
        source: 'local_processed',
        localPath: candidate,
      };
    }
  }
  return null;
}

function resolveProductHubMedia(record, options = {}) {
  const hubOrigins = loadHubOrigins(options.hubOrigins || []);
  const hubPublic = resolveHubPublicUrls(record, hubOrigins);
  const local = resolveLocalProcessedAsset(record, options);

  const primary = hubPublic[0] || local || null;
  const urls = [];
  if (primary?.url) urls.push(primary.url);
  if (local?.url && !urls.includes(local.url)) urls.push(local.url);
  for (const entry of hubPublic) {
    if (!urls.includes(entry.url)) urls.push(entry.url);
  }

  return {
    primary,
    urls,
    hubPublicCandidates: hubPublic,
    localProcessed: local,
    unresolved: !primary,
    lineage: {
      primary_image_hub_url: record.primary_image_hub_url || null,
      primary_image_processed_ref: record.primary_image_processed_ref || null,
    },
  };
}

function isLocalMediaUrl(url) {
  const value = String(url || '');
  return value.startsWith('file://') || (value.startsWith('/') && fs.existsSync(value));
}

function localPathFromMediaUrl(url) {
  const value = String(url || '');
  if (value.startsWith('file://')) return value.slice('file://'.length);
  if (value.startsWith('/') && fs.existsSync(value)) return value;
  return null;
}

async function probeUrlAccessible(url, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
  if (isLocalMediaUrl(url)) {
    const localPath = localPathFromMediaUrl(url);
    if (!localPath) return { ok: false, url, source: 'local_processed', status: 'missing' };
    const stat = fs.statSync(localPath);
    return {
      ok: stat.size > 512,
      url,
      source: 'local_processed',
      status: 'ready',
      bytes: stat.size,
      localPath,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'RueIV-AF-Demo-MediaProbe/1.0',
      },
    });
    const contentType = resp.headers.get('content-type') || '';
    const ok = resp.ok && !contentType.includes('text/html') && !contentType.includes('text/plain');
    return {
      ok,
      url,
      source: 'hub_public',
      status: resp.status,
      contentType,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      source: 'hub_public',
      status: 'error',
      error: err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeProductMediaAccessibility(record, options = {}) {
  const resolved = resolveProductHubMedia(record, options);
  const probeOrder = resolved.urls.slice(0, options.maxCandidates || 3);
  const attempts = [];

  for (const url of probeOrder) {
    const result = await probeUrlAccessible(url, options);
    attempts.push(result);
    if (result.ok) {
      return {
        ok: true,
        sku: record.vendor_sku || record.sku,
        selectedUrl: url,
        selectedSource: result.source,
        attempts,
        resolved,
      };
    }
  }

  return {
    ok: false,
    sku: record.vendor_sku || record.sku,
    selectedUrl: null,
    selectedSource: null,
    attempts,
    resolved,
    blocker: resolved.unresolved
      ? 'missing Hub-processed media ref'
      : 'Hub public media URL not fetchable and no local processed asset present',
  };
}

module.exports = {
  loadHubOrigins,
  resolveHubPublicUrls,
  resolveLocalProcessedAsset,
  resolveProductHubMedia,
  probeUrlAccessible,
  probeProductMediaAccessibility,
  isLocalMediaUrl,
  localPathFromMediaUrl,
  localProcessedCandidates,
};
