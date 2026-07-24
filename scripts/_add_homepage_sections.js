#!/usr/bin/env node
/**
 * ADD showroom homepage sections to the EXISTING live index.json
 * WITHOUT removing or modifying any existing sections.
 * Uses correct Modiva block types.
 */
require('dotenv').config();
const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function getAsset(key) {
  const res = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const j = await res.json();
  return j.asset ? j.asset.value : null;
}

async function putAsset(key, value) {
  const res = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } })
  });
  return res.json();
}

async function main() {
  console.log('Reading current live index.json...');
  const current = await getAsset('templates/index.json');
  if (!current) {
    console.error('Could not read live index.json!');
    return;
  }
  
  const template = JSON.parse(current);
  console.log(`Current sections: ${template.order.length}`);
  
  // Remove any previously added showroom sections (idempotent)
  const showroomKeys = ['showroom_categories', 'showroom_quickship', 'showroom_designers', 'showroom_vibe', 'showroom_newsletter'];
  for (const k of showroomKeys) {
    delete template.sections[k];
    const idx = template.order.indexOf(k);
    if (idx >= 0) template.order.splice(idx, 1);
  }
  
  // === Showroom Categories — collection-list with correct block type "featured_collection" ===
  template.sections['showroom_categories'] = {
    type: 'collection-list',
    blocks: {
      sc_textiles: {
        type: 'featured_collection',
        settings: { collection: 'fabric', title: 'Textiles', description: '' }
      },
      sc_wallcovering: {
        type: 'featured_collection',
        settings: { collection: 'wallpaper', title: 'Wallcovering', description: '' }
      },
      sc_furniture: {
        type: 'featured_collection',
        settings: { collection: 'furniture', title: 'Furniture', description: '' }
      },
      sc_lighting: {
        type: 'featured_collection',
        settings: { collection: 'lighting', title: 'Lighting', description: '' }
      },
      sc_rugs: {
        type: 'featured_collection',
        settings: { collection: 'rugs', title: 'Rugs', description: '' }
      },
      sc_accessories: {
        type: 'featured_collection',
        settings: { collection: 'accessories', title: 'Accessories', description: '' }
      }
    },
    block_order: ['sc_textiles', 'sc_wallcovering', 'sc_furniture', 'sc_lighting', 'sc_rugs', 'sc_accessories'],
    settings: {
      color_scheme: 'scheme-1',
      layout: 'standard',
      heading: 'Shop the Showroom',
      heading_size: 'h1',
      heading_highlight_style: 'none',
      card_color_inherited: true,
      card_style: '',
      card_image_ratio: 'adapt',
      content_alignment: 'center',
      columns_desktop: 3,
      column_gap: 'medium',
      row_gap: 'medium',
      enable_slider: false,
      columns_mobile: '1',
      swipe_on_mobile: true,
      padding_top: 40,
      padding_bottom: 40,
      show_section_divider: false,
      custom_class: ''
    }
  };
  
  // === Quick Ship — featured-collection (no blocks, just section settings) ===
  template.sections['showroom_quickship'] = {
    type: 'featured-collection',
    settings: {
      color_scheme: 'scheme-1',
      header_layout: 'standard',
      heading: 'Quick Ship',
      heading_size: 'h1',
      heading_highlight_style: 'none',
      description: '<p>Ready to ship within 2 weeks. Curated selections available for immediate delivery.</p>',
      collection: 'quick-ship',
      limit: 8,
      columns: 4,
      column_gap: 'medium',
      row_gap: 'medium',
      grid_layout: 'standard',
      enable_slider: true,
      show_all_button_on_top: false,
      button_label: 'View All Quick Ship',
      button_style: 'btn--primary',
      padding_top: 40,
      padding_bottom: 40,
      show_section_divider: false,
      custom_class: ''
    }
  };
  
  // === Featured Designers — collection-list ===
  template.sections['showroom_designers'] = {
    type: 'collection-list',
    blocks: {
      sd_arte: {
        type: 'featured_collection',
        settings: { collection: 'arte', title: 'Arte', description: '' }
      },
      sd_fabricut: {
        type: 'featured_collection',
        settings: { collection: 'fabricut', title: 'Fabricut', description: '' }
      },
      sd_portaromana: {
        type: 'featured_collection',
        settings: { collection: 'porta-romana', title: 'Porta Romana', description: '' }
      },
      sd_verellen: {
        type: 'featured_collection',
        settings: { collection: 'verellen', title: 'Verellen', description: '' }
      },
      sd_zr: {
        type: 'featured_collection',
        settings: { collection: 'zr', title: 'Zimmer + Rohde', description: '' }
      }
    },
    block_order: ['sd_arte', 'sd_fabricut', 'sd_portaromana', 'sd_verellen', 'sd_zr'],
    settings: {
      color_scheme: 'scheme-1',
      layout: 'standard',
      heading: 'Featured Designers',
      heading_size: 'h1',
      heading_highlight_style: 'none',
      card_color_inherited: true,
      card_style: '',
      card_image_ratio: 'adapt',
      content_alignment: 'center',
      columns_desktop: 5,
      column_gap: 'medium',
      row_gap: 'medium',
      enable_slider: false,
      columns_mobile: '2',
      swipe_on_mobile: true,
      padding_top: 40,
      padding_bottom: 40,
      show_section_divider: false,
      custom_class: ''
    }
  };
  
  // === Vibe Studio — image-with-text-overlay with correct block types ===
  template.sections['showroom_vibe'] = {
    type: 'image-with-text-overlay',
    blocks: {
      sv_heading: {
        type: 'heading',
        settings: {
          heading: 'The Vibe Studio',
          heading_size: 'hd1',
          heading_highlight_style: 'none'
        }
      },
      sv_text: {
        type: 'text',
        settings: {
          text: '<p>Explore curated interiors, designer spotlights, and mood boards crafted for every aesthetic.</p>',
          text_size: 'text-lg'
        }
      },
      sv_button: {
        type: 'button',
        settings: {
          button_label: 'Explore Now',
          button_link: '/pages/vibe-studio',
          button_style: 'btn--primary'
        }
      }
    },
    block_order: ['sv_heading', 'sv_text', 'sv_button'],
    settings: {
      container: 'full',
      color_scheme: 'scheme-inverse',
      desktop_height: 'medium',
      overlay_opacity: 30,
      content_position: 'middle-center',
      content_alignment: 'center',
      padding_top: 0,
      padding_bottom: 0,
      custom_class: ''
    }
  };
  
  // === Newsletter ===
  template.sections['showroom_newsletter'] = {
    type: 'newsletter',
    settings: {
      color_scheme: 'scheme-6',
      layout: 'standard',
      heading: 'The Vibe List',
      heading_size: 'h1',
      heading_highlight_style: 'none',
      description: '<p>Subscribe for exclusive access to new collections, designer spotlights, and showroom events.</p>',
      alignment: 'center',
      form_width: 465,
      button_style: 'btn--primary',
      padding_top: 52,
      padding_bottom: 52,
      show_section_divider: false,
      custom_class: ''
    }
  };
  
  // Insert showroom sections after featured_collection_nTAnFG
  const insertAfter = template.order.indexOf('featured_collection_nTAnFG');
  const insertPos = insertAfter >= 0 ? insertAfter + 1 : template.order.length;
  template.order.splice(insertPos, 0, ...showroomKeys);
  
  console.log(`\nNew section order (${template.order.length} sections):`);
  template.order.forEach((key, i) => {
    const isNew = showroomKeys.includes(key);
    console.log(`  ${i + 1}. ${key} (${template.sections[key].type})${isNew ? ' ← NEW' : ''}`);
  });
  
  console.log('\nDeploying updated index.json...');
  const result = await putAsset('templates/index.json', JSON.stringify(template, null, 2));
  if (result.asset) {
    console.log('✅ Homepage updated — showroom sections ADDED (existing content preserved)');
  } else {
    console.error('❌ Failed:', JSON.stringify(result.errors || result));
  }
}

main().catch(console.error);
