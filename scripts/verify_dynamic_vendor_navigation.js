#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildVendorSpecs,
  handleize,
  normalizeVendorName,
} = require('./lib/vendor_navigation');

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

console.log('VERIFY OK — vendor navigation is data-driven and deterministic');
