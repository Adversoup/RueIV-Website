/**
 * create_mega_menus.js
 * Creates all navigation menus required for the new mega menu system.
 * Also updates the main menu to the new category-first structure.
 *
 * Menus created:
 *   textiles-quality, textiles-color, textiles-designers,
 *   wallcovering-materials, wallcovering-design, wallcovering-color,
 *   lighting-type, lighting-color, lighting-designers,
 *   furniture-type, furniture-room, furniture-designers,
 *   rugs-size, rugs-color, rugs-quickship,
 *   designers-featured, designers-all,
 *   vibe-menu
 *
 * Then updates main-menu to:
 *   Textiles | Wallcovering | Lighting | Furniture | Rugs |
 *   Shop The Vibe (→children) | Designers |
 *   About (→Sustainability) | Trade Program | Events | Contact
 */
require('dotenv').config();

const { buildVendorSpecs } = require('./lib/vendor_navigation');
const { fetchVendorNames, fetchCollectionIndex, discoverSubBrandNames, buildDesignersSubmenuChildren } = require('./fix_vendors');
const { planCategoryNavigation, facetCandidates, verifyFacetProduct } = require('./lib/category_nav_contract');

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = process.env.SHOPIFY_API_VERSION || '2026-04';
// Never mutate live Shopify menus on an accidental script invocation.
const APPLY = process.argv.includes('--apply') && process.env.RUEIV_MENU_APPLY_APPROVED === '1';
const GQL   = `https://${STORE}/admin/api/${API_V}/graphql.json`;

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await r.json();
  if (json.errors) throw new Error('GQL: ' + JSON.stringify(json.errors, null, 2));
  return json.data;
}


