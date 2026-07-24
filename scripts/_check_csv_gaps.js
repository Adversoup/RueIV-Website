#!/usr/bin/env node
// Check CSV source data for missing color/material
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const core = parse(fs.readFileSync('mnt/data/core_products.csv', 'utf8'), { columns: true, skip_empty_lines: true });

const noColor = core.filter(r => {
  const v = (r.color || '').trim();
  return v === '';
});

const noMaterial = core.filter(r => {
  const v = (r.material || '').trim();
  return v === '';
});

console.log('=== CSV SOURCE DATA GAPS ===');
console.log('Total rows:', core.length);
console.log('');
console.log(`Missing COLOR in CSV (${noColor.length}):`);
noColor.forEach(r => console.log(`  [${r.category}] ${r.name} (${r.vendor})`));
console.log('');
console.log(`Missing MATERIAL in CSV (${noMaterial.length}):`);
noMaterial.forEach(r => console.log(`  [${r.category}] ${r.name} (${r.vendor})`));

// Also check fabric for composition and usage
const fabAttr = parse(fs.readFileSync('mnt/data/fabric_attributes.csv', 'utf8'), { columns: true, skip_empty_lines: true });
const noComp = fabAttr.filter(r => {
  const v = (r.composition || '').trim();
  return v === '';
});
const noUsage = fabAttr.filter(r => {
  const v = (r.usage || '').trim();
  return v === '';
});
console.log('');
console.log(`Fabric: Missing COMPOSITION in CSV (${noComp.length}/${fabAttr.length}):`);
noComp.forEach(r => console.log(`  ${r.sku}`));
console.log(`Fabric: Missing USAGE in CSV (${noUsage.length}/${fabAttr.length}):`);
noUsage.forEach(r => console.log(`  ${r.sku}`));

// Wallpaper roll_width
const wpAttr = parse(fs.readFileSync('mnt/data/wallpaper_attributes.csv', 'utf8'), { columns: true, skip_empty_lines: true });
const noWidth = wpAttr.filter(r => {
  const v = (r.roll_width || '').trim();
  return v === '';
});
console.log('');
console.log(`Wallpaper: Missing ROLL_WIDTH in CSV (${noWidth.length}/${wpAttr.length}):`);
noWidth.forEach(r => console.log(`  ${r.sku}`));
