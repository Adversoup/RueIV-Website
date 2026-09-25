'use strict';

const fs = require('fs');
const path = require('path');

const DIM_KEYS = ['height', 'width', 'depth', 'diameter', 'length', 'weight'];
const DIM_LABELS = {
  height: 'Height',
  width: 'Width',
  depth: 'Depth',
  diameter: 'Diameter',
  length: 'Length',
  weight: 'Weight',
};

function isBlank(value) {
  if (value == null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * Mirrors rueiv-product-specs.liquid dimension resolution:
 * prefer rueiv.dimensions, fallback to rueiv.dimensions_json.
 */
function resolveDimensions(metafields = {}) {
  const primary = metafields['rueiv.dimensions'];
  if (!isBlank(primary)) return primary;

  const fallback = metafields['rueiv.dimensions_json'];
  if (!isBlank(fallback)) return fallback;

  return null;
}

/**
 * Renders the Dimensions accordion body markup from rueiv-product-specs.liquid.
 */
function renderDimensionsAccordion(dims) {
  if (isBlank(dims)) return '';

  const items = DIM_KEYS.filter((key) => !isBlank(dims[key])).map((key) => {
    const value = String(dims[key]).trim();
    const label = DIM_LABELS[key];
    return [
      '          <div class="rv-specs__dim-item">',
      `            <div class="rv-specs__dim-val">${value}</div>`,
      `            <div class="rv-specs__dim-label">${label}</div>`,
      '          </div>',
    ].join('\n');
  });

  if (items.length === 0 && isBlank(dims.unit)) return '';

  const lines = [
    '  <details class="rv-specs__panel">',
    '    <summary class="rv-specs__toggle">',
    '      Dimensions',
    '      <span class="rv-specs__toggle-icon"></span>',
    '    </summary>',
    '    <div class="rv-specs__body">',
    '      <div class="rv-specs__dims-grid">',
    ...items,
    '      </div>',
  ];

  if (!isBlank(dims.unit)) {
    lines.push(`        <div class="rv-specs__dim-unit">All measurements in ${String(dims.unit).trim()}</div>`);
  }

  lines.push('    </div>', '  </details>');
  return lines.join('\n');
}

function loadSampleDimensions() {
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'dimensions_sample.json');
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function liquidHasDimensionsFallback(liquidSource) {
  return (
    liquidSource.includes('product.metafields.rueiv.dimensions.value') &&
    liquidSource.includes('product.metafields.rueiv.dimensions_json.value')
  );
}

module.exports = {
  DIM_KEYS,
  resolveDimensions,
  renderDimensionsAccordion,
  loadSampleDimensions,
  liquidHasDimensionsFallback,
};
