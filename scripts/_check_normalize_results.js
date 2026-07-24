#!/usr/bin/env node
const m = require('../out/image_manifest.json');
const r = require('../out/image_report.json');

// Check failed entries
const failed = r.entries.filter(e => e.error);
console.log('FAILED:');
for (const f of failed) console.log(' ', f.handle, f.error);

// Check newly processed entries
const processed = r.entries.filter(e => e.strategy && e.output_files && Object.keys(e.output_files).length > 0 && e.warnings.length < 2);
console.log('\nNEWLY PROCESSED:');
for (const p of processed) console.log(' ', p.handle, p.strategy);

// Check how many wallpaper-looking products are NOT in manifest
const allHandles = r.entries.map(e => e.handle);
const wpHandles = allHandles.filter(h => 
  ['bouquet','ramage','brocade','bucolique','escapade','floraison','ornement','collines',
   'riverbank','kashmir','kerala','bundi','mandu','agra','poona','ibis','abydos','siwa',
   'sakkara','amarna','avra','allagi','galon','r-colte'].some(x => h && h.includes(x))
);
console.log('\nWallpaper handles in report:', wpHandles.length);
for (const h of wpHandles) {
  const entry = r.entries.find(e => e.handle === h);
  const skipped = entry.warnings.some(w => w.includes('Skipped'));
  const noImg = entry.warnings.some(w => w.includes('No featured'));
  console.log(`  ${h}: ${entry.error ? 'ERROR' : skipped ? 'SKIPPED (in manifest)' : noImg ? 'NO IMAGE' : 'PROCESSED'} ${entry.strategy || ''}`);
}

console.log('\nTotal manifest entries:', Object.keys(m).length);
