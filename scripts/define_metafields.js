#!/usr/bin/env node
/**
 * scripts/define_metafields.js
 * ────────────────────────────
 * Registers all metafield definitions in Shopify for taxonomy, override, and brand
 * namespaces. Idempotent — safe to run multiple times.
 *
 * Usage:
 *   node scripts/define_metafields.js [--dry-run]
 */

'use strict';
require('dotenv').config();

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Definitions ──────────────────────────────────────────────────────────────

const DEFINITIONS = [
  // taxonomy namespace
  { namespace: 'taxonomy', key: 'color_family',           name: 'Color Family',            type: 'single_line_text_field', description: 'Controlled color family from internal taxonomy (e.g. Navy, Ivory, Terracotta)', pin: true },
  { namespace: 'taxonomy', key: 'color_family_secondary', name: 'Secondary Color Family',  type: 'single_line_text_field', description: 'Optional secondary color family for multi-tone products', pin: false },
  { namespace: 'taxonomy', key: 'color_raw',              name: 'Vendor Color (Raw)',       type: 'single_line_text_field', description: 'Original color string from vendor — preserved for reference', pin: false },
  { namespace: 'taxonomy', key: 'color_confidence',       name: 'Color Confidence',         type: 'number_decimal',         description: 'AI mapping confidence score 0.0–1.0', pin: false },
  { namespace: 'taxonomy', key: 'color_source',           name: 'Color Source',             type: 'single_line_text_field', description: 'How color was assigned: ai | manual | ai+override | dictionary', pin: false },
  { namespace: 'taxonomy', key: 'end_use',                name: 'End Use',                  type: 'list.single_line_text_field', description: 'Controlled end-use classifications (Upholstery, Drapery, etc.)', pin: true },
  { namespace: 'taxonomy', key: 'subcategory',            name: 'Subcategory',              type: 'single_line_text_field', description: 'Product subcategory (e.g. Dining Chair, Wall Light, Botanical)', pin: true },

  // override namespace — human curator controls
  { namespace: 'override', key: 'title',                  name: 'Title Override',            type: 'single_line_text_field', description: 'Manual title override — displays instead of product.title', pin: true },
  { namespace: 'override', key: 'hero_image',             name: 'Hero Image Override',       type: 'file_reference',         description: 'Manual hero image — displays instead of featured image', pin: true },
  { namespace: 'override', key: 'category',               name: 'Category Override',         type: 'single_line_text_field', description: 'Manual category override (fabric/wallpaper/furniture/lighting)', pin: true },
  { namespace: 'override', key: 'color_family',           name: 'Color Family Override',     type: 'single_line_text_field', description: 'Manual color family override — ALWAYS takes priority over AI', pin: true },
  { namespace: 'override', key: 'end_use',                name: 'End Use Override',          type: 'list.single_line_text_field', description: 'Manual end-use override', pin: true },
  { namespace: 'override', key: 'grid_weight',            name: 'Grid Weight',               type: 'number_integer',         description: '1=normal, 2=featured, 3=hero (controls grid prominence)', pin: true },

  // room namespace — room suitability flags (Furniture / Lighting / Rugs ONLY)
  { namespace: 'room', key: 'living_room',                name: 'Living Room',               type: 'boolean',                description: 'Suitable for living room. Fabric/Wallpaper/Trim excluded.', pin: false },
  { namespace: 'room', key: 'bedroom',                    name: 'Bedroom',                   type: 'boolean',                description: 'Suitable for bedroom. Fabric/Wallpaper/Trim excluded.', pin: false },
  { namespace: 'room', key: 'dining_room',                name: 'Dining Room',               type: 'boolean',                description: 'Suitable for dining room. Fabric/Wallpaper/Trim excluded.', pin: false },
  { namespace: 'room', key: 'office',                     name: 'Office',                    type: 'boolean',                description: 'Suitable for office. Fabric/Wallpaper/Trim excluded.', pin: false },
  { namespace: 'room', key: 'outdoor',                    name: 'Outdoor',                   type: 'boolean',                description: 'Suitable for outdoor. Fabric/Wallpaper/Trim excluded.', pin: false },
  { namespace: 'room', key: 'hospitality',                name: 'Hospitality',               type: 'boolean',                description: 'Suitable for hospitality. Fabric/Wallpaper/Trim excluded.', pin: false },

  // brand namespace
  { namespace: 'brand', key: 'story',                     name: 'Brand Story',               type: 'multi_line_text_field',  description: 'Brand story text for PDP brand block', pin: false },
  { namespace: 'brand', key: 'logo',                      name: 'Brand Logo',                type: 'file_reference',         description: 'Brand logo image for PDP and navigation', pin: false },
  { namespace: 'brand', key: 'tier',                      name: 'Brand Tier',                type: 'single_line_text_field', description: 'flagship | partner | emerging', pin: false },
];

