#!/usr/bin/env node
/**
 * deploy_homepage_v3.js — Premium Editorial Homepage Rebuild
 *
 * Deploys:
 *  1. rueiv-homepage.css (asset)
 *  2. 10 section .liquid files
 *  3. Reads existing index.json, replaces sections/order with v3 layout
 *
 * SAFETY: Always reads index.json first and modifies in-place.
 *
 * Target order (10 sections):
 *   1. rueiv_hero            → rueiv-hero
 *   2. rueiv_gateway         → rueiv-category-gateway
 *   3. rueiv_vibe            → rueiv-vibe-studio
 *   4. rueiv_trending        → rueiv-trending
 *   5. rueiv_arrivals        → rueiv-new-arrivals
 *   6. rueiv_ready           → rueiv-project-ready
 *   7. rueiv_testimonials    → rueiv-testimonials
 *   8. rueiv_events          → rueiv-events
 *   9. rueiv_newsletter      → rueiv-newsletter
 *  10. rueiv_banner          → rueiv-closing-banner
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

async function putAsset(key, value) {
  return restPut(`/themes/${themeId}/assets.json`, { asset: { key, value } });
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
   STEP 2 — Upload Section Files
   ══════════════════════════════════════════════════════════════ */

const SECTIONS = [
  'rueiv-hero.liquid',
  'rueiv-category-gateway.liquid',
  'rueiv-vibe-studio.liquid',
  'rueiv-trending.liquid',
  'rueiv-new-arrivals.liquid',
  'rueiv-project-ready.liquid',
  'rueiv-testimonials.liquid',
  'rueiv-events.liquid',
  'rueiv-newsletter.liquid',
  'rueiv-closing-banner.liquid'
];

async function uploadSections() {
  console.log('\n━━━ STEP 2: Upload 10 section files ━━━');
  for (const file of SECTIONS) {
    const content = readLocal(`theme/sections/${file}`);
    const r = await putAsset(`sections/${file}`, content);
    if (r.asset) console.log(`  ✓ ${file}`);
    else console.error(`  ✗ ${file}:`, JSON.stringify(r.errors || r));
    await sleep(400);
  }
}

/* ══════════════════════════════════════════════════════════════
   STEP 3 — Rebuild index.json (SAFE: read → modify → write)
   ══════════════════════════════════════════════════════════════ */

// Section IDs to remove from old layout
const REMOVE_IDS = [
  'slideshow_zKPFFV',
  'rueiv_categories',
  'rueiv_quickship',
  'rueiv_designers',
  'rueiv_lookbook'
];

