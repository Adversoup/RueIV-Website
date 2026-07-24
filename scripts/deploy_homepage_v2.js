#!/usr/bin/env node
/**
 * deploy_homepage_v2.js — Luxury Homepage Rebuild
 *
 * Deploys:
 *  1. rueiv-homepage.css (asset)
 *  2. 8 rueiv-* section .liquid files
 *  3. Removes old deprecated sections from theme
 *  4. Reads existing index.json, removes old showroom_* sections,
 *     inserts new rueiv-* sections after the hero slideshow
 *
 * SAFETY: Always reads index.json first and modifies in-place.
 */
require('dotenv').config();

const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;
const fs      = require('fs');
const path    = require('path');

const REST = `https://${store}/admin/api/${ver}`;

/* ── Helpers ─────────────────────────────────────────────────── */

async function restGet(p) {
  const res = await fetch(`${REST}${p}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  return res.json();
}

async function restPut(p, body) {
  const res = await fetch(`${REST}${p}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function restDelete(p) {
  const res = await fetch(`${REST}${p}`, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token }
  });
  return res.status;
}

async function putAsset(key, value) {
  return restPut(`/themes/${themeId}/assets.json`, { asset: { key, value } });
}

async function deleteAsset(key) {
  return restDelete(`/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`);
}

