#!/usr/bin/env node
'use strict';

/**
 * Offline dry-run preview for dynamic vendor navigation.
 * Simulates Shopify product.vendor discovery and prints the generated
 * Designers submenu without calling Shopify APIs.
 */

const {
  buildVendorSpecs,
  buildDesignerHttpItems,
} = require('./lib/vendor_navigation');

// Realistic fixture: canonical vendor display names as returned by Shopify
// product.vendor after Hub sync. Artistic Frame is included as a discovered
// value — not injected by hardcoded menu logic.
const FIXTURE_VENDOR_NAMES = [
  'Arte',
  'Artistic Frame',
  'Alexander Lamont',
  'Altura',
  'CC Milano',
  'Chase Erwin',
  'Fabricut',
  'Porta Romana',
  'Verellen',
  'Zimmer + Rohde',
  'Artistic Frame', // duplicate row — deduped by buildVendorSpecs
  '  Artistic   Frame  ',
];

const STORE = process.env.SHOPIFY_STORE || 'ruefour.myshopify.com';
const vendorSpecs = buildVendorSpecs(FIXTURE_VENDOR_NAMES);
const designerItems = buildDesignerHttpItems(vendorSpecs, (title, path) => ({
  title,
  url: `https://${STORE}${path}`,
  type: 'HTTP',
}));

const artisticFrame = vendorSpecs.find((spec) => spec.title === 'Artistic Frame');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║ Dynamic Vendor Navigation — OFFLINE DRY-RUN PREVIEW    ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Fixture product rows: ${FIXTURE_VENDOR_NAMES.filter(Boolean).length}`);
console.log(`Unique vendors:       ${vendorSpecs.length}`);
console.log('');

if (!artisticFrame) {
  console.error('FAIL — Artistic Frame not generated from discovery fixture');
  process.exit(1);
}

console.log('Artistic Frame (from discovery, not hardcoded list logic):');
console.log(`  title:  ${artisticFrame.title}`);
console.log(`  handle: ${artisticFrame.handle}`);
console.log(`  link:   https://${STORE}/collections/${artisticFrame.handle}`);
console.log('');

console.log('Designers submenu preview:');
console.log('  ├─ All Designers');
for (const spec of vendorSpecs) {
  const marker = spec.title === 'Artistic Frame' ? ' ← discovered' : '';
  console.log(`  ├─ ${spec.title} → /collections/${spec.handle}${marker}`);
}

console.log('');
console.log('Mega menu designers-featured / designers-all preview:');
for (const item of designerItems) {
  const marker = item.title === 'Artistic Frame' ? ' ← discovered' : '';
  console.log(`  ├─ ${item.title} → ${item.url.replace(`https://${STORE}`, '')}${marker}`);
}

console.log('');
console.log('VERIFY OK — Artistic Frame appears automatically from vendor discovery');
