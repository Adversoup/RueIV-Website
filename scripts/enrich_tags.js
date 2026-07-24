#!/usr/bin/env node
/**
 * enrich_tags.js — Reads product metafields and writes missing tags
 * 
 * Wallcovering: fiber_content → material: tags
 * Rugs: showroom.color_family → color-family: tags, showroom.material → material: tags
 * 
 * Usage:
 *   node scripts/enrich_tags.js --dry-run   # preview only
 *   node scripts/enrich_tags.js             # apply changes
 */

require('dotenv').config();

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const STORE = process.env.SHOPIFY_STORE || 'ruefour.myshopify.com';
const DRY_RUN = process.argv.includes('--dry-run');

const API = `https://${STORE}/admin/api/2024-10`;

async function gql(query, variables = {}) {
  const r = await fetch(`${API}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const data = await r.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function rest(method, endpoint, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}/${endpoint}`, opts);
  if (r.status === 429) {
    const retry = parseFloat(r.headers.get('Retry-After') || '2');
    console.log(`  Rate limited, waiting ${retry}s...`);
    await new Promise(ok => setTimeout(ok, retry * 1000));
    return rest(method, endpoint, body);
  }
  return r.json();
}

// ── Wallcovering material mapping ──
// fiber_content.raw → collection-compatible material tag
const WC_MATERIAL_MAP = {
  'vinyl': 'material:vinyl',
  'textile': 'material:textile',
  'textile on non-woven': 'material:textile',
  'printed non-woven': 'material:wallpapers',
  'natural material': 'material:naturals',
  'stitched leather on non-woven': 'material:leather',
  'non-woven': 'material:wallpapers',
  'paper': 'material:wallpapers',
  'grasscloth': 'material:naturals',
  'hand painted': 'material:hand-painted',
  'metallic': 'material:metallic',
  'mural': 'material:murals',
  'cork': 'material:naturals',
  'silk': 'material:naturals',
  'linen': 'material:naturals',
  'jute': 'material:naturals',
  'sisal': 'material:naturals',
  'raffia': 'material:naturals',
  'wood veneer': 'material:naturals',
  'fabric': 'material:textile',
};

// ── Wallcovering design mapping ──
// We'll check category_attributes.pattern or product name patterns
const WC_DESIGN_KEYWORDS = {
  'floral': 'design:florals',
  'flower': 'design:florals',
  'botanical': 'design:florals',
  'bouquet': 'design:florals',
  'geometric': 'design:geometric',
  'geo': 'design:geometric',
  'hexagon': 'design:geometric',
  'diamond': 'design:geometric',
  'trellis': 'design:geometric',
  'chevron': 'design:geometric',
  'stripe': 'design:geometric',
  'texture': 'design:textures',
  'weave': 'design:textures',
  'linen': 'design:textures',
  'grasscloth': 'design:textures',
  'plain': 'design:textures',
  'animal': 'design:animal-skin',
  'skin': 'design:animal-skin',
  'croc': 'design:animal-skin',
  'snake': 'design:animal-skin',
  'leopard': 'design:animal-skin',
  'zebra': 'design:animal-skin',
  'scenic': 'design:scenic',
  'mural': 'design:scenic',
  'toile': 'design:scenic',
  'landscape': 'design:scenic',
  'abstract': 'design:abstract',
  'hand painted': 'design:hand-painted',
};

function mapWcMaterial(fiberRaw) {
  if (!fiberRaw) return null;
  const lower = fiberRaw.toLowerCase().trim();
  // Direct match
  if (WC_MATERIAL_MAP[lower]) return WC_MATERIAL_MAP[lower];
  // Partial match
  for (const [key, tag] of Object.entries(WC_MATERIAL_MAP)) {
    if (lower.includes(key)) return tag;
  }
  return null;
}

function mapWcDesign(title, designAttr) {
  const searchText = ((title || '') + ' ' + (designAttr || '')).toLowerCase();
  for (const [keyword, tag] of Object.entries(WC_DESIGN_KEYWORDS)) {
    if (searchText.includes(keyword)) return tag;
  }
  return null;
}

