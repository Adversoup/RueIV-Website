#!/usr/bin/env node
/**
 * deploy_showroom.js — Master deployment script
 * 
 * Creates everything needed for the showroom navigation system:
 * 1. Missing collections (rugs, accessories, quick-ship)
 * 2. Showroom metafield definitions
 * 3. Navigation menus (accessories sub-menus, update main-menu)
 * 4. Deploys theme files to live Modiva theme
 * 5. Updates header-group.json & footer-group.json on live theme
 * 6. Updates homepage template
 */
require('dotenv').config();

const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147; // Modiva (main)
const fs      = require('fs');
const path    = require('path');

const GQL  = `https://${store}/admin/api/${ver}/graphql.json`;
const REST = `https://${store}/admin/api/${ver}`;

// ── Helpers ──────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) {
    console.error('  GQL Error:', JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

async function restGet(p) {
  const res = await fetch(`${REST}${p}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  return res.json();
}

async function restPost(p, body) {
  const res = await fetch(`${REST}${p}`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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
  return restPut(`/themes/${themeId}/assets.json`, {
    asset: { key, value }
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── STEP 1: Create missing collections ──────────────────────────

async function createCollections() {
  console.log('\n━━━ STEP 1: Collections ━━━');
  
  // Get existing collections
  const custom = await restGet('/custom_collections.json?limit=250');
  const smart = await restGet('/smart_collections.json?limit=250');
  const existing = new Set([
    ...(custom.custom_collections || []).map(c => c.handle),
    ...(smart.smart_collections || []).map(c => c.handle)
  ]);
  
  const needed = [
    {
      title: 'Rugs',
      handle: 'rugs',
      rules: [{ column: 'type', relation: 'equals', condition: 'Rug' }],
      sort_order: 'best-selling'
    },
    {
      title: 'Accessories',
      handle: 'accessories',
      rules: [{ column: 'tag', relation: 'equals', condition: 'category:accessories' }],
      sort_order: 'best-selling'
    },
    {
      title: 'Quick Ship',
      handle: 'quick-ship',
      rules: [{ column: 'tag', relation: 'equals', condition: 'lead-time:quick-ship' }],
      sort_order: 'best-selling'
    },
    {
      title: 'Textiles',
      handle: 'textiles',
      rules: [{ column: 'type', relation: 'equals', condition: 'Fabric' }],
      sort_order: 'best-selling'
    }
  ];
  
  for (const col of needed) {
    if (existing.has(col.handle)) {
      console.log(`  ✓ ${col.handle} already exists`);
      continue;
    }
    console.log(`  Creating ${col.handle}...`);
    const result = await restPost('/smart_collections.json', {
      smart_collection: {
        title: col.title,
        handle: col.handle,
        rules: col.rules,
        sort_order: col.sort_order,
        published: true
      }
    });
    if (result.smart_collection) {
      console.log(`  ✓ Created ${col.handle} (ID: ${result.smart_collection.id})`);
    } else {
      console.error(`  ✗ Failed to create ${col.handle}:`, JSON.stringify(result.errors || result));
    }
    await sleep(500);
  }
}

// ── STEP 2: Metafield definitions ───────────────────────────────

async function createMetafields() {
  console.log('\n━━━ STEP 2: Metafield Definitions ━━━');
  
  const definitions = [
    { namespace: 'showroom', key: 'material', name: 'Material', type: 'list.single_line_text_field' },
    { namespace: 'showroom', key: 'color_family', name: 'Color Family', type: 'single_line_text_field' },
    { namespace: 'showroom', key: 'pattern', name: 'Pattern', type: 'single_line_text_field' },
    { namespace: 'showroom', key: 'room', name: 'Room', type: 'list.single_line_text_field' },
    { namespace: 'showroom', key: 'application', name: 'Application', type: 'list.single_line_text_field' },
    { namespace: 'showroom', key: 'lead_time', name: 'Lead Time', type: 'single_line_text_field' },
    { namespace: 'showroom', key: 'designer', name: 'Designer', type: 'single_line_text_field' }
  ];
  
  for (const def of definitions) {
    const mutation = `mutation {
      metafieldDefinitionCreate(definition: {
        name: "${def.name}",
        namespace: "${def.namespace}",
        key: "${def.key}",
        type: "${def.type}",
        ownerType: PRODUCT,
        pin: true
      }) {
        createdDefinition { id }
        userErrors { message code }
      }
    }`;
    
    const result = await gql(mutation);
    if (result && result.metafieldDefinitionCreate) {
      const ue = result.metafieldDefinitionCreate.userErrors;
      if (ue.length === 0) {
        console.log(`  ✓ Created ${def.namespace}.${def.key}`);
      } else if (ue[0].code === 'TAKEN' || ue[0].message.includes('already exists')) {
        console.log(`  ✓ ${def.namespace}.${def.key} already exists`);
      } else {
        console.log(`  ✗ ${def.namespace}.${def.key}: ${ue[0].message}`);
      }
    }
    await sleep(300);
  }
}

// ── STEP 3: Navigation menus ─────────────────────────────────────

async function createMenus() {
  console.log('\n━━━ STEP 3: Navigation Menus ━━━');
  
  // Get existing menus
  const menuData = await gql(`{
    menus(first: 50) {
      edges { node { id title handle } }
    }
  }`);
  const existingMenus = {};
  if (menuData && menuData.menus) {
    menuData.menus.edges.forEach(e => {
      existingMenus[e.node.handle] = e.node.id;
    });
  }
  
  // Accessories sub-menus
  const menusToCreate = [
    {
      title: 'Accessories - Shop by Category',
      handle: 'accessories-category',
      items: [
        { title: 'All Accessories', url: '/collections/accessories' },
        { title: 'Decorative Objects', url: '/collections/accessories' },
        { title: 'Tabletop', url: '/collections/accessories' },
        { title: 'Pillows & Throws', url: '/collections/accessories' },
        { title: 'Frames & Mirrors', url: '/collections/accessories' },
        { title: 'Candles & Fragrance', url: '/collections/accessories' },
        { title: 'Books', url: '/collections/accessories' }
      ]
    },
    {
      title: 'Accessories - Shop by Room',
      handle: 'accessories-room',
      items: [
        { title: 'Living Room', url: '/collections/living-room' },
        { title: 'Bedroom', url: '/collections/bedroom' },
        { title: 'Dining Room', url: '/collections/dining-room' },
        { title: 'Office', url: '/collections/office' },
        { title: 'Outdoor', url: '/collections/outdoor' }
      ]
    },
    {
      title: 'Accessories - Shop by Material',
      handle: 'accessories-material',
      items: [
        { title: 'Ceramic', url: '/collections/accessories' },
        { title: 'Glass', url: '/collections/accessories' },
        { title: 'Metal', url: '/collections/accessories' },
        { title: 'Wood', url: '/collections/accessories' },
        { title: 'Stone', url: '/collections/accessories' },
        { title: 'Leather', url: '/collections/accessories' }
      ]
    },
    {
      title: 'Textiles - Shop by Application',
      handle: 'textiles-application',
      items: [
        { title: 'All Textiles', url: '/collections/fabric' },
        { title: 'Upholstery', url: '/collections/fabric-upholstery' },
        { title: 'Drapery', url: '/collections/fabric-drapery' },
        { title: 'Sheers', url: '/collections/fabric-sheer' },
        { title: 'Decorative', url: '/collections/fabric-decorative' },
        { title: 'Outdoor', url: '/collections/outdoor' },
        { title: 'Leather', url: '/collections/fabric' }
      ]
    },
    {
      title: 'Textiles - Shop by Material',
      handle: 'textiles-material',
      items: [
        { title: 'Linen', url: '/collections/fabric' },
        { title: 'Cotton', url: '/collections/fabric' },
        { title: 'Silk', url: '/collections/fabric' },
        { title: 'Velvet', url: '/collections/fabric' },
        { title: 'Wool', url: '/collections/fabric' },
        { title: 'Performance', url: '/collections/fabric-performance' }
      ]
    },
    {
      title: 'Textiles - Shop by Color',
      handle: 'textiles-color-family',
      items: [
        { title: 'Neutrals', url: '/collections/fabric-ivory' },
        { title: 'Warm', url: '/collections/fabric-gold' },
        { title: 'Cool', url: '/collections/fabric-blue' },
        { title: 'Dark', url: '/collections/fabric-navy' },
        { title: 'Patterned', url: '/collections/fabric-multi' },
        { title: 'All Colors', url: '/collections/fabric' }
      ]
    },
    {
      title: 'Wallcovering - Shop by Color',
      handle: 'wallcovering-color-family',
      items: [
        { title: 'Neutrals', url: '/collections/wallpaper-ivory' },
        { title: 'Warm', url: '/collections/wallpaper-gold' },
        { title: 'Cool', url: '/collections/wallpaper-indigo' },
        { title: 'Dark', url: '/collections/wallpaper-forest' },
        { title: 'Patterned', url: '/collections/wallpaper-multi' },
        { title: 'All Colors', url: '/collections/wallpaper' }
      ]
    },
    {
      title: 'Lighting - Shop by Style',
      handle: 'lighting-style',
      items: [
        { title: 'Contemporary', url: '/collections/lighting' },
        { title: 'Traditional', url: '/collections/lighting' },
        { title: 'Transitional', url: '/collections/lighting' },
        { title: 'Sculptural', url: '/collections/lighting' },
        { title: 'Quick Ship', url: '/collections/quick-ship' }
      ]
    },
    {
      title: 'Furniture - Shop by Type',
      handle: 'furniture-type-v2',
      items: [
        { title: 'All Furniture', url: '/collections/furniture' },
        { title: 'Sofas', url: '/collections/furniture' },
        { title: 'Chairs', url: '/collections/furniture' },
        { title: 'Tables', url: '/collections/furniture' },
        { title: 'Beds', url: '/collections/furniture' },
        { title: 'Ottomans', url: '/collections/furniture' },
        { title: 'Storage', url: '/collections/furniture' },
        { title: 'Quick Ship', url: '/collections/quick-ship' }
      ]
    },
    {
      title: 'Rugs - Shop by Material',
      handle: 'rugs-material',
      items: [
        { title: 'All Rugs', url: '/collections/rugs' },
        { title: 'Wool', url: '/collections/rugs' },
        { title: 'Silk', url: '/collections/rugs' },
        { title: 'Jute', url: '/collections/rugs' },
        { title: 'Indoor/Outdoor', url: '/collections/rugs' }
      ]
    },
    {
      title: 'Footer - Company',
      handle: 'footer-company',
      items: [
        { title: 'About', url: '/pages/about' },
        { title: 'Designers', url: '/pages/brands' },
        { title: 'Events', url: '/pages/events' },
        { title: 'Careers', url: '/pages/about' },
        { title: 'Contact', url: '/pages/contact' }
      ]
    },
    {
      title: 'Footer - Resources',
      handle: 'footer-resources',
      items: [
        { title: 'Trade Program', url: '/pages/trade-program' },
        { title: 'How It Works', url: '/pages/about' },
        { title: 'Shipping & Returns', url: '/pages/returns' },
        { title: 'Care Guide', url: '/pages/about' },
        { title: 'FAQ', url: '/pages/about' }
      ]
    }
  ];
  
  for (const menu of menusToCreate) {
    if (existingMenus[menu.handle]) {
      console.log(`  ✓ ${menu.handle} already exists`);
      continue;
    }
    
    const itemsGql = menu.items.map(item =>
      `{ title: "${item.title}", type: HTTP, url: "https://${store}${item.url}" }`
    ).join(', ');
    
    const mutation = `mutation {
      menuCreate(title: "${menu.title}", handle: "${menu.handle}", items: [${itemsGql}]) {
        menu { id handle }
        userErrors { message field }
      }
    }`;
    
    const result = await gql(mutation);
    if (result && result.menuCreate) {
      const ue = result.menuCreate.userErrors || [];
      if (ue.length === 0) {
        console.log(`  ✓ Created ${menu.handle}`);
      } else {
        console.log(`  ✗ ${menu.handle}: ${ue.map(e => e.message).join(', ')}`);
      }
    }
    await sleep(400);
  }
  
  // Now update the main-menu
  console.log('\n  Updating main-menu...');
  const mainMenuId = existingMenus['main-menu'];
  if (mainMenuId) {
    const updateMutation = `mutation {
      menuUpdate(id: "${mainMenuId}", items: [
        { title: "Textiles", type: HTTP, url: "https://${store}/collections/fabric" },
        { title: "Wallcovering", type: HTTP, url: "https://${store}/collections/wallpaper" },
        { title: "Furniture", type: HTTP, url: "https://${store}/collections/furniture" },
        { title: "Lighting", type: HTTP, url: "https://${store}/collections/lighting" },
        { title: "Rugs", type: HTTP, url: "https://${store}/collections/rugs" },
        { title: "Accessories", type: HTTP, url: "https://${store}/collections/accessories" },
        { title: "The Vibe Studio", type: HTTP, url: "https://${store}/pages/vibe-studio",
          items: [
            { title: "Designer Spotlight", type: HTTP, url: "https://${store}/pages/designer-spotlight" },
            { title: "Portfolio", type: HTTP, url: "https://${store}/pages/portfolio" },
            { title: "Moodboards", type: HTTP, url: "https://${store}/pages/moodboards" }
          ]
        }
      ]) {
        menu { id handle items { title url } }
        userErrors { message field }
      }
    }`;
    const updateResult = await gql(updateMutation);
    if (updateResult && updateResult.menuUpdate) {
      const ue = updateResult.menuUpdate.userErrors || [];
      if (ue.length === 0) {
        console.log('  ✓ main-menu updated (7 items: Textiles, Wallcovering, Furniture, Lighting, Rugs, Accessories, The Vibe Studio)');
        updateResult.menuUpdate.menu.items.forEach(i => console.log(`    - ${i.title}`));
      } else {
        console.log(`  ✗ main-menu update error: ${ue.map(e => e.message).join(', ')}`);
      }
    }
  }
}

// ── STEP 4: Deploy theme files ───────────────────────────────────

async function deployTheme() {
  console.log('\n━━━ STEP 4: Deploy Theme Files ━━━');
  
  const themeRoot = path.join(__dirname, '..', 'theme');
  
  // Files to deploy
  const filesToDeploy = [
    'snippets/smart-filters.liquid',
    'assets/smart-filters.css',
    'snippets/mega-menu-rueiv-v3.liquid',
    'snippets/mega-menu-vibe-studio.liquid',
    'snippets/desktop-menu.liquid',
    'assets/rueiv-mega-v3.css',
    'assets/rueiv-global.css',
    'assets/rueiv-fonts.css',
    'sections/main-collection-product-grid.liquid'
  ];
  
  for (const file of filesToDeploy) {
    const localPath = path.join(themeRoot, file);
    if (!fs.existsSync(localPath)) {
      console.log(`  ⊘ ${file} — local file not found, skip`);
      continue;
    }
    const content = fs.readFileSync(localPath, 'utf-8');
    const result = await putAsset(file, content);
    if (result.asset) {
      console.log(`  ✓ Deployed ${file} (${content.length} chars)`);
    } else {
      console.log(`  ✗ Failed ${file}: ${JSON.stringify(result.errors || result)}`);
    }
    await sleep(500);
  }
  
  // Deploy updated header-group.json
  console.log('\n  Deploying header-group.json...');
  const headerGroup = {
    "name": "t:sections.header.name",
    "type": "header",
    "sections": {
      "header": {
        "type": "header",
        "blocks": {
          "mega_textiles": {
            "type": "rueiv_mega_v3",
            "settings": {
              "menu_title": "Textiles",
              "col_a_title": "Shop by Application",
              "col_a_menu": "textiles-application",
              "col_b_title": "Shop by Material",
              "col_b_menu": "textiles-material",
              "col_c_title": "Shop by Color",
              "col_c_menu": "textiles-color-family"
            }
          },
          "mega_wallcovering": {
            "type": "rueiv_mega_v3",
            "settings": {
              "menu_title": "Wallcovering",
              "col_a_title": "Shop by Material",
              "col_a_menu": "wallcovering-materials",
              "col_b_title": "Shop by Design",
              "col_b_menu": "wallcovering-design",
              "col_c_title": "Shop by Color",
              "col_c_menu": "wallcovering-color-family"
            }
          },
          "mega_furniture": {
            "type": "rueiv_mega_v3",
            "settings": {
              "menu_title": "Furniture",
              "col_a_title": "Shop by Type",
              "col_a_menu": "furniture-type-v2",
              "col_b_title": "Shop by Room",
              "col_b_menu": "furniture-room",
              "col_c_title": "Designers & Quick Ship",
              "col_c_menu": "furniture-designers"
            }
          },
          "mega_lighting": {
            "type": "rueiv_mega_v3",
            "settings": {
              "menu_title": "Lighting",
              "col_a_title": "Shop by Type",
              "col_a_menu": "lighting-type",
              "col_b_title": "Shop by Style",
              "col_b_menu": "lighting-style",
              "col_c_title": "Shop by Color",
              "col_c_menu": "lighting-color"
            }
          },
          "mega_rugs": {
            "type": "rueiv_mega_v3",
            "settings": {
              "menu_title": "Rugs",
              "col_a_title": "Shop by Size",
              "col_a_menu": "rugs-size",
              "col_b_title": "Shop by Material",
              "col_b_menu": "rugs-material",
              "col_c_title": "Shop by Color",
              "col_c_menu": "rugs-color"
            }
          },
          "mega_accessories": {
            "type": "rueiv_mega_v3",
            "settings": {
              "menu_title": "Accessories",
              "col_a_title": "Shop by Category",
              "col_a_menu": "accessories-category",
              "col_b_title": "Shop by Room",
              "col_b_menu": "accessories-room",
              "col_c_title": "Shop by Material",
              "col_c_menu": "accessories-material"
            }
          },
          "mega_vibe": {
            "type": "rueiv_mega_vibe",
            "settings": {
              "menu_title": "The Vibe Studio",
              "card_desc_1": "Curated showcases of visionary designers shaping modern interiors.",
              "card_desc_2": "See our latest residential and commercial design projects.",
              "card_desc_3": "Explore curated mood boards for every room and aesthetic.",
              "viewall_link": "/pages/vibe-studio",
              "viewall_label": "Explore The Vibe Studio"
            }
          }
        },
        "block_order": [
          "mega_textiles",
          "mega_wallcovering",
          "mega_furniture",
          "mega_lighting",
          "mega_rugs",
          "mega_accessories",
          "mega_vibe"
        ],
        "settings": {
          "container": "full",
          "color_scheme": "scheme-1",
          "menu": "main-menu",
          "menu_mobile": "",
          "header_layout": "left-center",
          "sticky_header": "always",
          "menu_trigger": "hover",
          "show_sperator_line": true,
          "hide_sperator_on_pages": "",
          "enable_transparent_header": true,
          "transparent_header_color": "#ffffff",
          "logo_mobile_position": "center",
          "show_social_media_icons": true,
          "enable_language_selector": true,
          "enable_country_selector": true,
          "padding_top": 8,
          "padding_bottom": 8
        }
      }
    },
    "order": ["header"]
  };
  
  const hgResult = await putAsset('sections/header-group.json', JSON.stringify(headerGroup, null, 2));
  if (hgResult.asset) {
    console.log('  ✓ header-group.json deployed');
  } else {
    console.log('  ✗ header-group.json failed:', JSON.stringify(hgResult.errors || hgResult));
  }
  
  // Deploy updated footer-group.json
  console.log('  Deploying footer-group.json...');
  const footerGroup = {
    "name": "t:sections.footer.name",
    "type": "footer",
    "sections": {
      "footer": {
        "type": "footer",
        "blocks": {
          "menu_company": {
            "type": "menu",
            "settings": {
              "block_width": 20,
              "heading": "Company",
              "menu": "footer-company",
              "show_heading": true
            }
          },
          "menu_resources": {
            "type": "menu",
            "settings": {
              "block_width": 20,
              "heading": "Resources",
              "menu": "footer-resources",
              "show_heading": true
            }
          },
          "newsletter_3qCrWc": {
            "type": "newsletter",
            "settings": {
              "block_width": 41,
              "heading": "The Vibe List",
              "heading_size": "h2",
              "newsletter_description": "<p>Subscribe for exclusive access to new collections, designer spotlights, and showroom events.</p>",
              "newsletter_term": "<p>By subscribing you agree to the <a href=\"/policies/terms-of-service\" target=\"_blank\" title=\"Terms of Service\">Terms of Use</a> & <a href=\"/policies/privacy-policy\" target=\"_blank\" title=\"Privacy Policy\">Privacy Policy.</a></p>",
              "newsletter_text_alignment": "left",
              "form_width": 465,
              "order_first": true
            }
          }
        },
        "block_order": [
          "menu_company",
          "menu_resources",
          "newsletter_3qCrWc"
        ],
        "custom_css": [],
        "settings": {
          "color_scheme": "scheme-6",
          "enable_follow_on_shop": true,
          "show_social": true,
          "enable_country_selector": true,
          "enable_language_selector": true,
          "payment_enable": true,
          "footer_bottom_menu": "footer",
          "show_section_divider": false,
          "divider_width": "full"
        }
      }
    },
    "order": ["footer"]
  };
  
  const fgResult = await putAsset('sections/footer-group.json', JSON.stringify(footerGroup, null, 2));
  if (fgResult.asset) {
    console.log('  ✓ footer-group.json deployed');
  } else {
    console.log('  ✗ footer-group.json failed:', JSON.stringify(fgResult.errors || fgResult));
  }
}

// ── STEP 5: Homepage template ────────────────────────────────────

async function deployHomepage() {
  console.log('\n━━━ STEP 5: Homepage Template ━━━');
  
  // Check what custom sections exist on live theme
  const sectionFiles = [
    'sections/rueiv-hero.liquid',
    'sections/rueiv-category-grid.liquid',
    'sections/rueiv-quick-ship.liquid',
    'sections/rueiv-editorial-grid.liquid',
    'sections/rueiv-vibe-studio.liquid',
    'sections/rueiv-newsletter.liquid',
    'sections/rueiv-testimonials.liquid'
  ];
  
  const themeRoot = path.join(__dirname, '..', 'theme');
  
  for (const file of sectionFiles) {
    const localPath = path.join(themeRoot, file);
    if (!fs.existsSync(localPath)) {
      console.log(`  ⊘ ${file} — not found locally, skip`);
      continue;
    }
    const content = fs.readFileSync(localPath, 'utf-8');
    const result = await putAsset(file, content);
    if (result.asset) {
      console.log(`  ✓ Deployed ${file}`);
    } else {
      console.log(`  ✗ Failed ${file}: ${JSON.stringify(result.errors || result)}`);
    }
    await sleep(500);
  }
  
  // Deploy homepage template
  const homepage = {
    "sections": {
      "rueiv_hero": {
        "type": "rueiv-hero",
        "settings": {}
      },
      "rueiv_categories": {
        "type": "rueiv-category-grid",
        "settings": {}
      },
      "rueiv_quickship": {
        "type": "rueiv-quick-ship",
        "settings": {}
      },
      "rueiv_editorial": {
        "type": "rueiv-editorial-grid",
        "settings": {}
      },
      "rueiv_vibe": {
        "type": "rueiv-vibe-studio",
        "settings": {}
      },
      "rueiv_newsletter": {
        "type": "rueiv-newsletter",
        "settings": {}
      }
    },
    "order": [
      "rueiv_hero",
      "rueiv_categories",
      "rueiv_quickship",
      "rueiv_editorial",
      "rueiv_vibe",
      "rueiv_newsletter"
    ]
  };
  
  const result = await putAsset('templates/index.json', JSON.stringify(homepage, null, 2));
  if (result.asset) {
    console.log('  ✓ index.json (homepage) deployed');
  } else {
    console.log('  ✗ index.json failed:', JSON.stringify(result.errors || result));
  }
}

// ── MAIN ─────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  RueIV Showroom — Full Deployment           ║');
  console.log('║  Theme: Modiva (156225110147)                ║');
  console.log('╚══════════════════════════════════════════════╝');
  
  await createCollections();
  await createMetafields();
  await createMenus();
  await deployTheme();
  await deployHomepage();
  
  console.log('\n━━━ DEPLOYMENT COMPLETE ━━━');
  console.log(`Verify at: https://${store}/?preview_theme_id=${themeId}&password=${process.env.SHOPIFY_STORE_PASSWORD || ''}`);
}

main().catch(console.error);
