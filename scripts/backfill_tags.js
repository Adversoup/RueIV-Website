#!/usr/bin/env node
/**
 * scripts/backfill_tags.js
 * ────────────────────────
 * Applies color:* and end-use:* tags + writes taxonomy metafields on all products.
 * Uses dictionary-based color mapping from config/color_taxonomy.json.
 * Also maps end-use from fabric_attributes.csv.
 *
 * Usage: node scripts/backfill_tags.js [--dry-run]
 */
'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep   = ms => new Promise(r => setTimeout(r, ms));

// ─── Load configs ─────────────────────────────────────────────────────────────
const colorTax   = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config', 'color_taxonomy.json'), 'utf8'));
const endUseTax  = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config', 'end_use_taxonomy.json'), 'utf8'));
const subCatTax  = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config', 'subcategory_taxonomy.json'), 'utf8'));

// Build lookup structures
const KNOWN_MAPPINGS   = colorTax.known_mappings;     // raw → family name
const UNMAPPABLE       = new Set(colorTax.unmappable_flags.map(s => s.toLowerCase()));
const FAMILY_BY_NAME   = {};
for (const f of colorTax.families) {
  FAMILY_BY_NAME[f.name] = f;
}

// Build keyword → family index for fuzzy matching
const KEYWORD_TO_FAMILY = {};
for (const f of colorTax.families) {
  for (const kw of [...f.keywords, ...f.synonyms]) {
    KEYWORD_TO_FAMILY[kw.toLowerCase()] = f.name;
  }
}

// End-use mapping rules
const END_USE_RULES = endUseTax.mapping_rules;

// ─── GQL ──────────────────────────────────────────────────────────────────────
let pts = 1000, lastT = Date.now();
async function gql(query, variables = {}) {
  const now = Date.now(); pts = Math.min(1000, pts + (now - lastT) / 1000 * 50); lastT = now;
  if (pts < 100) { const w = Math.ceil((100 - pts) / 50) * 1000; await sleep(w); pts = Math.min(1000, pts + w / 1000 * 50); lastT = Date.now(); }
  for (let a = 1; a <= 3; a++) {
    const r = await fetch(GQL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN }, body: JSON.stringify({ query, variables }) });
    if (r.status === 429) { await sleep(parseFloat(r.headers.get('Retry-After') || '2') * 1000); continue; }
    const j = await r.json();
    if (j.extensions?.cost) pts = j.extensions.cost.throttleStatus?.currentlyAvailable ?? pts;
    if (j.errors?.some(e => e.message?.includes('Throttled')) && a < 3) { await sleep(2000); continue; }
    return j;
  }
  throw new Error('Max retries');
}

// ─── Color mapping ────────────────────────────────────────────────────────────
function mapColor(rawColor) {
  if (!rawColor || rawColor.trim().length === 0) return { family: null, confidence: 0, source: 'empty' };
  const raw = rawColor.trim();

  // Check unmappable
  if (UNMAPPABLE.has(raw.toLowerCase())) return { family: null, confidence: 0, source: 'unmappable' };

  // Stage 1: Exact known mapping
  if (KNOWN_MAPPINGS[raw]) {
    return { family: KNOWN_MAPPINGS[raw], confidence: 1.0, source: 'dictionary' };
  }

  // Stage 2: Keyword match (split raw into words, match against all keywords)
  const words = raw.toLowerCase().split(/[\s,\/\-\|&]+/).filter(w => w.length > 2);
  for (const word of words) {
    if (KEYWORD_TO_FAMILY[word]) {
      return { family: KEYWORD_TO_FAMILY[word], confidence: 0.8, source: 'keyword' };
    }
  }

  // Stage 3: Substring match — check if any keyword is contained in the raw string
  const rawLower = raw.toLowerCase();
  for (const [kw, family] of Object.entries(KEYWORD_TO_FAMILY)) {
    if (kw.length > 3 && rawLower.includes(kw)) {
      return { family, confidence: 0.7, source: 'substring' };
    }
  }

  // Stage 4: Numeric codes — can't map without AI
  if (/^\d+$/.test(raw.replace(/[\s,]/g, ''))) {
    return { family: null, confidence: 0, source: 'numeric_code' };
  }

  return { family: null, confidence: 0, source: 'unmatched' };
}