// Read-only, bounded proof that a canonical taxonomy filter has a published
// SKU in the *actual* parent Shopify collection. A menu label alone is never
// enough to create a navigation URL.
async function fetchVerifiedFacetProofs(menuDefs, collectionIndex) {
  const probes = menuDefs.flatMap((menuDef) => facetCandidates(menuDef,collectionIndex));
  const proofs = {};
  for (const candidate of probes) {
    const search = 'tag:"' + candidate.tag.replace(/"/g,'') + '"';
    const data = await gql(`
      query RueIVMenuFacetProof($search:String!,$key:String!) {
        products(first:10,query:$search) {
          nodes {
            id productType status publishedAt tags
            collections(first:100) { nodes { handle } }
            taxonomyValue:metafield(namespace:"taxonomy",key:$key) { type value }
          }
        }
      }`,{search,key:candidate.key});
    const nodes = data.products?.nodes || [];
    const values = nodes
      .map((node)=>verifyFacetProduct(candidate,node))
      .filter(Boolean);
    const distinct=[...new Set(values)];
    // Multiple competing canonical values require G3 reconciliation.
    if (distinct.length === 1) {
      proofs[candidate.menu+'/'+candidate.label] = distinct[0];
    }
  }
  return {proofs, checked:probes.length};
}

// Helper: full URL
const u = (path) => `https://${STORE}${path}`;

// Helper: HTTP menu item
const item = (title, path) => ({ title, url: u(path), type: 'HTTP' });

// ────────────────────────────────────────────────────────────
// MENU DEFINITIONS
// ────────────────────────────────────────────────────────────

const MENUS = [
  // ── TEXTILES ──
  {
    title: 'Textiles - Shop by Quality',
    handle: 'textiles-quality',
    items: [
      item('All Textiles',  '/collections/fabric'),
      item('Upholstery',    '/collections/fabric-upholstery'),
      item('Drapery',       '/collections/fabric-drapery'),
      item('Sheers',        '/collections/fabric-sheer'),
      item('Decorative',    '/collections/fabric-decorative'),
      item('Performance',   '/collections/fabric-performance'),
      item('Outdoor',       '/collections/outdoor'),
    ]
  },
  {
    title: 'Textiles - Shop by Color',
    handle: 'textiles-color',
    items: [
      item('All',         '/collections/fabric'),
      item('White',       '/collections/fabric-white'),
      item('Ivory',       '/collections/fabric-ivory'),
      item('Beige',       '/collections/fabric-beige'),
      item('Taupe',       '/collections/fabric-taupe'),
      item('Camel',       '/collections/fabric-camel'),
      item('Grey',        '/collections/fabric-grey'),
      item('Blue',        '/collections/fabric-blue'),
      item('Navy',        '/collections/fabric-navy'),
      item('Teal',        '/collections/fabric-teal'),
      item('Green',       '/collections/fabric-green'),
      item('Gold',        '/collections/fabric-gold'),
      item('Red',         '/collections/fabric-red'),
      item('Orange',      '/collections/fabric-orange'),
      item('Terracotta',  '/collections/fabric-terracotta'),
      item('Blush',       '/collections/fabric-blush'),
      item('Natural',     '/collections/fabric-natural'),
      item('Multi',       '/collections/fabric-multi'),
    ]
  },
  {
    title: 'Textiles - Designers',
    handle: 'textiles-designers',
    items: [
      item('View All Designers', '/pages/brands'),
      item('Fabricut',           '/collections/fabricut'),
      item('Zimmer + Rohde',     '/collections/zr'),
    ]
  },

  // ── WALLCOVERING ──
  {
    title: 'Wallcovering - Shop by Material',
    handle: 'wallcovering-materials',
    items: [
      item('All Wallcovering', '/collections/wallpaper'),
      item('Wallpapers',       '/collections/wallpaper'),
      item('Naturals',         '/collections/wallpaper'),
      item('Hand Painted',     '/collections/wallpaper'),
      item('Vinyl',            '/collections/wallpaper'),
      item('Murals',           '/collections/wallpaper'),
      item('Leather',          '/collections/wallpaper'),
      item('Metallic',         '/collections/wallpaper'),
    ]
  },
  {
    title: 'Wallcovering - Shop by Design',
    handle: 'wallcovering-design',
    items: [
      item('All',          '/collections/wallpaper'),
      item('Textures',     '/collections/wallpaper'),
      item('Florals',      '/collections/wallpaper'),
      item('Geometric',    '/collections/wallpaper'),
      item('Animal/Skin',  '/collections/wallpaper'),
    ]
  },
  {
    title: 'Wallcovering - Shop by Color',
    handle: 'wallcovering-color',
    items: [
      item('All',          '/collections/wallpaper'),
      item('Ivory',        '/collections/wallpaper-ivory'),
      item('Beige',        '/collections/wallpaper-beige'),
      item('Taupe',        '/collections/wallpaper-taupe'),
      item('Camel',        '/collections/wallpaper-camel'),
      item('Gold',         '/collections/wallpaper-gold'),
      item('Terracotta',   '/collections/wallpaper-terracotta'),
      item('Rust',         '/collections/wallpaper-rust'),
      item('Red',          '/collections/wallpaper-red'),
      item('Orange',       '/collections/wallpaper-orange'),
      item('Forest',       '/collections/wallpaper-forest'),
      item('Indigo',       '/collections/wallpaper-indigo'),
      item('Natural',      '/collections/wallpaper-natural'),
      item('Multi',        '/collections/wallpaper-multi'),
    ]
  },

  // ── LIGHTING ──
  {
    title: 'Lighting - Shop by Type',
    handle: 'lighting-type',
    items: [
      item('All Lighting',    '/collections/lighting'),
      item('Table Lamps',     '/collections/lighting'),
      item('Floor Lamps',     '/collections/lighting'),
      item('Wall Lights',     '/collections/lighting'),
      item('Ceiling Lights',  '/collections/lighting'),
    ]
  },
  {
    title: 'Lighting - Shop by Color',
    handle: 'lighting-color',
    items: [
      item('All',          '/collections/lighting'),
      item('White',        '/collections/lighting-white'),
      item('Cream',        '/collections/lighting-cream'),
      item('Gold',         '/collections/lighting-gold'),
      item('Metallic',     '/collections/lighting-metallic'),
      item('Natural',      '/collections/lighting-natural'),
      item('Camel',        '/collections/lighting-camel'),
      item('Sage',         '/collections/lighting-sage'),
      item('Terracotta',   '/collections/lighting-terracotta'),
      item('Multi',        '/collections/lighting-multi'),
    ]
  },
  {
    title: 'Lighting - Designers',
    handle: 'lighting-designers',
    items: [
      item('View All Designers', '/pages/brands'),
      item('Porta Romana',       '/collections/porta-romana'),
    ]
  },

  // ── FURNITURE ──
  {
    title: 'Furniture - Shop by Type',
    handle: 'furniture-type',
    items: [
      item('All Furniture', '/collections/furniture'),
      item('Sofas',         '/collections/furniture'),
      item('Chairs',        '/collections/furniture'),
      item('Tables',        '/collections/furniture'),
      item('Beds',          '/collections/furniture'),
      item('Ottomans',      '/collections/furniture'),
      item('Banquettes',    '/collections/furniture'),
      item('Storage',       '/collections/furniture'),
      item('Daybeds',       '/collections/furniture'),
    ]
  },
  {
    title: 'Furniture - Shop by Room',
    handle: 'furniture-room',
    items: [
      item('All Rooms',     '/collections/furniture'),
      item('Living Room',   '/collections/living-room'),
      item('Dining Room',   '/collections/dining-room'),
      item('Bedroom',       '/collections/bedroom'),
      item('Office',        '/collections/office'),
    ]
  },
  {
    title: 'Furniture - Designers & Quick Ship',
    handle: 'furniture-designers',
    items: [
      item('Quick Ship',           '/collections/furniture'),
      item('View All Designers',   '/pages/brands'),
      item('Verellen',             '/collections/verellen'),
    ]
  },

  // ── RUGS ──
  {
    title: 'Rugs - Shop by Size',
    handle: 'rugs-size',
    items: [
      item('All Rugs',  '/collections/rugs'),
      item("5' x 8'",   '/collections/rugs'),
      item("6' x 9'",   '/collections/rugs'),
      item("8' x 10'",  '/collections/rugs'),
      item("9' x 12'",  '/collections/rugs'),
      item('Runners',    '/collections/rugs'),
      item('Custom',     '/collections/rugs'),
    ]
  },
  {
    title: 'Rugs - Shop by Color',
    handle: 'rugs-color',
    items: [
      item('All',     '/collections/rugs'),
      item('Ivory',   '/collections/rugs'),
      item('Beige',   '/collections/rugs'),
      item('Grey',    '/collections/rugs'),
      item('Blue',    '/collections/rugs'),
      item('Natural', '/collections/rugs'),
      item('Multi',   '/collections/rugs'),
    ]
  },
  {
    title: 'Rugs - Quick Ship',
    handle: 'rugs-quickship',
    items: [
      item('Quick Ship Rugs',     '/collections/rugs'),
      item('View All Designers',  '/pages/brands'),
    ]
  },

  // ── DESIGNERS ──
  {
    title: 'Designers - Featured',
    handle: 'designers-featured',
    items: [
      item('View All Designers', '/pages/brands'),
      item('Arte',               '/collections/arte'),
      item('Fabricut',           '/collections/fabricut'),
      item('Porta Romana',       '/collections/porta-romana'),
      item('Verellen',           '/collections/verellen'),
      item('Zimmer + Rohde',     '/collections/zr'),
    ]
  },
  {
    title: 'Designers - A to Z',
    handle: 'designers-all',
    items: [
      item('View All Designers', '/pages/brands'),
      item('Arte',               '/collections/arte'),
      item('Fabricut',           '/collections/fabricut'),
      item('Porta Romana',       '/collections/porta-romana'),
      item('Verellen',           '/collections/verellen'),
      item('Zimmer + Rohde',     '/collections/zr'),
    ]
  },
  {
    title: 'Designers - New & Trending',
    handle: 'designers-trending',
    items: [
      item('New Arrivals',   '/collections'),
      item('Trending Now',   '/collections'),
    ]
  },

  // ── SHOP THE VIBE ──
  {
    title: 'Shop The Vibe',
    handle: 'vibe-menu',
    items: [
      item('Explore The Vibe Studio', '/pages/vibe-studio'),
      item('Designer Spotlight',      '/pages/designer-spotlight'),
      item('Portfolio',               '/pages/portfolio'),
      item('Moodboards',             '/pages/moodboards'),
    ]
  },
];

// ────────────────────────────────────────────────────────────
// MAIN MENU (top nav) DEFINITION
// ────────────────────────────────────────────────────────────

const MAIN_MENU = [
  item('Textiles',       '/collections/fabric'),
  item('Wallcovering',   '/collections/wallpaper'),
  item('Lighting',       '/collections/lighting'),
  item('Furniture',      '/collections/furniture'),
  item('Rugs',           '/collections/rugs'),
  item('Accessories',    '/collections/accessories'),
  {
    ...item('Shop The Vibe', '/pages/vibe-studio'),
    items: [
      item('Designer Spotlight', '/pages/designer-spotlight'),
      item('Portfolio',          '/pages/portfolio'),
      item('Moodboards',        '/pages/moodboards'),
    ]
  },
  item('Designers',       '/pages/brands'),
  {
    ...item('About', '/pages/about'),
    items: [
      item('Sustainability', '/pages/sustainability'),
    ]
  },
  item('Trade Program',  '/pages/trade-program'),
  item('Events',         '/pages/events'),
  item('Contact',        '/pages/contact'),
];

// ────────────────────────────────────────────────────────────
// EXECUTION
// ────────────────────────────────────────────────────────────

const CREATE_MENU = `
  mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
    menuCreate(title: $title, handle: $handle, items: $items) {
      menu { id handle title }
      userErrors { field message }
    }
  }`;

const UPDATE_MENU = `
  mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
    menuUpdate(id: $id, title: $title, items: $items) {
      menu { id handle title }
      userErrors { field message }
    }
  }`;

async function getExistingMenus() {
  const data = await gql(`{ menus(first: 100) { nodes { id handle title } } }`);
  return data.menus.nodes;
}

async function createOrUpdateMenu(menuDef, existing) {
  const found = existing.find(m => m.handle === menuDef.handle);

  if (found) {
    console.log(`  ↻ Updating "${menuDef.handle}" (${found.id})`);
    const data = await gql(UPDATE_MENU, {
      id: found.id,
      title: menuDef.title,
      items: menuDef.items
    });
    if (data.menuUpdate.userErrors.length) {
      console.error('    ✗ Errors:', data.menuUpdate.userErrors);
      return null;
    }
    console.log(`    ✓ Updated: ${data.menuUpdate.menu.handle}`);
    return data.menuUpdate.menu;
  } else {
    console.log(`  + Creating "${menuDef.handle}"`);
    const data = await gql(CREATE_MENU, {
      title: menuDef.title,
      handle: menuDef.handle,
      items: menuDef.items
    });
    if (data.menuCreate.userErrors.length) {
      console.error('    ✗ Errors:', data.menuCreate.userErrors);
      return null;
    }
    console.log(`    ✓ Created: ${data.menuCreate.menu.handle} (${data.menuCreate.menu.id})`);
    return data.menuCreate.menu;
  }
}

function preserveMenuItem(row) {
  if (!row?.title || !row.type) throw new Error('Cannot preserve malformed existing menu item');
  const item={title:row.title,type:row.type};
  if (row.resourceId) item.resourceId=row.resourceId;
  else if (row.url) item.url=row.url;
  else throw new Error('Cannot preserve existing menu item without target: '+row.title);
  if (row.items?.length) item.items=row.items.map(preserveMenuItem);
  return item;
}

async function updateMainMenu(existing,designerItems) {
  const mainMenu = existing.find(m => m.handle === 'main-menu');
  if (!mainMenu) throw new Error('main-menu not found; no menu writes authorized');
  const current=await gql(`
    query RueIVExistingMainMenu($id:ID!) {
      menu(id:$id) {
        id title items {
          title type url resourceId
          items { title type url resourceId
            items { title type url resourceId }
          }
        }
      }
    }`,{id:mainMenu.id});
  const previous=current.menu?.items||[];
  const designers=previous.filter(x=>x.title==='Designers');
  if (designers.length!==1 || !designerItems.length)
    throw new Error('Expected exactly one existing Designers menu; refusing rewrite');
  const items=previous.map(row=>{
    if(row.title!=='Designers') return preserveMenuItem(row);
    const preserved=preserveMenuItem(row);
    preserved.items=designerItems.map(preserveMenuItem);
    return preserved;
  });
  console.log(`\n▸ Updating only Designers children on existing main-menu (${mainMenu.id})`);
  const data = await gql(UPDATE_MENU, {
    id: mainMenu.id,
    title: current.menu.title,
    items
  });
  if (data.menuUpdate.userErrors.length) {
    console.error('  ✗ Errors:', data.menuUpdate.userErrors);
    return;
  }
  console.log('  ✓ Main menu updated');
  // Print result
  const verify = await gql(`{
    menu(id: "${mainMenu.id}") {
      title
      items { title url items { title url } }
    }
  }`);
  for (const it of verify.menu.items) {
    const children = (it.items || []).map(c => c.title).join(', ');
    console.log(`    ${it.title}${children ? ' → ' + children : ''}`);
  }
}

async function main() {
  console.log('═══ Creating / Updating Navigation Menus ═══\n');

  // A verified collection is the unit of navigation, never a guessed handle.
  const vendorNames = await fetchVendorNames();
  const collectionIndex = await fetchCollectionIndex();
  const vendorSpecs = buildVendorSpecs(discoverSubBrandNames(vendorNames, collectionIndex));
  const dynamicDesignerItems = buildDesignersSubmenuChildren(
    vendorSpecs, collectionIndex, { storeHost: STORE }
  );
  // Probe only missing collection targets, not the entire Shopify catalog.
  const facets=await fetchVerifiedFacetProofs(MENUS,collectionIndex);
  console.log(`Verified native taxonomy link probes: ${Object.keys(facets.proofs).length}/${facets.checked}`);
  const blocked = [];
  for (const menuDef of MENUS) {
    if (menuDef.handle === 'designers-featured' || menuDef.handle === 'designers-all') {
      menuDef.items = dynamicDesignerItems.map((entry) => ({ ...entry }));
      continue;
    }
    const plan = planCategoryNavigation(menuDef, collectionIndex, {facetProofs:facets.proofs,storeHost:STORE});
    blocked.push(...plan.blocked);
    menuDef.items = plan.menu.items;
  }
  MAIN_MENU.find((entry) => entry.title === 'Designers').items = dynamicDesignerItems.map((entry) => ({ ...entry }));
  console.log(`Discovered ${vendorSpecs.length} Designers entries (including published child-brand collections)`);
  console.log(`Taxonomy navigation blockers: ${blocked.length}`);
  for (const entry of blocked) {
    console.log(`  BLOCKED ${entry.menu}/${entry.label} → ${entry.expectedHandle || 'unmapped'} (${entry.reason})`);
  }
  if (!APPLY) {
    console.log('DRY RUN ONLY: no collection or menu mutations. --apply and RUEIV_MENU_APPLY_APPROVED=1 are both required.');
    return;
  }
  // Owner-locked navigation is invariant across vendor uploads.  A missing
  // Shopify collection or unmaterialized Hub mapping blocks the menu write;
  // never replace the established submenu with only currently populated links.
  if (blocked.length > 0) {
    throw new Error('OWNER_FIXED_SUBMENU_UNMATERIALIZED: '+blocked.length+' destinations blocked; no Shopify menu writes');
  }
  // Do not silently publish a menu with zero resolved links.
  if (MENUS.some((entry) => entry.items.length === 0)) {
    throw new Error('Empty navigation submenu after membership readback; refusing Shopify mutations');
  }

  const existing = await getExistingMenus();
  console.log(`Found ${existing.length} existing menus\n`);

  // Create/update all sub-menus
  for (const menuDef of MENUS) {
    await createOrUpdateMenu(menuDef, existing);
  }

  // Update main menu
  await updateMainMenu(existing,dynamicDesignerItems);

  console.log('\n═══ Done ═══');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
