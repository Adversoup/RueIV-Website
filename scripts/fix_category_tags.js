#!/usr/bin/env node
/**
 * fix_category_tags.js — Re-classify all 2757 products with correct single category tag.
 *
 * Current state:
 *   category:furniture = 2636 (catch-all, way too broad)
 *   category:lighting  = 573  (many are duplicates)
 *   category:accessories = 290
 *   category:textiles  = 51
 *   category:wallcovering = 38
 *   574 products have MULTIPLE category tags
 *
 * Classification priority:
 *   1. type: tags (most reliable — type:table-lamps → lighting, type:sofas → furniture)
 *   2. Title keywords (lamp, light, chandelier → lighting; mirror → accessories)
 *   3. Vendor defaults (Arte → wallcovering, Chase Erwin → textiles)
 *
 * Each product gets exactly ONE category: tag.
 * Old wrong category: tags are REMOVED, correct one is ADDED.
 */
require('dotenv').config();
const https = require('https');
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER   = process.env.SHOPIFY_API_VERSION;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function gql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: STORE, path: `/admin/api/${VER}/graphql.json`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN, 'Content-Length': Buffer.byteLength(body) },
      timeout: 60000,
      family: 4
    }, res => { let d=''; res.on('data', c => d+=c); res.on('end', () => {
      try { const j = JSON.parse(d); if(j.errors){console.error('GQL:',JSON.stringify(j.errors).substring(0,300)); reject(new Error('GQL'));return;} resolve(j.data); } catch(e){reject(e);}
    }); });
    req.on('error', reject); req.on('timeout', () => {req.destroy(); reject(new Error('timeout'));}); req.end(body);
  });
}

/* ══════════════════════════════════════════════════════════════
   CLASSIFICATION RULES
   ══════════════════════════════════════════════════════════════ */

const LIGHTING_TYPE_TAGS = new Set([
  'type:ceiling-lights', 'type:pendants', 'type:flush-mounts', 'type:wall-lights',
  'type:table-lamps', 'type:floor-lamps', 'type:portable-lamps', 'type:bathroom-lighting',
  'type:lampshades'
]);

const FURNITURE_TYPE_TAGS = new Set([
  'type:seating', 'type:tables', 'type:sofas', 'type:coffee-tables', 'type:benches-ottomans',
  'type:consoles', 'type:beds', 'type:side-tables', 'type:occasional-chairs', 'type:dining-chairs',
  'type:stools', 'type:desks', 'type:dining-tables', 'type:bedside-tables', 'type:sectionals',
  'type:casegoods', 'type:cabinets', 'type:sideboards'
]);

const ACCESSORIES_TYPE_TAGS = new Set([
  'type:objects', 'type:cushions', 'type:mirrors', 'type:throws'
]);

// Title keywords → category
const LIGHTING_TITLE_KEYWORDS = [
  'lamp', 'light', 'chandelier', 'pendant', 'sconce', 'bulkhead', 'lantern',
  'flush mount', 'ceiling'
];

const ACCESSORIES_TITLE_KEYWORDS = [
  'mirror', 'cushion', 'throw', 'pillow', 'vase', 'tray', 'box', 'frame'
];

// Vendor defaults (when no type: tag and no title match)
const VENDOR_DEFAULTS = {
  'Arte': 'wallcovering',
  'C&C Milano': 'textiles',    // they do both, but primarily textiles
  'Chase Erwin': 'textiles',
  'Verellen': 'furniture',
  'Altura': 'furniture',
  'Porta Romana': 'lighting',  // mostly lighting, furniture caught by type: tags
  'Alexander Lamont': 'furniture', // mostly furniture, lighting/accessories caught by type: tags
  'Area Environments': 'furniture',
  'Fabricut': 'textiles',
  'ZR': 'accessories',
};

function classifyProduct(product) {
  const tags = product.tags;
  const title = product.title.toLowerCase();
  const vendor = product.vendor;

  // 1. Check type: tags — most reliable
  const hasLightingType = tags.some(t => LIGHTING_TYPE_TAGS.has(t));
  const hasFurnitureType = tags.some(t => FURNITURE_TYPE_TAGS.has(t));
  const hasAccessoriesType = tags.some(t => ACCESSORIES_TYPE_TAGS.has(t));

  // If only one type family matches, use it
  if (hasLightingType && !hasFurnitureType && !hasAccessoriesType) return 'lighting';
  if (hasFurnitureType && !hasLightingType && !hasAccessoriesType) return 'furniture';
  if (hasAccessoriesType && !hasFurnitureType && !hasLightingType) return 'accessories';

  // If multiple type families match (rare), use title to disambiguate
  if (hasLightingType && hasFurnitureType) {
    // e.g. type:table-lamps + type:tables — check title
    if (LIGHTING_TITLE_KEYWORDS.some(kw => title.includes(kw))) return 'lighting';
    return 'furniture';
  }
  if (hasLightingType && hasAccessoriesType) return 'lighting';
  if (hasFurnitureType && hasAccessoriesType) {
    // e.g. type:tables + type:mirrors — check title
    if (ACCESSORIES_TITLE_KEYWORDS.some(kw => title.includes(kw))) return 'accessories';
    return 'furniture';
  }

  // 2. No type: tags — check title keywords
  if (LIGHTING_TITLE_KEYWORDS.some(kw => title.includes(kw))) return 'lighting';
  if (ACCESSORIES_TITLE_KEYWORDS.some(kw => title.includes(kw))) return 'accessories';

  // 3. Vendor-specific overrides for existing category tags
  // C&C Milano: products with ONLY wallcovering tag (not textiles) stay wallcovering
  // Otherwise C&C Milano defaults to textiles
  if (vendor === 'C&C Milano') {
    const hasBoth = tags.includes('category:wallcovering') && tags.includes('category:textiles');
    if (hasBoth) {
      // Check title for wallcovering keywords
      if (title.includes('wallpaper') || title.includes('wallcovering') || title.includes('wall covering') || title.includes('mural')) return 'wallcovering';
      return 'textiles'; // default for C&C Milano dual-tagged
    }
    if (tags.includes('category:wallcovering') && !tags.includes('category:textiles')) return 'wallcovering';
    return 'textiles';
  }
  if (vendor === 'Arte') return 'wallcovering';

  // 4. Fall back to vendor default
  if (VENDOR_DEFAULTS[vendor]) return VENDOR_DEFAULTS[vendor];

  // 5. Last resort — keep existing category if there's one
  const existingCats = tags.filter(t => t.startsWith('category:'));
  if (existingCats.length === 1) return existingCats[0].replace('category:', '');

  // 6. Unknown — default to furniture (most common)
  return 'furniture';
}

