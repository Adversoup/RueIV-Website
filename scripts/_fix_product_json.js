#!/usr/bin/env node
// Fix product.json — remove demo sections, keep only relevant ones
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, '..', 'theme', 'templates', 'product.json');
const content = fs.readFileSync(fp, 'utf8');

// Strip the comment header
const json = JSON.parse(content.replace(/^\/\*[\s\S]*?\*\/\s*/, ''));

// Find the correctly-typed related_products_rueiv
// There may be a duplicate with type "testimonials" — we want "pdp-related-products"
let relatedSection = null;
for (const [key, section] of Object.entries(json.sections)) {
  if (section.type === 'pdp-related-products') {
    relatedSection = section;
    break;
  }
}

if (!relatedSection) {
  relatedSection = {
    type: 'pdp-related-products',
    settings: {
      heading: 'You may also like',
      text_alignment: 'center',
      limit: 8,
      columns: 4,
      columns_mobile: '2',
      image_ratio: 'square',
      padding_top: 60,
      padding_bottom: 60
    }
  };
}

// Keep only breadcrumbs, main, and related_products_rueiv
const newSections = {
  breadcrumbs: json.sections.breadcrumbs,
  main: json.sections.main,
  related_products_rueiv: relatedSection
};

json.sections = newSections;
json.order = ['breadcrumbs', 'main', 'related_products_rueiv'];

// Re-add the header comment
const header = `/*
 * ------------------------------------------------------------
 * IMPORTANT: The contents of this file are auto-generated.
 *
 * This file may be updated by the Shopify admin theme editor
 * or related systems. Please exercise caution as any changes
 * made to this file may be overwritten.
 * ------------------------------------------------------------
 */
`;

fs.writeFileSync(fp, header + JSON.stringify(json, null, 2) + '\n', 'utf8');
console.log('product.json cleaned:');
console.log('  Sections:', Object.keys(json.sections).join(', '));
console.log('  Order:', json.order.join(', '));
console.log('  Main blocks:', json.sections.main.block_order.join(', '));
