#!/usr/bin/env node
/**
 * create_collections_v2.js
 * ────────────────────────
 * Creates all smart collections for the v2 navigation architecture.
 *
 * Creates:
 *  - Category collections (Textiles, Wallcovering, Furniture, Lighting, Rugs, Accessories)
 *  - Application/End-Use collections (textiles-upholstery, etc.)
 *  - Material collections (textiles-linen, wallcovering-paper, etc.)
 *  - Design/Pattern collections (wallcovering-florals, etc.)
 *  - Furniture Type collections (furniture-sofas, etc.)
 *  - Lighting Type/Style collections
 *  - Room collections
 *  - Rug Size collections
 *  - Accessories subcollections
 *  - Color Family × Category collections
 *  - Special: quick-ship, new-arrivals, contract-hospitality
 *
 * Uses Shopify REST SmartCollection API. Idempotent.
 *
 * Usage:
 *   node scripts/create_collections_v2.js
 *   DRY_RUN=true node scripts/create_collections_v2.js
 */

require('dotenv').config();
const https = require('https');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const DRY_RUN = process.env.DRY_RUN === 'true';

/* ── REST helpers ─────────────────────────────────────── */
function rest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: STORE,
      path: `/admin/api/${VERSION}${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
    };
    const req = https.request(options, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf || '{}') }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Get existing collection handles ──────────────────── */
async function getExistingHandles() {
  const handles = new Set();
  let page = `/smart_collections.json?limit=250`;
  while (page) {
    const { data } = await rest('GET', page);
    if (data.smart_collections) {
      for (const c of data.smart_collections) handles.add(c.handle);
    }
    page = null; // simplified — add link-header pagination if needed
  }
  // Also check custom collections
  const { data: custom } = await rest('GET', '/custom_collections.json?limit=250');
  if (custom.custom_collections) {
    for (const c of custom.custom_collections) handles.add(c.handle);
  }
  return handles;
}

/* ── Create smart collection ──────────────────────────── */
async function createSmartCollection(title, handle, rules, sortOrder = 'best-selling') {
  const body = {
    smart_collection: {
      title,
      handle,
      rules,
      disjunctive: false,
      sort_order: sortOrder,
      published: true,
    },
  };

  const { status, data } = await rest('POST', '/smart_collections.json', body);
  if (status === 201 || status === 200) {
    return data.smart_collection;
  }
  throw new Error(`HTTP ${status}: ${JSON.stringify(data.errors || data)}`);
}

/* ── Collection definitions ───────────────────────────── */

// Product type mapping for the new nav
const PRODUCT_TYPES = {
  textiles:     'Fabric',
  wallcovering: 'Wallpaper',
  furniture:    'Furniture',
  lighting:     'Lighting',
  rugs:         'Rug',
  accessories:  'Accessory',
};

function categoryRule(productType) {
  return [{ column: 'type', relation: 'equals', condition: productType }];
}

function categoryTagRule(productType, tagPrefix, tagValue) {
  return [
    { column: 'type', relation: 'equals', condition: productType },
    { column: 'tag', relation: 'equals', condition: `${tagPrefix}${tagValue}` },
  ];
}

function tagRule(tag) {
  return [{ column: 'tag', relation: 'equals', condition: tag }];
}

// Color family tag mapping
const COLOR_FAMILIES = {
  neutrals:  ['color:white', 'color:ivory', 'color:cream', 'color:beige', 'color:taupe', 'color:grey', 'color:natural'],
  warm:      ['color:camel', 'color:gold', 'color:terracotta', 'color:rust', 'color:orange', 'color:blush', 'color:red'],
  cool:      ['color:blue', 'color:navy', 'color:teal', 'color:green', 'color:sage', 'color:indigo', 'color:forest'],
  dark:      ['color:charcoal', 'color:black', 'color:burgundy'],
  patterned: ['color:multi'],
};

function buildCollections() {
  const collections = [];

  // 1. Primary category collections
  for (const [handle, type] of Object.entries(PRODUCT_TYPES)) {
    collections.push({
      title: handle.charAt(0).toUpperCase() + handle.slice(1),
      handle,
      rules: categoryRule(type),
    });
  }

  // 2. Textiles — Application
  const textileApps = ['Upholstery', 'Drapery', 'Sheer', 'Decorative', 'Outdoor', 'Performance'];
  for (const app of textileApps) {
    collections.push({
      title: `${app} Textiles`,
      handle: `textiles-${app.toLowerCase()}`,
      rules: categoryTagRule('Fabric', 'end-use:', app),
    });
  }
  collections.push({
    title: 'Leather',
    handle: 'textiles-leather',
    rules: categoryTagRule('Fabric', 'material:', 'Leather'),
  });

  // 3. Textiles — Material
  const textileMaterials = ['Linen', 'Cotton', 'Silk', 'Velvet', 'Wool'];
  for (const mat of textileMaterials) {
    collections.push({
      title: `${mat} Fabrics`,
      handle: `textiles-${mat.toLowerCase()}`,
      rules: categoryTagRule('Fabric', 'material:', mat),
    });
  }

  // 4. Wallcovering — Material
  const wallMaterials = [
    ['Paper', 'Paper'], ['Vinyl', 'Vinyl'], ['Naturals', 'Natural'],
    ['Grasscloth', 'Grasscloth'], ['Textile', 'Textile'], ['Murals', 'Mural'],
  ];
  for (const [title, tag] of wallMaterials) {
    collections.push({
      title: `${title} Wallcovering`,
      handle: `wallcovering-${title.toLowerCase()}`,
      rules: categoryTagRule('Wallpaper', 'material:', tag),
    });
  }

  // 5. Wallcovering — Design
  const wallDesigns = ['Textures', 'Florals', 'Geometric', 'Scenic', 'Animal'];
  for (const design of wallDesigns) {
    collections.push({
      title: `${design} Wallcovering`,
      handle: `wallcovering-${design.toLowerCase()}`,
      rules: categoryTagRule('Wallpaper', 'design:', design.replace(/s$/, '')),
    });
  }

  // 6. Furniture — Type
  const furnitureTypes = [
    ['Sofas', 'Sofa'], ['Lounge Chairs', 'Lounge Chair'],
    ['Dining Chairs', 'Dining Chair'], ['Tables', 'Table'], ['Casegoods', 'Casegood'],
  ];
  for (const [title, tag] of furnitureTypes) {
    collections.push({
      title,
      handle: `furniture-${title.toLowerCase().replace(/\s+/g, '-')}`,
      rules: categoryTagRule('Furniture', 'subcat:', tag),
    });
  }

  // 7. Room collections (cross-category)
  const rooms = ['Living Room', 'Dining', 'Bedroom', 'Office'];
  for (const room of rooms) {
    collections.push({
      title: room,
      handle: room.toLowerCase().replace(/\s+/g, '-'),
      rules: tagRule(`room:${room.toLowerCase().replace(/\s+/g, '-')}`),
    });
  }

  // 8. Lighting — Type
  const lightingTypes = [
    ['Table Lamps', 'Table Lamp'], ['Floor Lamps', 'Floor Lamp'],
    ['Wall Lights', 'Wall Light'], ['Ceiling Lights', 'Ceiling Light'],
    ['Pendant Lights', 'Pendant'],
  ];
  for (const [title, tag] of lightingTypes) {
    collections.push({
      title,
      handle: `lighting-${title.toLowerCase().replace(/\s+/g, '-')}`,
      rules: categoryTagRule('Lighting', 'subcat:', tag),
    });
  }

  // 9. Lighting — Style
  const lightingStyles = ['Modern', 'Traditional', 'Sculptural', 'Architectural'];
  for (const style of lightingStyles) {
    collections.push({
      title: `${style} Lighting`,
      handle: `lighting-${style.toLowerCase()}`,
      rules: categoryTagRule('Lighting', 'style:', style),
    });
  }

  // 10. Rugs — Size
  const rugSizes = ['Small', 'Medium', 'Large', 'Oversize'];
  for (const size of rugSizes) {
    collections.push({
      title: `${size} Rugs`,
      handle: `rugs-${size.toLowerCase()}`,
      rules: categoryTagRule('Rug', 'size:', size),
    });
  }

  // 11. Rugs — Material
  const rugMaterials = [
    ['Wool', 'Wool'], ['Natural Fiber', 'Natural Fiber'],
    ['Flatweave', 'Flatweave'], ['Hand Knotted', 'Hand Knotted'],
  ];
  for (const [title, tag] of rugMaterials) {
    collections.push({
      title: `${title} Rugs`,
      handle: `rugs-${title.toLowerCase().replace(/\s+/g, '-')}`,
      rules: categoryTagRule('Rug', 'material:', tag),
    });
  }

  // 12. Accessories — Subcategory
  const accessoryTypes = [
    ['Objects', 'Object'], ['Sculpture', 'Sculpture'], ['Frames', 'Frame'],
    ['Trays', 'Tray'], ['Bowls', 'Bowl'], ['Decorative Pieces', 'Decorative Piece'],
  ];
  for (const [title, tag] of accessoryTypes) {
    collections.push({
      title,
      handle: `accessories-${title.toLowerCase().replace(/\s+/g, '-')}`,
      rules: categoryTagRule('Accessory', 'subcat:', tag),
    });
  }

  // 13. Accessories — Material
  const accessoryMaterials = [
    ['Stone', 'Stone'], ['Metal', 'Metal'], ['Glass', 'Glass'], ['Mixed Media', 'Mixed Media'],
  ];
  for (const [title, tag] of accessoryMaterials) {
    collections.push({
      title: `${title} Accessories`,
      handle: `accessories-${title.toLowerCase().replace(/\s+/g, '-')}`,
      rules: categoryTagRule('Accessory', 'material:', tag),
    });
  }

  // 14. Color Family × Category collections
  const colorCategories = ['textiles', 'wallcovering', 'rugs'];
  for (const cat of colorCategories) {
    const productType = PRODUCT_TYPES[cat];
    for (const [family, colorTags] of Object.entries(COLOR_FAMILIES)) {
      // Use disjunctive color rules within the category
      collections.push({
        title: `${family.charAt(0).toUpperCase() + family.slice(1)} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
        handle: `${cat}-color-${family}`,
        rules: [
          { column: 'type', relation: 'equals', condition: productType },
          { column: 'tag', relation: 'equals', condition: `color-family:${family.charAt(0).toUpperCase() + family.slice(1)}` },
        ],
      });
    }
  }

  // 15. Special collections
  collections.push({
    title: 'Quick Ship',
    handle: 'quick-ship',
    rules: tagRule('lead-time:Quick Ship'),
    sortOrder: 'created-desc',
  });
  collections.push({
    title: 'New Arrivals',
    handle: 'new-arrivals',
    rules: tagRule('new-arrival'),
    sortOrder: 'created-desc',
  });
  collections.push({
    title: 'Contract / Hospitality',
    handle: 'contract-hospitality',
    rules: tagRule('trade:Contract'),
  });

  return collections;
}