// New v3 section configs
const V3_SECTIONS = {
  rueiv_hero: {
    type: 'rueiv-hero',
    settings: {
      banner_text: 'Where the Industry Turns. Comprehensive. Connected. Complete.'
    },
    blocks: {
      slide_1: {
        type: 'slide',
        settings: {
          kicker: 'The Showroom',
          heading: 'Curated Design for Interior Professionals',
          description: 'Textiles. Wallcovering. Furniture. Lighting. Rugs. An editorial gateway to the showroom.',
          button_label: 'Explore Collections',
          button_url: '/collections'
        }
      }
    },
    block_order: ['slide_1']
  },
  rueiv_gateway: {
    type: 'rueiv-category-gateway',
    settings: {},
    blocks: {
      gw_textiles:     { type: 'category', settings: { collection: 'fabric',      label: 'Textiles' } },
      gw_wallcovering: { type: 'category', settings: { collection: 'wallpaper',   label: 'Wallcovering' } },
      gw_furniture:    { type: 'category', settings: { collection: 'furniture',    label: 'Furniture' } },
      gw_lighting:     { type: 'category', settings: { collection: 'lighting',     label: 'Lighting' } },
      gw_rugs:         { type: 'category', settings: { collection: 'rugs',         label: 'Rugs' } },
      gw_accessories:  { type: 'category', settings: { collection: 'accessories',  label: 'Accessories' } }
    },
    block_order: ['gw_textiles', 'gw_wallcovering', 'gw_furniture', 'gw_lighting', 'gw_rugs', 'gw_accessories']
  },
  rueiv_vibe: {
    type: 'rueiv-vibe-studio',
    settings: {
      kicker: 'Curated Sourcing',
      heading: 'The Vibe Studio',
      body_text: 'Curated sourcing for design professionals. Select a mood and our team assembles a product selection aligned with your project.',
      microcopy: 'Effortless. Elevated. Trade-only.',
      button_label: 'Shop The Vibe',
      button_url: '/pages/vibe-studio'
    },
    blocks: {
      step_1: { type: 'step', settings: { title: 'Browse',      description: 'Browse our curated moodboards.' } },
      step_2: { type: 'step', settings: { title: 'Add to Cart',  description: 'Add your desired vibe to cart.' } },
      step_3: { type: 'step', settings: { title: 'Submit',       description: 'Submit your request.' } },
      step_4: { type: 'step', settings: { title: 'Receive',      description: 'Within 24–48 hours, receive a custom-curated selection.' } },
      board_1: { type: 'moodboard', settings: { title: 'California Beach Vibe' } },
      board_2: { type: 'moodboard', settings: { title: 'Mid-Century Warmth' } },
      board_3: { type: 'moodboard', settings: { title: 'Quiet Luxury' } }
    },
    block_order: ['step_1', 'step_2', 'step_3', 'step_4', 'board_1', 'board_2', 'board_3']
  },
  rueiv_trending: {
    type: 'rueiv-trending',
    settings: {
      heading: 'Trending in the Showroom',
      description: 'Discover the pieces designers are sourcing right now.',
      collection: 'all',
      products_to_show: 4,
      show_vendor: true,
      button_label: 'View All Trending'
    }
  },
  rueiv_arrivals: {
    type: 'rueiv-new-arrivals',
    settings: {
      heading: 'New in the Showroom',
      description: 'Recent arrivals across textiles, lighting, furniture and accessories.',
      collection: 'new-arrivals',
      products_to_show: 8,
      show_vendor: true,
      button_label: 'View All New Arrivals',
      button_url: '/collections/new-arrivals'
    }
  },
  rueiv_ready: {
    type: 'rueiv-project-ready',
    settings: {
      heading: 'Project Ready',
      description: 'In-stock pieces for projects on a timeline.'
    },
    blocks: {
      cat_furniture: { type: 'category', settings: { title: 'Quick Ship Furniture', link: '/collections/quick-ship-furniture' } },
      cat_lighting:  { type: 'category', settings: { title: 'Quick Ship Lighting',  link: '/collections/quick-ship-lighting' } },
      cat_rugs:      { type: 'category', settings: { title: 'Quick Ship Rugs',      link: '/collections/quick-ship-rugs' } }
    },
    block_order: ['cat_furniture', 'cat_lighting', 'cat_rugs']
  },
  rueiv_testimonials: {
    type: 'rueiv-testimonials',
    settings: { heading: 'In Your Words' },
    blocks: {
      q_1: { type: 'quote', settings: { quote: 'A sourcing platform that actually understands our workflow. Exactly what the industry needed.', author: 'Sarah C.', role: 'Interior Designer, NYC' } },
      q_2: { type: 'quote', settings: { quote: 'The Vibe Studio concept is genius. Submit a mood, receive a curated pull — it saves hours.', author: 'Marcus T.', role: 'Design Director, LA' } },
      q_3: { type: 'quote', settings: { quote: 'Finally, a trade platform that feels as premium as the product it carries.', author: 'Rachel M.', role: 'Principal, RM Interiors' } }
    },
    block_order: ['q_1', 'q_2', 'q_3']
  },
  rueiv_events: {
    type: 'rueiv-events',
    settings: {
      heading: 'The Vibe Circuit',
      subheading: 'Private previews. Designer events. Industry gatherings.'
    },
    blocks: {
      ev_1: { type: 'event', settings: { title: 'Summer Market Preview', date: 'Coming Soon' } },
      ev_2: { type: 'event', settings: { title: 'Designer Roundtable', date: 'Coming Soon' } },
      ev_3: { type: 'event', settings: { title: 'Showroom Open House', date: 'Coming Soon' } }
    },
    block_order: ['ev_1', 'ev_2', 'ev_3']
  },
  rueiv_newsletter: {
    type: 'rueiv-newsletter',
    settings: {
      heading: 'The Vibe List',
      description: '<p>Inside the Vibe. New launches. Designer moments. Events worth attending.</p>',
      placeholder: 'Your email address',
      button_label: 'Subscribe'
    }
  },
  rueiv_banner: {
    type: 'rueiv-closing-banner',
    settings: {
      heading: 'One Showroom. Every Category.',
      subtext: 'The sourcing platform for interior professionals.'
    }
  }
};

const V3_ORDER = [
  'rueiv_hero',
  'rueiv_gateway',
  'rueiv_vibe',
  'rueiv_trending',
  'rueiv_arrivals',
  'rueiv_ready',
  'rueiv_testimonials',
  'rueiv_events',
  'rueiv_newsletter',
  'rueiv_banner'
];

async function rebuildIndex() {
  console.log('\n━━━ STEP 3: Rebuild index.json (safe read → modify → write) ━━━');

  // Read current
  const getRes = await restGet(
    `/themes/${themeId}/assets.json?asset[key]=templates/index.json`
  );
  if (!getRes.asset) {
    console.error('  ✗ Could not read index.json:', JSON.stringify(getRes));
    return;
  }

  const data = JSON.parse(getRes.asset.value);
  console.log('  ✓ Read index.json — current sections:', data.order?.length ?? Object.keys(data.sections || {}).length);

  // Remove old sections
  for (const id of REMOVE_IDS) {
    if (data.sections?.[id]) {
      delete data.sections[id];
      console.log(`    - removed section: ${id}`);
    }
  }

  // Upsert new sections
  if (!data.sections) data.sections = {};
  for (const [key, cfg] of Object.entries(V3_SECTIONS)) {
    data.sections[key] = cfg;
  }

  // Set new order
  data.order = V3_ORDER;

  console.log('  → Writing new order:', V3_ORDER.join(', '));

  const putRes = await putAsset('templates/index.json', JSON.stringify(data, null, 2));
  if (putRes.asset) console.log('  ✓ index.json updated');
  else console.error('  ✗ index.json write failed:', JSON.stringify(putRes.errors || putRes));
}

/* ══════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════ */

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  RueIV Homepage v3 — Premium Editorial Deploy       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Store: ${store}  Theme: ${themeId}  API: ${ver}`);

  if (!store || !token) {
    console.error('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_ACCESS_TOKEN in .env');
    process.exit(1);
  }

  await uploadCSS();
  await uploadSections();
  await rebuildIndex();

  console.log('\n✅ Homepage v3 deploy complete!');
  console.log(`Preview: https://${store}/?preview_theme_id=${themeId}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
