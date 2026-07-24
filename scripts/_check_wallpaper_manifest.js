#!/usr/bin/env node
/**
 * Quick check: which wallpaper products got blur-expanded vs cropped
 */
'use strict';
const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'out', 'image_manifest.json'), 'utf8'));

console.log('=== Wallpaper products in manifest ===\n');
let count = 0;
for (const [gid, entry] of Object.entries(manifest)) {
  const handle = entry.handle || '';
  // Wallpaper SKUs typically start with 97 or 98
  if (handle.match(/97\d|98\d/) || handle.toLowerCase().includes('wallpaper')) {
    console.log(`  ${handle.padEnd(40)} strategy=${entry.strategy || '?'}`);
    count++;
  }
}
console.log(`\nTotal: ${count}`);

console.log('\n=== ALL strategies summary ===');
const strats = {};
for (const entry of Object.values(manifest)) {
  const s = entry.strategy || 'unknown';
  strats[s] = (strats[s] || 0) + 1;
}
for (const [s, n] of Object.entries(strats)) {
  console.log(`  ${s}: ${n}`);
}

// Also list wallpaper handles from out/images
console.log('\n=== Wallpaper dirs in out/images ===');
const imagesDir = path.join(__dirname, '..', 'out', 'images');
const dirs = fs.readdirSync(imagesDir).filter(d => d.match(/97\d|98\d/));
for (const d of dirs) {
  const files = fs.readdirSync(path.join(imagesDir, d));
  console.log(`  ${d.padEnd(40)} files: ${files.join(', ')}`);
}