/* ── Main ─────────────────────────────────────────────── */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  RueIV Collections v2 Setup                            ║');
  console.log('║  Category-first smart collections                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  if (DRY_RUN) console.log('⚠  DRY RUN mode — no mutations\n');

  console.log('→ Fetching existing collections…');
  const existingHandles = await getExistingHandles();
  console.log(`  Found ${existingHandles.size} existing collections\n`);

  const collections = buildCollections();
  console.log(`── Creating ${collections.length} collections ──\n`);

  let created = 0, skipped = 0, failed = 0;

  for (const col of collections) {
    if (existingHandles.has(col.handle)) {
      console.log(`  ✓ Exists: ${col.handle}`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would create: ${col.handle} — ${col.title}`);
      console.log(`             Rules: ${JSON.stringify(col.rules)}`);
      skipped++;
      continue;
    }

    try {
      const result = await createSmartCollection(col.title, col.handle, col.rules, col.sortOrder);
      console.log(`  ✓ Created: ${col.handle} → ${result.id}`);
      created++;
    } catch (err) {
      console.log(`  ✗ Failed: ${col.handle} — ${err.message}`);
      failed++;
    }

    await sleep(500);
  }

  console.log('\n── Summary ──');
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${collections.length}`);
  console.log('\n✓ Collections v2 setup complete');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
