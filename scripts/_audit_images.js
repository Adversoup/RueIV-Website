#!/usr/bin/env node
// Quick audit: check all generated square images for dimensions
'use strict';
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const imgDir = path.resolve(__dirname, '..', 'out', 'images');
const dirs = fs.readdirSync(imgDir).filter(d => fs.statSync(path.join(imgDir, d)).isDirectory());

(async () => {
  let square = 0, notSquare = 0, noFile = 0;
  const issues = [];

  for (const d of dirs) {
    const webp = path.join(imgDir, d, d + '_sq_1200.webp');
    if (!fs.existsSync(webp)) { noFile++; continue; }
    const meta = await sharp(webp).metadata();
    const isSquare = meta.width === meta.height;
    if (isSquare) {
      square++;
    } else {
      notSquare++;
      issues.push(`${d}: ${meta.width}x${meta.height}`);
    }
  }

  console.log(`Square: ${square}, Not square: ${notSquare}, No file: ${noFile}`);
  if (issues.length > 0) {
    console.log('Non-square images:');
    issues.forEach(i => console.log('  ' + i));
  }

  // Also check strategy distribution from report
  const reportPath = path.resolve(__dirname, '..', 'out', 'image_report.json');
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const strategies = {};
    const noImage = [];
    const sizes = new Set();
    for (const e of report.entries) {
      if (!e.strategy) { noImage.push(e.handle); continue; }
      strategies[e.strategy] = (strategies[e.strategy] || 0) + 1;
      if (e.output_files && e.output_files.webp_1200) {
        const m = await sharp(e.output_files.webp_1200).metadata();
        sizes.add(`${m.width}x${m.height}`);
      }
    }
    console.log('\nStrategies:', strategies);
    console.log('Unique output sizes:', [...sizes]);
    console.log('Products with no image:', noImage.length);
  }
})();
