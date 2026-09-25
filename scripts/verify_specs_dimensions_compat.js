#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  resolveDimensions,
  renderDimensionsAccordion,
  loadSampleDimensions,
  liquidHasDimensionsFallback,
} = require('./lib/specs_dimensions');

const SNIPPET_PATH = path.join(__dirname, '..', 'theme', 'snippets', 'rueiv-product-specs.liquid');
const liquidSource = fs.readFileSync(SNIPPET_PATH, 'utf8');

assert.strictEqual(
  liquidHasDimensionsFallback(liquidSource),
  true,
  'rueiv-product-specs.liquid must prefer rueiv.dimensions and fallback to rueiv.dimensions_json'
);

const sample = loadSampleDimensions();

const legacyOnly = {
  'rueiv.dimensions': { ...sample },
};

const jsonOnly = {
  'rueiv.dimensions_json': { ...sample },
};

const bothPresent = {
  'rueiv.dimensions': { ...sample, height: '40' },
  'rueiv.dimensions_json': { ...sample, height: '99' },
};

const neitherPresent = {};

const legacyHtml = renderDimensionsAccordion(resolveDimensions(legacyOnly));
const jsonHtml = renderDimensionsAccordion(resolveDimensions(jsonOnly));

assert.strictEqual(
  legacyHtml,
  jsonHtml,
  'Dimensions accordion must render identically from rueiv.dimensions and rueiv.dimensions_json'
);
assert.ok(legacyHtml.includes('Dimensions'), 'expected Dimensions accordion heading');
assert.ok(legacyHtml.includes('rv-specs__dims-grid'), 'expected dimensions grid markup');
assert.ok(legacyHtml.includes('All measurements in inches'), 'expected unit line');

const preferred = resolveDimensions(bothPresent);
assert.strictEqual(preferred.height, '40', 'rueiv.dimensions must win when both keys are present');

const absent = resolveDimensions(neitherPresent);
assert.strictEqual(absent, null, 'missing both keys must not invent dimension values');
assert.strictEqual(renderDimensionsAccordion(absent), '', 'blank dimensions must not render accordion');

console.log('VERIFY OK — rueiv.dimensions and rueiv.dimensions_json render the same Dimensions accordion');
