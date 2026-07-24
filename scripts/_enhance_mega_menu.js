#!/usr/bin/env node
/**
 * Step 10 — Mega Menu Visual Enhancement
 * 
 * Adds a "Featured" panel (4th column) to each category mega menu:
 * ┌──────────┬──────────┬──────────┬──────────────────┐
 * │ Column A │ Column B │ Column C │   [FEATURED IMG] │
 * │ Links    │ Links    │ Links    │ Featured Title   │
 * │          │          │          │ [Shop Now →]     │
 * └──────────┴──────────┴──────────┴──────────────────┘
 * 
 * Changes:
 * 1. Update header.liquid schema — add featured_* settings to rueiv_mega_v3 block
 * 2. Update mega-menu-rueiv-v3.liquid — render featured column
 * 3. Update rueiv-mega-v3.css — styles for featured panel
 * 4. Update header-group.json — set featured_collection for each category
 */
require('dotenv').config();
const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

async function getAsset(key) {
  const r = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  const j = await r.json();
  return j.asset ? j.asset.value : null;
}

async function putAsset(key, value) {
  const r = await fetch(`https://${store}/admin/api/${ver}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } })
  });
  const j = await r.json();
  if (j.errors) throw new Error(`PUT ${key}: ${JSON.stringify(j.errors)}`);
  return j;
}

async function main() {
  // ══════════════════════════════════════════════════════════════════
  // 1. UPDATE HEADER.LIQUID SCHEMA — add featured settings
  // ══════════════════════════════════════════════════════════════════
  console.log('1. Updating header.liquid block schema...');
  let headerLiquid = await getAsset('sections/header.liquid');
  
  const schemaMatch = headerLiquid.match(/(\{%[-\s]*schema[-\s]*%\})([\s\S]+?)(\{%[-\s]*endschema[-\s]*%\})/);
  if (!schemaMatch) throw new Error('Could not find schema in header.liquid');
  
  const schema = JSON.parse(schemaMatch[2]);
  const megaV3 = schema.blocks.find(b => b.type === 'rueiv_mega_v3');
  
  // Check if featured settings already exist
  const hasFeatured = megaV3.settings.some(s => s.id === 'featured_collection');
  
  if (!hasFeatured) {
    megaV3.settings.push(
      { type: 'header', content: 'Featured Panel' },
      {
        type: 'collection',
        id: 'featured_collection',
        label: 'Featured collection',
        info: 'Shown in the right panel with a large image and CTA'
      },
      {
        type: 'text',
        id: 'featured_title',
        label: 'Featured title',
        default: 'New Arrivals',
        info: 'Leave blank to use collection title'
      },
      {
        type: 'text',
        id: 'featured_label',
        label: 'Button label',
        default: 'Shop Now'
      },
      {
        type: 'url',
        id: 'featured_link',
        label: 'Featured link',
        info: 'Leave blank to use collection URL'
      }
    );
    
    const updatedSchema = schemaMatch[1] + '\n' + JSON.stringify(schema, null, 2) + '\n' + schemaMatch[3];
    headerLiquid = headerLiquid.replace(schemaMatch[0], updatedSchema);
    await putAsset('sections/header.liquid', headerLiquid);
    console.log('   ✅ Added featured_collection, featured_title, featured_label, featured_link to schema');
  } else {
    console.log('   ⏭️  Featured settings already in schema');
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. UPDATE MEGA-MENU-RUEIV-V3.LIQUID — add featured panel
  // ══════════════════════════════════════════════════════════════════
  console.log('\n2. Updating mega-menu-rueiv-v3.liquid...');
  
  // Read current snippet to get its structure, but we'll replace the grid section
  const currentSnippet = await getAsset('snippets/mega-menu-rueiv-v3.liquid');
  
  // Check if already enhanced
  if (currentSnippet.includes('rv3-featured')) {
    console.log('   ⏭️  Featured panel already in snippet');
  } else {
    // Find the closing of the grid div and insert featured panel before it
    // The snippet ends with: </div><!-- .rv3-grid --> then more closing divs
    
    // We need to:
    // a) Add featured_collection variable assignments at the top
    // b) Add featured panel markup before </div><!-- .rv3-grid -->
    // c) Update the grid class to include featured variant
    
    // a) Add variable assignments — inject after col_c_img assignment block
    let updatedSnippet = currentSnippet;
    
    // Find the variable assignment section and add featured vars
    const featuredVarsBlock = `
  comment
    ── Featured Panel ──
  endcomment
  assign feat_collection_obj = block.settings.featured_collection
  assign feat_title = block.settings.featured_title | default: ''
  assign feat_label = block.settings.featured_label | default: 'Shop Now'
  assign feat_link = block.settings.featured_link | default: ''
  assign has_featured = false
  if feat_collection_obj != blank
    assign has_featured = true
    if feat_title == blank
      assign feat_title = feat_collection_obj.title
    endif
    if feat_link == blank
      assign feat_link = feat_collection_obj.url
    endif
  endif`;
    
    // Insert before the visible_cols counting
    updatedSnippet = updatedSnippet.replace(
      /(\s*comment\s*── Count visible columns ──\s*endcomment)/,
      featuredVarsBlock + '\n\n  $1'
    );
    
    // b) Change grid class to support featured
    updatedSnippet = updatedSnippet.replace(
      /rv3-grid rv3-grid--\{\{ visible_cols \}\}col/g,
      'rv3-grid rv3-grid--{{ visible_cols }}col{% if has_featured %} rv3-grid--featured{% endif %}'
    );
    
    // c) Add featured panel markup before the grid closing div
    const featuredMarkup = `
          {%- comment -%} ── FEATURED PANEL ── {%- endcomment -%}
          {%- if has_featured -%}
            <div class="rv3-featured">
              {%- if feat_collection_obj.image != blank -%}
                <a href="{{ feat_link }}" class="rv3-featured__img-link">
                  <div class="rv3-featured__img-wrap">
                    {{ feat_collection_obj.image | image_url: width: 800 | image_tag: loading: 'lazy', class: 'rv3-featured__img', alt: feat_title }}
                  </div>
                </a>
              {%- endif -%}
              <div class="rv3-featured__content">
                {%- if feat_title != blank -%}
                  <span class="rv3-featured__title">{{ feat_title }}</span>
                {%- endif -%}
                {%- if feat_label != blank and feat_link != blank -%}
                  <a href="{{ feat_link }}" class="rv3-featured__btn">
                    {{ feat_label }}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 7H13M13 7L7.5 1.5M13 7L7.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </a>
                {%- endif -%}
              </div>
            </div>
          {%- endif -%}
`;
    
    // Insert before </div><!-- .rv3-grid -->
    updatedSnippet = updatedSnippet.replace(
      /(\s*<\/div><!-- \.rv3-grid -->)/,
      '\n' + featuredMarkup + '$1'
    );
    
    await putAsset('snippets/mega-menu-rueiv-v3.liquid', updatedSnippet);
    console.log('   ✅ Added featured panel to mega menu v3 snippet');
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. UPDATE CSS — add featured panel styles
  // ══════════════════════════════════════════════════════════════════
  console.log('\n3. Updating rueiv-mega-v3.css...');
  let css = await getAsset('assets/rueiv-mega-v3.css');
  
  if (css.includes('rv3-featured')) {
    console.log('   ⏭️  Featured styles already in CSS');
  } else {
    const featuredCSS = `

/* ── Featured Panel (4th column) ── */
.rv3-grid--featured {
  grid-template-columns: repeat(3, 1fr) minmax(220px, 1.2fr);
}
.rv3-grid--featured.rv3-grid--2col {
  grid-template-columns: repeat(2, 1fr) minmax(220px, 1.2fr);
}
.rv3-grid--featured.rv3-grid--1col {
  grid-template-columns: 1fr minmax(220px, 1.2fr);
  max-width: 100%;
}

.rv3-featured {
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(var(--color-foreground), 0.08);
  padding-left: 2rem;
  min-width: 0;
}

.rv3-featured__img-link {
  display: block;
  text-decoration: none;
}

.rv3-featured__img-wrap {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.rv3-featured__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s ease;
}

.rv3-featured__img-link:hover .rv3-featured__img {
  transform: scale(1.04);
}

.rv3-featured__content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rv3-featured__title {
  font-family: 'Libre Caslon Display', serif;
  font-size: 1.4rem;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.3;
  color: rgb(var(--color-foreground));
}

.rv3-featured__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
  color: rgb(var(--color-foreground));
  opacity: 0.7;
  transition: opacity 0.2s ease;
  margin-top: 0.25rem;
}

.rv3-featured__btn:hover {
  opacity: 1;
}

.rv3-featured__btn svg {
  transition: transform 0.3s ease;
}

.rv3-featured__btn:hover svg {
  transform: translateX(4px);
}

@media (max-width: 1023.98px) {
  .rv3-featured {
    display: none;
  }
}
`;
    css += featuredCSS;
    await putAsset('assets/rueiv-mega-v3.css', css);
    console.log('   ✅ Added featured panel CSS styles');
  }

  // ══════════════════════════════════════════════════════════════════
  // 4. UPDATE HEADER-GROUP.JSON — set featured collections
  // ══════════════════════════════════════════════════════════════════
  console.log('\n4. Updating header-group.json with featured collections...');
  
  const headerGroupRaw = await getAsset('sections/header-group.json');
  const headerGroup = JSON.parse(headerGroupRaw);
  const headerKey = Object.keys(headerGroup.sections).find(k => headerGroup.sections[k].type === 'header');
  const header = headerGroup.sections[headerKey];
  
  // Map category blocks to their featured collections
  const featuredMap = {
    mega_textiles:     { collection: 'fabric',     title: 'Curated Textiles',     label: 'Shop Collection' },
    mega_wallcovering: { collection: 'wallpaper',  title: 'New Wallcoverings',    label: 'Explore' },
    mega_furniture:    { collection: 'furniture',  title: 'Featured Furniture',   label: 'Shop Now' },
    mega_lighting:     { collection: 'lighting',   title: 'Lighting Picks',       label: 'Shop Now' },
    mega_rugs:         { collection: 'rugs',       title: 'Featured Rugs',        label: 'Shop Now' },
    mega_accessories:  { collection: 'accessories', title: 'Curated Accessories', label: 'Shop Now' }
  };
  
  for (const [blockId, feat] of Object.entries(featuredMap)) {
    if (header.blocks[blockId]) {
      header.blocks[blockId].settings.featured_collection = feat.collection;
      header.blocks[blockId].settings.featured_title = feat.title;
      header.blocks[blockId].settings.featured_label = feat.label;
      // featured_link left blank → auto-uses collection URL
    }
  }
  
  await putAsset('sections/header-group.json', JSON.stringify(headerGroup, null, 2));
  console.log('   ✅ Set featured collections for all 6 category mega menus');
  
  console.log('\n══════════════════════════════════════════');
  console.log('✅ Mega Menu Visual Enhancement Complete!');
  console.log('══════════════════════════════════════════');
  console.log('Each category mega menu now shows a 4th featured panel');
  console.log('with collection image, title, and "Shop Now" CTA.');
}

main().catch(err => { console.error('❌ ERROR:', err.message); process.exit(1); });
