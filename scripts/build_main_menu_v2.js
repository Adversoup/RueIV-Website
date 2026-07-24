#!/usr/bin/env node
/**
 * build_main_menu_v2.js — Rebuild main-menu from Menu.csv structure
 *
 * CSV has up to 5 levels; Shopify menus support 3.
 * Strategy: Flatten Furniture's "Shop By Category" sub-groups
 * (Seating, Tables, Casegoods) to L2 so their children fit in L3.
 *
 * Menu structure (9 top-level items):
 *   Textiles | Wallcovering | Lighting | Furniture | Rugs |
 *   Accessories | Shop The Vibe | Designers | Quick Ship
 */
require('dotenv').config();

const https = require('https');
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API   = process.env.SHOPIFY_API_VERSION || '2026-04';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: STORE,
      path: `/admin/api/${API}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errors) {
            console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
            reject(new Error('GraphQL errors'));
            return;
          }
          resolve(json.data);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end(body);
  });
}

/* ── Fetch all collections → handle:GID map ──────────────── */
async function fetchCollectionMap() {
  const map = {};
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const q = `{ collections(first: 250${after}) { edges { cursor node { id handle title } } pageInfo { hasNextPage } } }`;
    const { collections } = await gql(q);
    for (const edge of collections.edges) {
      map[edge.node.handle] = edge.node.id;
      cursor = edge.cursor;
    }
    if (!collections.pageInfo.hasNextPage) break;
  }
  return map;
}

/* ── Build menu item helpers ─────────────────────────────── */
function col(title, handle, colMap, children) {
  const gid = colMap[handle];
  const item = gid
    ? { title, type: 'COLLECTION', resourceId: gid }
    : { title, type: 'HTTP', url: `https://${STORE}/collections/${handle}` };
  if (children && children.length) item.items = children;
  return item;
}

function http(title, path, children) {
  const item = { title, type: 'HTTP', url: `https://${STORE}${path}` };
  if (children && children.length) item.items = children;
  return item;
}

function header(title, fallbackPath, children) {
  const item = { title, type: 'HTTP', url: `https://${STORE}${fallbackPath || '#'}` };
  if (children && children.length) item.items = children;
  return item;
}

/* ══════════════════════════════════════════════════════════════
   MENU STRUCTURE — Derived from Menu.csv
   ══════════════════════════════════════════════════════════════ */