// ─── GraphQL helpers ──────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(GQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query, variables }),
    });

    if (resp.status === 429) {
      await sleep(parseFloat(resp.headers.get('Retry-After') || '2') * 1000);
      continue;
    }

    const json = await resp.json();
    if (json.errors?.some(e => e.message?.includes('Throttled')) && attempt < 3) {
      await sleep(2000);
      continue;
    }
    return json;
  }
  throw new Error('Max retries exceeded');
}

// ─── Check existing definitions ──────────────────────────────────────────────

async function getExistingDefinitions() {
  const existing = new Set();
  let cursor = null;

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const result = await gql(`{
      metafieldDefinitions(
        ownerType: PRODUCT,
        first: 100${afterClause}
      ) {
        edges {
          cursor
          node { namespace key }
        }
        pageInfo { hasNextPage }
      }
    }`);

    const edges = result.data?.metafieldDefinitions?.edges || [];
    for (const e of edges) {
      existing.add(`${e.node.namespace}.${e.node.key}`);
      cursor = e.cursor;
    }
    if (!result.data?.metafieldDefinitions?.pageInfo?.hasNextPage) break;
  }

  return existing;
}

// ─── Create definition ───────────────────────────────────────────────────────

async function createDefinition(def) {
  const result = await gql(`
    mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id namespace key }
        userErrors { field message code }
      }
    }
  `, {
    definition: {
      namespace: def.namespace,
      key: def.key,
      name: def.name,
      type: def.type,
      description: def.description,
      ownerType: 'PRODUCT',
      pin: def.pin,
    },
  });

  const errors = result.data?.metafieldDefinitionCreate?.userErrors || [];
  if (errors.length > 0) {
    // TAKEN = already exists, which is fine
    if (errors.some(e => e.code === 'TAKEN' || e.message?.includes('already exists'))) {
      return { status: 'exists', id: null };
    }
    return { status: 'error', errors };
  }

  return {
    status: 'created',
    id: result.data?.metafieldDefinitionCreate?.createdDefinition?.id,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('─── Register Metafield Definitions ───');
  console.log(`Store: ${STORE}`);
  console.log(`Definitions to register: ${DEFINITIONS.length}`);
  if (dryRun) console.log('DRY RUN — no mutations');
  console.log('');

  // Check existing
  console.log('Checking existing definitions...');
  const existing = await getExistingDefinitions();
  console.log(`Found ${existing.size} existing definitions\n`);

  let created = 0, skipped = 0, failed = 0;

  for (const def of DEFINITIONS) {
    const fullKey = `${def.namespace}.${def.key}`;
    process.stdout.write(`  ${fullKey.padEnd(40)} `);

    if (existing.has(fullKey)) {
      console.log('SKIP (exists)');
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log('WOULD CREATE');
      created++;
      continue;
    }

    const result = await createDefinition(def);
    if (result.status === 'created') {
      console.log(`CREATED (${result.id})`);
      created++;
    } else if (result.status === 'exists') {
      console.log('SKIP (exists)');
      skipped++;
    } else {
      console.log(`ERROR: ${JSON.stringify(result.errors)}`);
      failed++;
    }

    await sleep(300); // gentle rate limiting
  }

  console.log('\n─── Summary ───');
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