async function fetchAllProducts(productType) {
  let cursor = null;
  const all = [];
  let page = 0;
  while (true) {
    page++;
    const after = cursor ? `, after: "${cursor}"` : '';
    const q = `{
      products(first: 50, query: "product_type:${productType}"${after}) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id
          title
          tags
          fiber: metafield(namespace: "rueiv", key: "fiber_content") { value }
          attrs: metafield(namespace: "rueiv", key: "category_attributes") { value }
          sColor: metafield(namespace: "showroom", key: "color_family") { value }
          sMaterial: metafield(namespace: "showroom", key: "material") { value }
          tColor: metafield(namespace: "taxonomy", key: "color_family") { value }
        }}
      }
    }`;
    const data = await gql(q);
    all.push(...data.products.edges.map(e => e.node));
    process.stderr.write(`\r  Fetched ${all.length} products (page ${page})...`);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  console.error(''); // newline after progress
  return all;
}

async function updateTags(productId, tags) {
  const q = `mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      userErrors { field message }
    }
  }`;
  const result = await gql(q, { input: { id: productId, tags } });
  if (result.productUpdate.userErrors.length) {
    console.error('  Error:', result.productUpdate.userErrors);
  }
  return result;
}

async function enrichWallcovering() {
  console.log('\n── Enriching Wallcovering products ──');
  const products = await fetchAllProducts('Wallcovering');
  console.log(`Found ${products.length} Wallcovering products`);

  let updated = 0;
  for (const p of products) {
    const existingTags = p.tags;
    const newTags = new Set(existingTags);
    let changed = false;

    // Material from fiber_content
    if (p.fiber?.value) {
      try {
        const raw = JSON.parse(p.fiber.value).raw;
        const matTag = mapWcMaterial(raw);
        if (matTag && !existingTags.includes(matTag)) {
          newTags.add(matTag);
          changed = true;
        }
      } catch {}
    }

    // Material from showroom.material
    if (p.sMaterial?.value) {
      try {
        const mats = JSON.parse(p.sMaterial.value);
        mats.forEach(m => {
          const matTag = mapWcMaterial(m);
          if (matTag && !existingTags.includes(matTag)) {
            newTags.add(matTag);
            changed = true;
          }
        });
      } catch {}
    }

    // Design from title + category_attributes
    let designAttr = '';
    if (p.attrs?.value) {
      try { designAttr = JSON.parse(p.attrs.value).design || ''; } catch {}
    }
    const designTag = mapWcDesign(p.title, designAttr);
    if (designTag && !existingTags.includes(designTag)) {
      newTags.add(designTag);
      changed = true;
    }

    // Color from taxonomy or showroom
    const colorVal = p.tColor?.value || p.sColor?.value;
    if (colorVal && !existingTags.some(t => t.startsWith('color-family:'))) {
      newTags.add('color-family:' + colorVal);
      changed = true;
    }

    if (changed) {
      const tagArr = [...newTags];
      const addedTags = tagArr.filter(t => !existingTags.includes(t));
      console.log(`  ${p.title.slice(0, 35)} + [${addedTags.join(', ')}]`);
      if (!DRY_RUN) {
        await updateTags(p.id, tagArr);
        if (updated % 50 === 0) process.stderr.write(`\r  Updated ${updated} products...`);
        await new Promise(ok => setTimeout(ok, 150));
      }
      updated++;
    }
  }
  console.error('');
  console.log(`Wallcovering: ${updated}/${products.length} products ${DRY_RUN ? 'would be' : ''} updated`);
}

async function enrichRugs() {
  console.log('\n── Enriching Rug products ──');
  const products = await fetchAllProducts('Rugs');
  console.log(`Found ${products.length} Rug products`);

  let updated = 0;
  for (const p of products) {
    const existingTags = p.tags;
    const newTags = new Set(existingTags);
    let changed = false;

    // Color from taxonomy or showroom
    const colorVal = p.tColor?.value || p.sColor?.value;
    if (colorVal && !existingTags.some(t => t.startsWith('color-family:'))) {
      newTags.add('color-family:' + colorVal);
      changed = true;
    }

    // Material from showroom.material
    if (p.sMaterial?.value) {
      try {
        const mats = JSON.parse(p.sMaterial.value);
        mats.forEach(m => {
          const tag = 'material:' + m;
          if (!existingTags.includes(tag)) {
            newTags.add(tag);
            changed = true;
          }
        });
      } catch {}
    }

    // Size from title pattern (e.g., "5X8", "8X10")
    const sizeMatch = p.title.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (sizeMatch) {
      const w = parseInt(sizeMatch[1]);
      const h = parseInt(sizeMatch[2]);
      const area = w * h;
      let sizeTag;
      if (area <= 24) sizeTag = 'size:Small';
      else if (area <= 54) sizeTag = 'size:Medium';
      else if (area <= 80) sizeTag = 'size:Large';
      else sizeTag = 'size:Oversize';
      if (!existingTags.includes(sizeTag)) {
        newTags.add(sizeTag);
        changed = true;
      }
    }

    // Width-based size from dimensions (for rugs sold by width like 6' wide)
    if (!sizeMatch && p.attrs?.value) {
      try {
        const attrs = JSON.parse(p.attrs.value);
        const widthStr = attrs.width;
        if (widthStr) {
          const wFt = parseFloat(widthStr);
          if (wFt > 0) {
            let sizeTag;
            if (wFt <= 4) sizeTag = 'size:Small';
            else if (wFt <= 6) sizeTag = 'size:Medium';
            else if (wFt <= 9) sizeTag = 'size:Large';
            else sizeTag = 'size:Oversize';
            if (!existingTags.includes(sizeTag)) {
              newTags.add(sizeTag);
              changed = true;
            }
          }
        }
      } catch {}
    }

    if (changed) {
      const tagArr = [...newTags];
      const addedTags = tagArr.filter(t => !existingTags.includes(t));
      console.log(`  ${p.title.slice(0, 35)} + [${addedTags.join(', ')}]`);
      if (!DRY_RUN) {
        await updateTags(p.id, tagArr);
        if (updated % 20 === 0) process.stderr.write(`\r  Updated ${updated} rug products...`);
        await new Promise(ok => setTimeout(ok, 150));
      }
      updated++;
    }
  }
  console.error('');
  console.log(`Rugs: ${updated}/${products.length} products ${DRY_RUN ? 'would be' : ''} updated`);
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE — writing tags'}`);
  await enrichWallcovering();
  await enrichRugs();
  console.log('\nDone!');
}

main().catch(console.error);