function buildMenuItems(colMap) {
  return [

    /* ── 1. TEXTILES ─────────────────────────────────────── */
    col('Textiles', 'textiles', colMap, [
      col('All Textiles', 'textiles', colMap),
      header('Shop By Quality', '/collections/textiles', [
        col('Upholstery', 'textiles-upholstery', colMap),
        col('Drapery', 'textiles-drapery', colMap),
        col('Sheers', 'textiles-sheers', colMap),
        col('Decorative', 'textiles-decorative', colMap),
        col('Leather', 'textiles-leather', colMap),
        col('Outdoor', 'textiles-outdoor', colMap),
      ]),
    ]),

    /* ── 2. WALLCOVERING ─────────────────────────────────── */
    col('Wallcovering', 'wallcovering', colMap, [
      col('All Wallcovering', 'wallcovering', colMap),
      header('Shop By Material', '/collections/wallcovering', [
        col('Wallpapers', 'wallcovering-wallpapers', colMap),
        col('Naturals', 'wallcovering-naturals', colMap),
        col('Hand Painted', 'wallcovering-hand-painted', colMap),
        col('Vinyl', 'wallcovering-vinyl', colMap),
        col('Murals', 'wallcovering-murals', colMap),
        col('Leather', 'wallcovering-leather', colMap),
        col('Metallic', 'wallcovering-metallic', colMap),
      ]),
      header('Shop By Design', '/collections/wallcovering', [
        col('Textures', 'wallcovering-textures', colMap),
        col('Florals', 'wallcovering-florals', colMap),
        col('Geometric', 'wallcovering-geometric', colMap),
        col('Animal / Skin', 'wallcovering-animal-skin', colMap),
      ]),
    ]),

    /* ── 3. LIGHTING ─────────────────────────────────────── */
    col('Lighting', 'lighting', colMap, [
      col('All Lighting', 'lighting', colMap),
      header('Shop By Type', '/collections/lighting', [
        col('Ceiling Lights', 'lighting-ceiling-lights', colMap),
        col('Pendants', 'lighting-pendants', colMap),
        col('Flush Mounts', 'lighting-flush-mounts', colMap),
        col('Wall Lights', 'lighting-wall-lights', colMap),
        col('Table Lamps', 'lighting-table-lamps', colMap),
        col('Floor Lamps', 'lighting-floor-lamps', colMap),
        col('Portable Lamps', 'lighting-portable-lamps', colMap),
        col('Bathroom Lighting', 'lighting-bathroom-lighting', colMap),
        col('Outdoor', 'lighting-outdoor', colMap),
        col('Lampshades', 'lighting-lampshades', colMap),
      ]),
      col('Quick Ship', 'lighting-quick-ship', colMap),
    ]),

    /* ── 4. FURNITURE ────────────────────────────────────── */
    col('Furniture', 'furniture', colMap, [
      col('Shop All', 'furniture', colMap),
      header('Shop By Room', '/collections/furniture', [
        col('Living Room', 'furniture-living-room', colMap),
        col('Dining Room', 'furniture-dining-room', colMap),
        col('Bedroom', 'furniture-bedroom', colMap),
        col('Office', 'furniture-office', colMap),
      ]),
      header('Seating', '/collections/furniture-seating', [
        col('Sofas', 'furniture-sofas', colMap),
        col('Sectionals', 'furniture-sectionals', colMap),
        col('Occasional Chairs', 'furniture-occasional-chairs', colMap),
        col('Dining Chairs', 'furniture-dining-chairs', colMap),
        col('Benches & Ottomans', 'furniture-benches-ottomans', colMap),
        col('Stools', 'furniture-stools', colMap),
        col('Beds', 'furniture-beds', colMap),
      ]),
      header('Tables', '/collections/furniture-tables', [
        col('Dining Tables', 'furniture-dining-tables', colMap),
        col('Coffee Tables', 'furniture-coffee-tables', colMap),
        col('Side Tables', 'furniture-side-tables', colMap),
        col('Bedside Tables', 'furniture-bedside-tables', colMap),
        col('Consoles', 'furniture-consoles', colMap),
        col('Desks', 'furniture-desks', colMap),
      ]),
      header('Casegoods', '/collections/furniture-casegoods', [
        col('Cabinets', 'furniture-cabinets', colMap),
        col('Sideboards', 'furniture-sideboards', colMap),
      ]),
      col('Quick Ship', 'furniture-quick-ship', colMap),
      col('Floor Display', 'furniture-floor-display', colMap),
    ]),

    /* ── 5. RUGS ─────────────────────────────────────────── */
    col('Rugs', 'rugs', colMap, [
      col('All Rugs', 'rugs', colMap),
      col('Quick Ship', 'rugs-quick-ship', colMap),
    ]),

    /* ── 6. ACCESSORIES ──────────────────────────────────── */
    col('Accessories', 'accessories', colMap, [
      col('All', 'accessories', colMap),
      col('Cushions', 'accessories-cushions', colMap),
      col('Mirrors', 'accessories-mirrors', colMap),
      col('Objects', 'accessories-objects', colMap),
      col('Throws', 'accessories-throws', colMap),
    ]),

    /* ── 7. SHOP THE VIBE ────────────────────────────────── */
    http('Shop The Vibe', '/pages/vibe-studio'),

    /* ── 8. DESIGNERS ────────────────────────────────────── */
    col('Designers', 'designers', colMap, [
      col('All Designers', 'designers', colMap),
      col('Alexander Lamont', 'alexander-lamont', colMap),
      col('Altura', 'altura', colMap),
      col('Area Environments', 'area-environments', colMap),
      col('Arte', 'arte', colMap),
      col('C&C Milano', 'c-c-milano', colMap),
      col('Casamance', 'casamance', colMap),
      col('Chase Erwin', 'chase-erwin', colMap),
      col('Clarence House', 'clarence-house', colMap),
      col('de Le Cuona', 'de-le-cuona', colMap),
      col('Elitis', 'elitis', colMap),
      col('Ferrick Mason', 'ferrick-mason', colMap),
      col('George Spencer', 'george-spencer', colMap),
      col('Hartmann & Forbes', 'hartmann-forbes', colMap),
      col('Innovations', 'innovations', colMap),
      col('J.Samuel', 'j-samuel', colMap),
      col('JAB', 'jab', colMap),
      col('Jean Monro', 'jean-monro', colMap),
      col('Jennifer Shorto', 'jennifer-shorto', colMap),
      col('Liberty of London', 'liberty-of-london', colMap),
      col('Marika Meyer', 'marika-meyer', colMap),
      col('Mark Phillips', 'mark-phillips', colMap),
      col('MJ Atelier', 'mj-atelier', colMap),
      col('Olivia Barry', 'olivia-barry', colMap),
      col('Paola Melendez Casa', 'paola-melendez-casa', colMap),
      col('Porta Romana', 'porta-romana', colMap),
      col('Powell & Bonnell', 'powell-bonnell', colMap),
      col('Rosemary Hallgarten', 'rosemary-hallgarten', colMap),
      col('The Vale London', 'the-vale-london', colMap),
      col('Tomlinson Companies', 'tomlinson-companies', colMap),
      col('Verellen', 'verellen', colMap),
      col('Victoria Larson', 'victoria-larson', colMap),
      col('Zimmer + Rohde', 'zimmer-rohde', colMap),
    ]),

    /* ── 9. QUICK SHIP ───────────────────────────────────── */
    col('Quick Ship', 'quick-ship', colMap),

  ];
}