// ─── End-use mapping ──────────────────────────────────────────────────────────
function mapEndUse(usageString) {
  if (!usageString || usageString.trim().length === 0) return [];

  // Direct rule match
  const normalized = usageString.trim();
  if (END_USE_RULES[normalized]) return END_USE_RULES[normalized];

  // Try splitting by comma and matching parts
  const parts = normalized.split(',').map(s => s.trim());
  const result = new Set();
  for (const part of parts) {
    if (END_USE_RULES[part]) {
      END_USE_RULES[part].forEach(eu => result.add(eu));
    } else {
      // Check aliases
      for (const endUse of endUseTax.end_uses) {
        if (endUse.aliases.some(a => a.toLowerCase() === part.toLowerCase())) {
          result.add(endUse.name);
        }
      }
    }
  }
  return [...result];
}

// ─── Subcategory mapping ──────────────────────────────────────────────────────
function mapSubcategory(title, productType) {
  const cat = (productType || '').toLowerCase();
  const types = subCatTax[cat];
  if (!types) return null;

  const titleLower = title.toLowerCase();
  for (const t of types) {
    for (const kw of t.keywords) {
      if (titleLower.includes(kw.toLowerCase())) return t.name;
    }
  }
  return null;
}

// ─── Load CSV data ────────────────────────────────────────────────────────────
function loadFabricAttrs() {
  const p1 = path.resolve(__dirname, '..', 'mnt', 'data', 'fabric_attributes.csv');
  const p2 = path.resolve(__dirname, '..', 'data', 'fabric_attributes.csv');
  const p = fs.existsSync(p1) ? p1 : p2;
  return parse(fs.readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true });
}

function loadCoreProducts() {
  const p1 = path.resolve(__dirname, '..', 'mnt', 'data', 'core_products.csv');
  const p2 = path.resolve(__dirname, '..', 'data', 'core_products.csv');
  const p = fs.existsSync(p1) ? p1 : p2;
  return parse(fs.readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true });
}

