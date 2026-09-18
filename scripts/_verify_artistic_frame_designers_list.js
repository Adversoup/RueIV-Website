#!/usr/bin/env node
/**
 * Static verification: Artistic Frame appears alphabetically in Designers list
 * definitions (no Shopify API required).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function extractDesignersBlock(src, marker) {
  const idx = src.indexOf(marker);
  assert(idx >= 0, `marker not found: ${marker}`);
  if (idx < 0) return '';
  return src.slice(idx, idx + 1800);
}

const menuV2 = fs.readFileSync(path.join(root, 'scripts/build_main_menu_v2.js'), 'utf8');
const block = extractDesignersBlock(menuV2, "col('Designers', 'designers'");
assert(block.includes("col('Artistic Frame', 'artistic-frame'"), 'build_main_menu_v2 missing Artistic Frame');
const arteIdx = block.indexOf("col('Arte'");
const afIdx = block.indexOf("col('Artistic Frame'");
const ccIdx = block.indexOf("col('C&C Milano'");
assert(arteIdx >= 0 && afIdx > arteIdx, 'Artistic Frame must follow Arte');
assert(ccIdx < 0 || afIdx < ccIdx, 'Artistic Frame must precede C&C Milano');

const fixVendors = fs.readFileSync(path.join(root, 'scripts/fix_vendors.js'), 'utf8');
assert(fixVendors.includes("col('Artistic Frame', 'artistic-frame')"), 'fix_vendors menu missing AF');
assert(fixVendors.includes("handle: 'artistic-frame'"), 'fix_vendors VENDOR_COLLECTIONS missing AF');

const mega = fs.readFileSync(path.join(root, 'scripts/create_mega_menus.js'), 'utf8');
assert(
  (mega.match(/Artistic Frame/g) || []).length >= 2,
  'create_mega_menus must list Artistic Frame in featured + A-Z'
);

const audit = fs.readFileSync(path.join(root, 'scripts/_audit_handles.js'), 'utf8');
assert(audit.includes("'artistic-frame'"), '_audit_handles missing artistic-frame');

const brandTop = fs.readFileSync(
  path.join(root, 'theme/templates/collection.brand-top.json'),
  'utf8'
);
assert(brandTop.includes('artistic_frame_breaker'), 'brand-top missing artistic_frame_breaker');
assert(brandTop.includes('"collection": "artistic-frame"'), 'brand-top breaker must target artistic-frame');

const addScript = fs.readFileSync(
  path.join(root, 'scripts/add_artistic_frame_to_designers_menu.js'),
  'utf8'
);
assert(addScript.includes('Artistic Frame'), 'add script missing title');
assert(addScript.includes('artistic-frame-demo'), 'add script should fallback to demo handle');

if (failures.length) {
  console.error('VERIFY FAIL');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}

console.log('VERIFY OK — Artistic Frame is wired into Designers list definitions');
console.log('  · scripts/build_main_menu_v2.js (A–Z after Arte)');
console.log('  · scripts/fix_vendors.js (menu + smart collection)');
console.log('  · scripts/create_mega_menus.js (featured + A–Z)');
console.log('  · scripts/_audit_handles.js');
console.log('  · theme/templates/collection.brand-top.json (brand breaker)');
console.log('  · scripts/add_artistic_frame_to_designers_menu.js (live apply helper)');