/* ══════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════ */

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');
  
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Fix Category Tags ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`.padEnd(59) + '║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // 1. Fetch all products
  console.log('━━━ Fetching all products ━━━');
  const products = [];
  let cursor = null;
  for (let page = 0; page < 100; page++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      products(first: 100${after}) {
        edges { cursor node { id title vendor tags } }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of data.products.edges) {
      products.push(e.node);
      cursor = e.cursor;
    }
    process.stdout.write(`  ${products.length} products...\r`);
    if (!data.products.pageInfo.hasNextPage) break;
  }
  console.log(`  Fetched ${products.length} products\n`);

  // 2. Classify each product
  console.log('━━━ Classifying products ━━━');
  const changes = [];  // { id, title, vendor, oldCats, newCat, tagsToRemove, tagToAdd }
  const newCatCounts = {};
  let unchanged = 0;

  for (const p of products) {
    const newCat = classifyProduct(p);
    newCatCounts[newCat] = (newCatCounts[newCat] || 0) + 1;

    const oldCats = p.tags.filter(t => t.startsWith('category:'));
    const correctTag = `category:${newCat}`;

    // Check if change needed
    if (oldCats.length === 1 && oldCats[0] === correctTag) {
      unchanged++;
      continue;
    }

    const tagsToRemove = oldCats.filter(t => t !== correctTag);
    const needsAdd = !oldCats.includes(correctTag);

    changes.push({
      id: p.id,
      title: p.title,
      vendor: p.vendor,
      oldCats,
      newCat: correctTag,
      tagsToRemove,
      needsAdd
    });
  }

  console.log('\n  New distribution:');
  for (const [cat, count] of Object.entries(newCatCounts).sort((a,b) => b[1]-a[1])) {
    console.log(`    category:${cat.padEnd(20)} ${count}`);
  }
  console.log(`\n  Unchanged: ${unchanged}`);
  console.log(`  Need fixing: ${changes.length}`);

  // Show sample changes
  console.log('\n━━━ Sample changes (first 30) ━━━');
  for (const c of changes.slice(0, 30)) {
    const oldStr = c.oldCats.map(t => t.replace('category:', '')).join('+');
    console.log(`  ${c.title.substring(0, 35).padEnd(37)} ${c.vendor.padEnd(18)} ${oldStr.padEnd(30)} → ${c.newCat}`);
  }

  if (DRY_RUN) {
    console.log('\n⚠ DRY RUN — no changes applied. Run without --dry-run to apply.');
    return;
  }

  // 3. Apply changes
  console.log(`\n━━━ Applying ${changes.length} tag changes ━━━`);
  let applied = 0;
  let errors = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    let ok = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Remove wrong tags
        if (change.tagsToRemove.length > 0) {
          await gql(`mutation { tagsRemove(id: "${change.id}", tags: ${JSON.stringify(change.tagsToRemove)}) { userErrors { message } } }`);
        }
        // Add correct tag
        if (change.needsAdd) {
          await gql(`mutation { tagsAdd(id: "${change.id}", tags: ["${change.newCat}"]) { userErrors { message } } }`);
        }
        applied++;
        ok = true;
        break;
      } catch (e) {
        await sleep(2000 * (attempt + 1)); // backoff
      }
    }
    if (!ok) errors++;

    if ((i + 1) % 5 === 0 || i === changes.length - 1) {
      process.stdout.write(`  ${i + 1}/${changes.length} (${errors} errors)\r`);
    }
    await sleep(300);
  }

  console.log(`\n  ✓ Applied: ${applied}`);
  if (errors > 0) console.log(`  ✗ Errors: ${errors}`);

  // 4. Verify
  console.log('\n━━━ Verification ━━━');
  const verify = await gql(`{
    furniture: productsCount(query: "tag:'category:furniture'") { count }
    lighting: productsCount(query: "tag:'category:lighting'") { count }
    accessories: productsCount(query: "tag:'category:accessories'") { count }
    textiles: productsCount(query: "tag:'category:textiles'") { count }
    wallcovering: productsCount(query: "tag:'category:wallcovering'") { count }
  }`);
  console.log(`  category:furniture    = ${verify.furniture.count}`);
  console.log(`  category:lighting     = ${verify.lighting.count}`);
  console.log(`  category:accessories  = ${verify.accessories.count}`);
  console.log(`  category:textiles     = ${verify.textiles.count}`);
  console.log(`  category:wallcovering = ${verify.wallcovering.count}`);

  console.log('\n✅ Category tag cleanup complete!');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
