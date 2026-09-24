#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildVendorSpecs,
  buildDesignerHttpItems,
  handleize,
  normalizeVendorName,
} = require('./lib/vendor_navigation');
const {
  collectionForVendor,
  planVendorNavigationSync,
  runFixtureDryRunProof,
  FIXTURE_VENDOR_NAMES,
  FIXTURE_COLLECTION_INDEX,
} = require('./fix_vendors');

const discovered = [
  'Arte',
  'Artistic Frame',
  'Zimmer + Rohde',
  'Porta Romana',
  '  Artistic   Frame  ',
  '',
];

const specs = buildVendorSpecs(discovered);
assert.deepStrictEqual(
  specs.map((x) => x.title),
  ['Arte', 'Artistic Frame', 'Porta Romana', 'Zimmer + Rohde']
);
assert.strictEqual(specs.find((x) => x.title === 'Artistic Frame').handle, 'artistic-frame');
assert.strictEqual(handleize('Zimmer + Rohde'), 'zimmer-rohde');
assert.strictEqual(normalizeVendorName('  Artistic   Frame '), 'Artistic Frame');

// Core invariant: output follows input. A vendor not present in discovery must
// not magically appear from a hardcoded menu list.
const withoutAf = buildVendorSpecs(['Arte', 'Porta Romana']);
assert.strictEqual(withoutAf.some((x) => x.title === 'Artistic Frame'), false);

const itemFactory = (title, path) => ({ title, url: `https://example.test${path}`, type: 'HTTP' });
const megaMenuItems = buildDesignerHttpItems(specs, itemFactory);
assert.strictEqual(
  megaMenuItems.some((item) => item.title === 'Artistic Frame' && item.url.includes('/collections/artistic-frame')),
  true
);

const artisticSpec = { title: 'Artistic Frame', vendor: 'Artistic Frame', handle: 'artistic-frame' };
assert.strictEqual(collectionForVendor(artisticSpec, FIXTURE_COLLECTION_INDEX), null);
assert.strictEqual(
  collectionForVendor({ title: 'Arte', vendor: 'Arte', handle: 'arte' }, FIXTURE_COLLECTION_INDEX).handle,
  'arte'
);

const plan = planVendorNavigationSync(FIXTURE_VENDOR_NAMES, FIXTURE_COLLECTION_INDEX, {
  storeHost: 'ruefour.myshopify.com',
});
assert.strictEqual(plan.collectionsToCreate.some((spec) => spec.title === 'Artistic Frame'), true);
assert.strictEqual(plan.designersChildren.some((item) => item.title === 'Artistic Frame'), true);
plan.designersChildren.forEach((item) => {
  if (item.type === 'COLLECTION') assert.ok(item.resourceId);
  if (item.type === 'HTTP') assert.ok(item.url);
});

runFixtureDryRunProof();

console.log('VERIFY OK — vendor navigation is data-driven and deterministic');