/* ══════════════════════════════════════════════════════════════
   DEPLOY
   ══════════════════════════════════════════════════════════════ */

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Build Main Menu — CSV-based Navigation              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // 1. Fetch collections
  console.log('━━━ Fetching collections ━━━');
  const colMap = await fetchCollectionMap();
  console.log(`  Found ${Object.keys(colMap).length} collections\n`);

  // 2. Build menu item tree
  const items = buildMenuItems(colMap);
  console.log('━━━ Menu structure ━━━');
  items.forEach(item => {
    console.log(`  ${item.title}  [${item.type}]`);
    (item.items || []).forEach(c => {
      console.log(`    ├─ ${c.title}  [${c.type}]`);
      (c.items || []).forEach(gc => {
        console.log(`    │  └─ ${gc.title}  [${gc.type}]`);
      });
    });
  });

  // 3. Find existing main-menu
  console.log('\n━━━ Updating main-menu ━━━');
  const { menus } = await gql(`{
    menus(first: 50) {
      nodes { id handle title }
    }
  }`);
  const mainMenu = menus.nodes.find(m => m.handle === 'main-menu');

  if (!mainMenu) {
    console.log('  No main-menu found — creating new...');
    const result = await gql(`
      mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) {
          menu { id handle title }
          userErrors { field message }
        }
      }
    `, { title: 'Main Menu', handle: 'main-menu', items });

    const errs = result.menuCreate?.userErrors;
    if (errs?.length) {
      console.error('  ✗ Errors:', JSON.stringify(errs, null, 2));
      return;
    }
    console.log('  ✓ Main menu created!');
  } else {
    console.log(`  Found: ${mainMenu.id}`);

    const result = await gql(`
      mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, items: $items) {
          menu {
            id
            items {
              title
              type
              items {
                title
                type
                items {
                  title
                  type
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `, { id: mainMenu.id, title: 'Main Menu', items });

    const errs = result.menuUpdate?.userErrors;
    if (errs?.length) {
      console.error('  ✗ Errors:', JSON.stringify(errs, null, 2));
      return;
    }
    console.log('  ✓ Main menu updated!');

    // Print final structure
    console.log('\n━━━ Live menu on Shopify ━━━');
    const finalItems = result.menuUpdate.menu.items;
    let total = 0;
    finalItems.forEach(item => {
      total++;
      const childCount = (item.items || []).reduce((n, c) => n + 1 + (c.items || []).length, 0);
      console.log(`  ${item.title}  [${item.type}]  (${childCount} children)`);
      (item.items || []).forEach(c => {
        console.log(`    ├─ ${c.title}  [${c.type}]`);
        (c.items || []).forEach(gc => {
          console.log(`    │  └─ ${gc.title}  [${gc.type}]`);
        });
      });
    });
    console.log(`\n  Total top-level items: ${total}`);
  }

  console.log('\n✅ Menu build complete!');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
