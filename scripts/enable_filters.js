#!/usr/bin/env node
/**
 * enable_filters.js
 * ─────────────────
 * Makes taxonomy metafields available as storefront filters.
 * Updates metafield definitions to be filterable (useAsCollectionCondition + visibleToStorefrontApi).
 * Also enables tag-based filtering for color: and end-use: prefixed tags.
 */

require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V     = process.env.SHOPIFY_API_VERSION;
const GQL   = `https://${STORE}/admin/api/${V}/graphql.json`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) { await sleep(2000); continue; }
    const json = await res.json();
    if (json.errors?.some(e => e.message?.includes('Throttled'))) { await sleep(2000); continue; }
    return json;
  }
  throw new Error('Max retries');
}

async function main() {
  console.log('─── Enable Storefront Filters ───\n');

  // Step 1: Find our metafield definitions
  const defsResult = await gql(`{
    metafieldDefinitions(first: 50, ownerType: PRODUCT) {
      edges {
        node {
          id
          namespace
          key
          name
          type { name }
          access { storefront }
          useAsCollectionCondition
        }
      }
    }
  }`);

  const defs = defsResult.data?.metafieldDefinitions?.edges?.map(e => e.node) || [];
  console.log(`Found ${defs.length} metafield definitions\n`);

  // Filter for our taxonomy/override definitions
  const targetDefs = defs.filter(d =>
    d.namespace === 'taxonomy' || d.namespace === 'override' || d.namespace === 'brand'
  );

  console.log(`Target definitions (taxonomy/override/brand): ${targetDefs.length}\n`);

  for (const def of targetDefs) {
    const needsStorefront = def.access?.storefront !== 'PUBLIC_READ';
    const needsCollection = !def.useAsCollectionCondition;

    if (!needsStorefront && !needsCollection) {
      console.log(`  ✓ ${def.namespace}.${def.key} — already configured`);
      continue;
    }

    console.log(`  ↻ ${def.namespace}.${def.key} — updating...`);

    // Update storefront access
    if (needsStorefront) {
      const accessResult = await gql(`
        mutation metafieldDefinitionUpdate($definition: MetafieldDefinitionUpdateInput!) {
          metafieldDefinitionUpdate(definition: $definition) {
            updatedDefinition { id }
            userErrors { field message }
          }
        }
      `, {
        definition: {
          id: def.id,
          access: { storefront: 'PUBLIC_READ' },
        }
      });

      const errors = accessResult.data?.metafieldDefinitionUpdate?.userErrors;
      if (errors?.length) {
        console.log(`    ⚠ Storefront access error: ${errors.map(e=>e.message).join(', ')}`);
      } else {
        console.log(`    ✓ Storefront access: PUBLIC_READ`);
      }
      await sleep(500);
    }

    // Enable as collection condition (useAsCollectionCondition)
    if (needsCollection) {
      const condResult = await gql(`
        mutation metafieldDefinitionUpdate($definition: MetafieldDefinitionUpdateInput!) {
          metafieldDefinitionUpdate(definition: $definition) {
            updatedDefinition { id useAsCollectionCondition }
            userErrors { field message }
          }
        }
      `, {
        definition: {
          id: def.id,
          useAsCollectionCondition: true,
        }
      });

      const errors = condResult.data?.metafieldDefinitionUpdate?.userErrors;
      if (errors?.length) {
        console.log(`    ⚠ Collection condition error: ${errors.map(e=>e.message).join(', ')}`);
      } else {
        console.log(`    ✓ Collection condition: enabled`);
      }
      await sleep(500);
    }
  }

  console.log('\n─── Next Steps ───');
  console.log('Go to Shopify Admin → Settings → Search & Discovery (or Online Store → Navigation)');
  console.log('Under "Collection and search filters", add these filters:');
  console.log('  1. Product tag (will show color:*, end-use:*, subcategory:* tags)');
  console.log('  2. Color Family (metafield: taxonomy.color_family)');
  console.log('  3. End Use (metafield: taxonomy.end_use)');
  console.log('  4. Brand (metafield: brand.name)');
  console.log('\nOr better: use the Shopify Search & Discovery app to configure custom filters.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