function readLocal(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ══════════════════════════════════════════════════════════════
   STEP 1 — Upload CSS
   ══════════════════════════════════════════════════════════════ */

async function uploadCSS() {
  console.log('\n━━━ STEP 1: Upload rueiv-homepage.css ━━━');
  const css = readLocal('theme/assets/rueiv-homepage.css');
  const r = await putAsset('assets/rueiv-homepage.css', css);
  if (r.asset) console.log('  ✓ rueiv-homepage.css uploaded');
  else console.error('  ✗ CSS upload failed:', JSON.stringify(r.errors || r));
  await sleep(500);
}

/* ══════════════════════════════════════════════════════════════
   STEP 2 — Upload Sections
   ══════════════════════════════════════════════════════════════ */

const SECTIONS = [
  'rueiv-hero.liquid',
  'rueiv-category-grid.liquid',
  'rueiv-quick-ship.liquid',
  'rueiv-new-arrivals.liquid',
  'rueiv-vibe-studio.liquid',
  'rueiv-featured-designers.liquid',
  'rueiv-lookbook.liquid',
  'rueiv-newsletter.liquid'
];

async function uploadSections() {
  console.log('\n━━━ STEP 2: Upload 8 section files ━━━');
  for (const file of SECTIONS) {
    const content = readLocal(`theme/sections/${file}`);
    const r = await putAsset(`sections/${file}`, content);
    if (r.asset) console.log(`  ✓ ${file}`);
    else console.error(`  ✗ ${file}:`, JSON.stringify(r.errors || r));
    await sleep(400);
  }
}

/* ══════════════════════════════════════════════════════════════
   STEP 3 — Clean up old section files from live theme
   ══════════════════════════════════════════════════════════════ */

const OLD_SECTIONS = [
  'sections/rueiv-editorial-grid.liquid',
  'sections/rueiv-product-grid.liquid'
];

async function cleanOldSections() {
  console.log('\n━━━ STEP 3: Remove deprecated section files ━━━');
  for (const key of OLD_SECTIONS) {
    const status = await deleteAsset(key);
    console.log(`  ${status === 200 ? '✓' : '⚠'} DELETE ${key} → ${status}`);
    await sleep(300);
  }
}

/* ══════════════════════════════════════════════════════════════
   STEP 4 — Rebuild index.json (SAFE: read → modify → write)
   ══════════════════════════════════════════════════════════════ */

// Old showroom section IDs to remove
const REMOVE_SECTION_IDS = [
  'showroom_categories',
  'showroom_quickship',
  'showroom_designers',
  'showroom_vibe',
  'showroom_newsletter'
];

// New section configs
const NEW_SECTIONS = {
  rueiv_hero: {
    type: 'rueiv-hero',
    settings: {},
    blocks: {
      slide_1: {
        type: 'slide',
        settings: {
          heading: 'Timeless Interiors',
          subheading: 'The Edit',
          description: 'Curated furniture, lighting, and décor from the world\'s finest ateliers.',
          button_label: 'Shop the Collection',
          button_url: '/collections/all'
        }
      }
    },
    block_order: ['slide_1']
  },
  rueiv_categories: {
    type: 'rueiv-category-grid',
    settings: { heading: 'Shop by Category' },
    blocks: {
      cat_furniture: { type: 'category', settings: { collection: 'furniture', label: 'Furniture' } },
      cat_lighting:  { type: 'category', settings: { collection: 'lighting',  label: 'Lighting' } },
      cat_wallpaper: { type: 'category', settings: { collection: 'wallpaper', label: 'Wallpaper' } },
      cat_fabric:    { type: 'category', settings: { collection: 'fabric',    label: 'Fabric' } },
      cat_rugs:      { type: 'category', settings: { collection: 'rugs',      label: 'Rugs' } },
      cat_accessories: { type: 'category', settings: { collection: 'accessories', label: 'Accessories' } }
    },
    block_order: ['cat_furniture', 'cat_lighting', 'cat_wallpaper', 'cat_fabric', 'cat_rugs', 'cat_accessories']
  },
  rueiv_quickship: {
    type: 'rueiv-quick-ship',
    settings: {
      heading: 'Quick Ship',
      description: 'In-stock designs, ready to ship within two weeks.',
      collection: 'quick-ship',
      products_to_show: 4,
      show_vendor: true,
      button_label: 'Shop All Quick Ship',
      button_url: '/collections/quick-ship'
    }
  },
  rueiv_arrivals: {
    type: 'rueiv-new-arrivals',
    settings: {
      heading: 'New Arrivals',
      collection: 'new-arrivals',
      products_to_show: 8,
      show_vendor: true,
      button_label: 'View All New Arrivals',
      button_url: '/collections/new-arrivals'
    }
  },
  rueiv_vibe: {
    type: 'rueiv-vibe-studio',
    settings: {
      heading: 'Vibe Studio',
      subheading: 'The Studio',
      text: 'Curated rooms and mood boards designed to inspire your next space — crafted by our in-house design team.',
      button_label: 'Explore the Studio',
      button_url: '/pages/vibe-studio'
    }
  },
  rueiv_designers: {
    type: 'rueiv-featured-designers',
    settings: {
      heading: 'Featured Designers',
      button_label: 'View All Designers',
      button_url: '/collections'
    },
    blocks: {
      d_fabricut: { type: 'designer', settings: { collection: 'fabricut',  name: 'Fabricut' } },
      d_currey:   { type: 'designer', settings: { collection: 'currey-company', name: 'Currey & Company' } },
      d_noir:     { type: 'designer', settings: { collection: 'noir',     name: 'Noir' } },
      d_regina:   { type: 'designer', settings: { collection: 'regina-andrew', name: 'Regina Andrew' } },
      d_gabby:    { type: 'designer', settings: { collection: 'gabby',    name: 'Gabby' } }
    },
    block_order: ['d_fabricut', 'd_currey', 'd_noir', 'd_regina', 'd_gabby']
  },
  rueiv_lookbook: {
    type: 'rueiv-lookbook',
    settings: { heading: 'The Lookbook' },
    blocks: {
      lb_1: { type: 'tile', settings: { caption: 'Modern Living' } },
      lb_2: { type: 'tile', settings: { caption: 'Coastal Retreat' } },
      lb_3: { type: 'tile', settings: { caption: 'Urban Loft' } },
      lb_4: { type: 'tile', settings: { caption: 'Classic Elegance' } },
      lb_5: { type: 'tile', settings: { caption: 'Minimalist' } },
      lb_6: { type: 'tile', settings: { caption: 'Art Deco' } },
      lb_7: { type: 'tile', settings: { caption: 'Bohemian' } },
      lb_8: { type: 'tile', settings: { caption: 'Scandinavian' } },
      lb_9: { type: 'tile', settings: { caption: 'Industrial' } }
    },
    block_order: ['lb_1','lb_2','lb_3','lb_4','lb_5','lb_6','lb_7','lb_8','lb_9']
  },
  rueiv_newsletter: {
    type: 'rueiv-newsletter',
    settings: {
      heading: 'The Vibe List',
      description: '<p>First access to new arrivals, exclusive collections, and design inspiration — delivered weekly.</p>',
      placeholder: 'Your email address',
      button_label: 'Subscribe'
    }
  }
};

const NEW_SECTION_ORDER = [
  'rueiv_hero',
  'rueiv_categories',
  'rueiv_quickship',
  'rueiv_arrivals',
  'rueiv_vibe',
  'rueiv_designers',
  'rueiv_lookbook',
  'rueiv_newsletter'
];

async function rebuildIndex() {
  console.log('\n━━━ STEP 4: Rebuild index.json (safe merge) ━━━');

  // 1. Read current index.json from live theme
  const r = await restGet(`/themes/${themeId}/assets.json?asset[key]=templates/index.json`);
  if (!r.asset) {
    console.error('  ✗ Could not read index.json:', JSON.stringify(r));
    return;
  }
  const current = JSON.parse(r.asset.value);
  console.log(`  Read index.json — ${Object.keys(current.sections).length} sections, order: [${current.order.join(', ')}]`);

  // 2. Save backup
  const backupPath = path.join(__dirname, '..', 'tmp', `index_backup_${Date.now()}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(current, null, 2));
  console.log(`  Backup saved → ${backupPath}`);

  // 3. Remove old showroom section IDs
  for (const id of REMOVE_SECTION_IDS) {
    if (current.sections[id]) {
      delete current.sections[id];
      console.log(`  Removed section: ${id}`);
    }
  }
  current.order = current.order.filter(id => !REMOVE_SECTION_IDS.includes(id));

  // 4. Also remove any existing rueiv_* IDs (in case of re-run)
  for (const id of NEW_SECTION_ORDER) {
    if (current.sections[id]) {
      delete current.sections[id];
    }
  }
  current.order = current.order.filter(id => !NEW_SECTION_ORDER.includes(id));

  // 5. Add new sections
  for (const id of NEW_SECTION_ORDER) {
    current.sections[id] = NEW_SECTIONS[id];
  }

  // 6. Insert new sections after position 0 (the slideshow)
  // Keep the first section (likely slideshow_zKPFFV) and insert after it
  const firstSection = current.order[0]; // hero slideshow
  const remaining = current.order.slice(1);
  current.order = [firstSection, ...NEW_SECTION_ORDER, ...remaining];

  console.log(`  New order: [${current.order.join(', ')}]`);
  console.log(`  Total sections: ${Object.keys(current.sections).length}`);

  // 7. Upload modified index.json
  const result = await putAsset('templates/index.json', JSON.stringify(current, null, 2));
  if (result.asset) {
    console.log('  ✓ index.json updated successfully');
  } else {
    console.error('  ✗ index.json upload failed:', JSON.stringify(result.errors || result));
  }
}

/* ══════════════════════════════════════════════════════════════
   STEP 5 — Verify
   ══════════════════════════════════════════════════════════════ */

async function verify() {
  console.log('\n━━━ STEP 5: Verification ━━━');

  // Check CSS
  const cssCheck = await restGet(`/themes/${themeId}/assets.json?asset[key]=assets/rueiv-homepage.css`);
  console.log(`  CSS: ${cssCheck.asset ? '✓' : '✗'} (${cssCheck.asset ? cssCheck.asset.size + ' bytes' : 'MISSING'})`);

  // Check sections
  for (const file of SECTIONS) {
    const r = await restGet(`/themes/${themeId}/assets.json?asset[key]=sections/${file}`);
    console.log(`  ${file}: ${r.asset ? '✓' : '✗'}`);
    await sleep(200);
  }

  // Check index.json
  const idx = await restGet(`/themes/${themeId}/assets.json?asset[key]=templates/index.json`);
  if (idx.asset) {
    const parsed = JSON.parse(idx.asset.value);
    const order = parsed.order || [];
    console.log(`\n  index.json order (${order.length} sections):`);
    order.forEach((id, i) => {
      const type = parsed.sections[id]?.type || '?';
      const isNew = NEW_SECTION_ORDER.includes(id);
      console.log(`    ${String(i + 1).padStart(2)}. ${id} (${type}) ${isNew ? '← NEW' : ''}`);
    });
  }

  // Quick storefront check
  try {
    const res = await fetch('https://ruefour.myshopify.com/', {
      headers: { 'Cookie': `storefront_digest=niebow` }
    });
    const html = await res.text();
    const checks = [
      ['rueiv-hero', /rueiv-hero/],
      ['rueiv-catgrid', /rueiv-catgrid/],
      ['rueiv-qs', /rueiv-qs/],
      ['rueiv-arrivals', /rueiv-arrivals/],
      ['rueiv-vibe', /rueiv-vibe/],
      ['rueiv-designers', /rueiv-designers/],
      ['rueiv-lookbook', /rueiv-lookbook/],
      ['rueiv-newsletter', /rueiv-newsletter/]
    ];
    console.log('\n  Storefront HTML:');
    for (const [name, re] of checks) {
      console.log(`    ${re.test(html) ? '✓' : '✗'} ${name}`);
    }
  } catch (e) {
    console.log('  ⚠ Storefront fetch failed:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════════
   Main
   ══════════════════════════════════════════════════════════════ */

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   RueIV Homepage v2 — Luxury Rebuild Deploy ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Store: ${store}`);
  console.log(`Theme: ${themeId}`);

  await uploadCSS();
  await uploadSections();
  await cleanOldSections();
  await rebuildIndex();
  await verify();

  console.log('\n══════════════════════════════════════════════');
  console.log('  DONE. Check: https://ruefour.myshopify.com');
  console.log('══════════════════════════════════════════════');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