// ─── Fetch all products ───────────────────────────────────────────────────────
async function fetchAll() {
  const products = [];
  let cursor = null;
  while (true) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      products(first: 50${after}) {
        edges { cursor node { id handle title productType tags
          metafields(first: 10, keys: ["specs.color", "specs.usage", "taxonomy.color_family", "override.color_family"]) {
            edges { node { namespace key value } }
          }
        }}
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of result.data.products.edges) {
      const mf = {};
      for (const m of e.node.metafields.edges) mf[`${m.node.namespace}.${m.node.key}`] = m.node.value;
      products.push({
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        productType: e.node.productType,
        tags: e.node.tags || [],
        rawColor: mf['specs.color'] || '',
        usage: mf['specs.usage'] || '',
        existingColorFamily: mf['taxonomy.color_family'] || '',
        overrideColor: mf['override.color_family'] || '',
      });
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
    await sleep(200);
  }
  return products;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('─── Backfill Tags & Taxonomy ───');
  if (dryRun) console.log('DRY RUN');

  // Load CSV data for end-use
  const fabricRows = loadFabricAttrs();
  const coreRows = loadCoreProducts();
  const skuToUsage = {};
  for (const row of fabricRows) skuToUsage[row.sku?.trim()] = row.usage?.trim() || '';
  const skuToColor = {};
  const nameToSku = {};
  for (const row of coreRows) {
    skuToColor[row.sku?.trim()] = row.color?.trim() || '';
    nameToSku[row.name?.trim().toLowerCase()] = row.sku?.trim();
  }

  // Fetch all products
  const products = await fetchAll();
  console.log(`Found ${products.length} products\n`);

  let colorMapped = 0, colorSkipped = 0, colorFailed = 0;
  let endUseMapped = 0;
  const report = [];

  for (const p of products) {
    const sku = nameToSku[p.title.toLowerCase()] || '';
    const rawColor = p.rawColor || skuToColor[sku] || '';
    const usage = p.usage || skuToUsage[sku] || '';

    // ── Color mapping ──
    let colorFamily = null;
    let colorConfidence = 0;
    let colorSource = '';

    if (p.overrideColor) {
      colorFamily = p.overrideColor;
      colorConfidence = 1.0;
      colorSource = 'manual';
    } else {
      const result = mapColor(rawColor);
      colorFamily = result.family;
      colorConfidence = result.confidence;
      colorSource = result.source;
    }

    // ── End-use mapping ──
    const endUses = mapEndUse(usage);

    // ── Subcategory ──
    const subcategory = mapSubcategory(p.title, p.productType);

    // ── Build tags ──
    const newTags = [...p.tags];
    // Remove old color/end-use tags
    const cleanTags = newTags.filter(t => !t.startsWith('color:') && !t.startsWith('end-use:') && !t.startsWith('subcategory:'));

    if (colorFamily) {
      const slug = colorFamily.toLowerCase().replace(/\s+/g, '-');
      cleanTags.push(`color:${slug}`);
    }
    for (const eu of endUses) {
      cleanTags.push(`end-use:${eu.toLowerCase().replace(/\s+/g, '-')}`);
    }
    if (subcategory) {
      cleanTags.push(`subcategory:${subcategory.toLowerCase().replace(/\s+/g, '-')}`);
    }

    // ── Build metafields ──
    const metafields = [];
    if (rawColor) {
      metafields.push({ ownerId: p.id, namespace: 'taxonomy', key: 'color_raw', value: rawColor, type: 'single_line_text_field' });
    }
    if (colorFamily) {
      metafields.push({ ownerId: p.id, namespace: 'taxonomy', key: 'color_family', value: colorFamily, type: 'single_line_text_field' });
    }
    metafields.push({ ownerId: p.id, namespace: 'taxonomy', key: 'color_confidence', value: String(colorConfidence), type: 'number_decimal' });
    metafields.push({ ownerId: p.id, namespace: 'taxonomy', key: 'color_source', value: colorSource, type: 'single_line_text_field' });
    if (endUses.length > 0) {
      metafields.push({ ownerId: p.id, namespace: 'taxonomy', key: 'end_use', value: JSON.stringify(endUses), type: 'list.single_line_text_field' });
    }
    if (subcategory) {
      metafields.push({ ownerId: p.id, namespace: 'taxonomy', key: 'subcategory', value: subcategory, type: 'single_line_text_field' });
    }

    const tagStr = cleanTags.join(', ');
    const tagsChanged = JSON.stringify(cleanTags.sort()) !== JSON.stringify([...p.tags].sort());

    report.push({
      title: p.title,
      productType: p.productType,
      rawColor,
      colorFamily: colorFamily || '—',
      confidence: colorConfidence,
      source: colorSource,
      endUses: endUses.join(', ') || '—',
      subcategory: subcategory || '—',
    });

    if (dryRun) {
      console.log(`  ${p.title.padEnd(40)} → color:${(colorFamily||'?').padEnd(12)} (${colorConfidence.toFixed(1)}) | end-use:${endUses.join(',')||'—'} | subcat:${subcategory||'—'}`);
      if (colorFamily) colorMapped++;
      else colorFailed++;
      continue;
    }

    try {
      // Update tags
      if (tagsChanged) {
        await gql(`mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) { product { id } userErrors { message } }
        }`, { input: { id: p.id, tags: cleanTags } });
      }

      // Write metafields
      if (metafields.length > 0) {
        await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { metafields { id } userErrors { message } }
        }`, { metafields });
      }

      const colorSlug = colorFamily ? colorFamily.toLowerCase().replace(/\s+/g, '-') : '?';
      console.log(`  ${p.title.padEnd(40)} → color:${colorSlug.padEnd(12)} (${colorConfidence.toFixed(1)}) | eu:${endUses.join(',')||'—'}`);
      
      if (colorFamily) colorMapped++;
      else colorFailed++;
      if (endUses.length > 0) endUseMapped++;

      await sleep(300);
    } catch (err) {
      console.error(`  ERR ${p.title}: ${err.message}`);
      colorFailed++;
    }
  }

  console.log('\n─── Summary ───');
  console.log(`Color mapped:  ${colorMapped}`);
  console.log(`Color failed:  ${colorFailed} (need AI or manual)`);
  console.log(`End-use set:   ${endUseMapped}`);

  // Write report
  const reportDir = path.resolve(__dirname, '..', 'out', 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  
  const csvLines = ['title,productType,rawColor,colorFamily,confidence,source,endUses,subcategory'];
  for (const r of report) {
    csvLines.push(`"${r.title}","${r.productType}","${r.rawColor}","${r.colorFamily}",${r.confidence},"${r.source}","${r.endUses}","${r.subcategory}"`);
  }
  fs.writeFileSync(path.join(reportDir, 'taxonomy_mapping.csv'), csvLines.join('\n'), 'utf8');
  console.log(`\nReport: out/reports/taxonomy_mapping.csv`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
