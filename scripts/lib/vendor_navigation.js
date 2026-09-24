'use strict';

/**
 * Canonical vendor-navigation helpers.
 *
 * The vendor list is data-driven from Shopify product.vendor values.
 * No vendor is enumerated here. This keeps onboarding and navigation in sync:
 * a newly represented vendor can be discovered without editing menu source.
 */

function normalizeVendorName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function handleize(value) {
  return normalizeVendorName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function buildVendorSpecs(vendorNames) {
  const byHandle = new Map();

  for (const raw of vendorNames || []) {
    const title = normalizeVendorName(raw);
    if (!title) continue;
    const handle = handleize(title);
    if (!handle) continue;

    const existing = byHandle.get(handle);
    if (!existing) {
      byHandle.set(handle, { title, vendor: title, handle });
      continue;
    }

    // Deterministic spelling if duplicate vendor values normalize to one handle.
    if (title.localeCompare(existing.title, 'en', { sensitivity: 'base' }) < 0) {
      byHandle.set(handle, { title, vendor: title, handle });
    }
  }

  return [...byHandle.values()].sort((a, b) =>
    a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
  );
}

function buildDesignerHttpItems(vendorSpecs, itemFactory) {
  return [
    itemFactory('View All Designers', '/pages/brands'),
    ...vendorSpecs.map((vendor) =>
      itemFactory(vendor.title, `/collections/${vendor.handle}`)
    ),
  ];
}

module.exports = {
  normalizeVendorName,
  handleize,
  buildVendorSpecs,
  buildDesignerHttpItems,
};
