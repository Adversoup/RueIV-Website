#!/usr/bin/env node
/**
 * define_metafields_v2.js
 * ───────────────────────
 * Registers the extended metafield definitions for the v2 filter-driven
 * navigation system. Adds new taxonomy fields for:
 *   - material_type, design, style, room, lead_time, application,
 *     color_family_group, size_group
 *
 * Skips definitions that already exist (existing: true in schema).
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   node scripts/define_metafields_v2.js
 *   node scripts/define_metafields_v2.js --dry-run
 */

require('dotenv').config();
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const DRY_RUN = process.argv.includes('--dry-run');

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'metafield_schema_v2.json'), 'utf8')
);

/* ── GraphQL helper ───────────────────────────────────── */
function gql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: STORE,
      path: `/admin/api/${VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (json.errors) reject(new Error(JSON.stringify(json.errors)));
          else resolve(json.data);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Fetch existing definitions ───────────────────────── */
async function fetchExisting() {
  const data = await gql(`{
    metafieldDefinitions(first: 250, ownerType: PRODUCT) {
      edges {
        node {
          id namespace key name type { name }
        }
      }
    }
  }`);
  const map = {};
  for (const { node } of data.metafieldDefinitions.edges) {
    map[`${node.namespace}.${node.key}`] = node;
  }
  return map;
}

/* ── Create a definition ──────────────────────────────── */
async function createDefinition(def) {
  const input = {
    namespace: def.namespace,
    key: def.key,
    name: def.name,
    description: def.description,
    type: def.type,
    ownerType: 'PRODUCT',
    pin: def.pin ?? false,
  };

  if (def.validations) {
    input.validations = def.validations;
  }

  const mutation = `
    mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id namespace key name }
        userErrors { field message code }
      }
    }
  `;

  const data = await gql(mutation, { definition: input });
  return data.metafieldDefinitionCreate;
}

/* ── Main ─────────────────────────────────────────────── */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  RueIV Metafield Definitions v2                        ║');
  console.log('║  Extended taxonomy for filter-driven navigation         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  if (DRY_RUN) console.log('⚠  DRY RUN mode — no mutations\n');

  console.log('→ Fetching existing metafield definitions…');
  const existing = await fetchExisting();
  console.log(`  Found ${Object.keys(existing).length} existing definitions\n`);

  const newDefs = schema.definitions.filter(d => !d.existing);
  const existingDefs = schema.definitions.filter(d => d.existing);

  console.log(`── Existing definitions (${existingDefs.length}) — skipping ──`);
  for (const def of existingDefs) {
    const key = `${def.namespace}.${def.key}`;
    const status = existing[key] ? '✓ exists' : '⚠ NOT FOUND';
    console.log(`  ${status}: ${key} (${def.name})`);
  }

  console.log(`\n── New definitions to create (${newDefs.length}) ──`);
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const def of newDefs) {
    const key = `${def.namespace}.${def.key}`;

    if (existing[key]) {
      console.log(`  ✓ Already exists: ${key}`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would create: ${key} (${def.type})`);
      skipped++;
      continue;
    }

    try {
      const result = await createDefinition(def);
      if (result.userErrors?.length) {
        const isTaken = result.userErrors.some(e => e.code === 'TAKEN');
        if (isTaken) {
          console.log(`  ✓ Already registered: ${key}`);
          skipped++;
        } else {
          console.log(`  ✗ Error creating ${key}:`, result.userErrors);
          failed++;
        }
      } else {
        console.log(`  ✓ Created: ${key} → ${result.createdDefinition.id}`);
        created++;
      }
    } catch (err) {
      console.log(`  ✗ Failed ${key}:`, err.message);
      failed++;
    }

    await sleep(300);
  }

  console.log('\n── Summary ──');
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${schema.definitions.length} definitions in schema`);

  console.log('\n── Tag Conventions ──');
  for (const tag of schema.tag_conventions) {
    console.log(`  ${tag.prefix}*  e.g. ${tag.example}  → ${tag.used_by}`);
  }

  console.log('\n✓ Metafield definitions v2 complete');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
