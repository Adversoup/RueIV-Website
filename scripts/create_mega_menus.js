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

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V = process.env.SHOPIFY_API_VERSION || '2026-04';
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

async function updateMainMenu(existing) {
  const mainMenu = existing.find(m => m.handle === 'main-menu');
  if (!mainMenu) {
    console.error('✗ main-menu not found!');
    return;
  }
  console.log(`\n▸ Updating main-menu (${mainMenu.id})`);
  const data = await gql(UPDATE_MENU, {
    id: mainMenu.id,
    title: mainMenu.title,
    items: MAIN_MENU
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
  const existing = await getExistingMenus();
  console.log(`Found ${existing.length} existing menus\n`);

  // Create/update all sub-menus
  for (const menuDef of MENUS) {
    await createOrUpdateMenu(menuDef, existing);
  }

  // Update main menu
  await updateMainMenu(existing);

  console.log('\n═══ Done ═══');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
