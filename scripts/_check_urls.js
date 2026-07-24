#!/usr/bin/env node
// Quick analysis of image URL issues in the CSV
'use strict';
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const rows = parse(fs.readFileSync('data/core_products.csv', 'utf8'), {
  columns: true, skip_empty_lines: true, relax_column_count: true, trim: true
});

let encoded = 0, noExt = 0, total = 0;

for (const r of rows) {
  for (let i = 1; i <= 3; i++) {
    const url = (r['image_url_' + i] || '').trim();
    if (!url || !url.startsWith('http')) continue;
    total++;
    const decoded = decodeURIComponent(url);
    if (decoded !== url) {
      encoded++;
      console.log('ENCODED:', url);
      console.log('  =>   ', decoded);
    }
    if (!/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(decoded)) {
      noExt++;
      console.log('NO-EXT:', url);
    }
  }
}
console.log('\nSummary: total=' + total + ' encoded=' + encoded + ' no-ext=' + noExt);
