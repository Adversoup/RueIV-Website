#!/usr/bin/env node
/**
 * scripts/pin_override_metafields.js
 * ───────────────────────────────────
 * Registers override.* metafield definitions with pinned visibility
 * so they appear in the Shopify admin product editor.
 *
 * Also registers brand.* metafield definitions.
 *
 * Usage:
 *   node scripts/pin_override_metafields.js [--dry-run]
 */
require('dotenv').config();

const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const STORE   = process.env.SHOPIFY_STORE;
const API_VER = process.env.SHOPIFY_API_VERSION;
const DRY_RUN = process.argv.includes('--dry-run');

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VER}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const OVERRIDE_DEFINITIONS = [
  {
    namespace: 'override',
    key: 'title',
    name: 'Override: Display Title',
    description: 'If set, used instead of the product title on storefront',
    type: 'single_line_text_field',
    pin: true
  },
  {
    namespace: 'override',
    key: 'color_family',
    name: 'Override: Color Family',
    description: 'Overrides AI-assigned color family (absolute priority). Must match a taxonomy color name.',
    type: 'single_line_text_field',
    pin: true
  },
  {
    namespace: 'override',
    key: 'category',
    name: 'Override: Category',
    description: 'Overrides product_type for collection membership',
    type: 'single_line_text_field',
    pin: true
  },
  {
    namespace: 'override',
    key: 'end_use',
    name: 'Override: End Use',
    description: 'Overrides derived end-use tags (comma-separated)',
    type: 'single_line_text_field',
    pin: true
  },
  {
    namespace: 'override',
    key: 'grid_weight',
    name: 'Override: Grid Weight',
    description: '1=normal, 2=featured, 3=hero (2× width on collection grid)',
    type: 'number_integer',
    pin: true
  },
  {
    namespace: 'override',
    key: 'hero_image',
    name: 'Override: Hero Image URL',
    description: 'If set, used as the primary display image instead of product media',
    type: 'single_line_text_field',
    pin: true
  }
];

const BRAND_DEFINITIONS = [
  {
    namespace: 'brand',
    key: 'story',
    name: 'Brand Story',
    description: 'Vendor brand story text shown on PDP',
    type: 'multi_line_text_field',
    pin: true
  },
  {
    namespace: 'brand',
    key: 'logo',
    name: 'Brand Logo',
    description: 'Vendor logo image (file reference)',
    type: 'single_line_text_field',
    pin: false
  },
  {
    namespace: 'brand',
    key: 'tier',
    name: 'Brand Tier',
    description: 'Brand tier: flagship, partner, emerging',
    type: 'single_line_text_field',
    pin: false
  }
];

const ALL_DEFINITIONS = [...OVERRIDE_DEFINITIONS, ...BRAND_DEFINITIONS];

const CREATE_MUTATION = `
mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition {
      id
      namespace
      key
      name
      pinnedPosition
    }
    userErrors {
      field
      message
    }
  }
}`;

const PIN_MUTATION = `
mutation PinMetafieldDefinition($definitionId: ID!) {
  metafieldDefinitionPin(definitionId: $definitionId) {
    pinnedDefinition {
      id
      pinnedPosition
    }
    userErrors {
      field
      message
    }
  }
}`;

const LIST_QUERY = `
query ListDefinitions($ownerType: MetafieldOwnerType!) {
  metafieldDefinitions(first: 100, ownerType: $ownerType) {
    edges {
      node {
        id
        namespace
        key
        name
        pinnedPosition
      }
    }
  }
}`;

async function run() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Pinning override & brand metafield definitions...\n`);

  // Get existing definitions
  const existing = await gql(LIST_QUERY, { ownerType: 'PRODUCT' });
  const existingMap = {};
  for (const edge of existing.metafieldDefinitions.edges) {
    const ns = edge.node.namespace || '';
    existingMap[`${ns}.${edge.node.key}`] = edge.node;
  }

  let created = 0, pinned = 0, skipped = 0;

  for (const def of ALL_DEFINITIONS) {
    const fullKey = `${def.namespace}.${def.key}`;
    const existingDef = existingMap[fullKey];

    if (existingDef) {
      console.log(`  EXISTS: ${fullKey} (${existingDef.name})`);

      // Pin if needed
      if (def.pin && !existingDef.pinnedPosition) {
        if (DRY_RUN) {
          console.log(`    → Would PIN ${fullKey}`);
        } else {
          const pinResult = await gql(PIN_MUTATION, { definitionId: existingDef.id });
          if (pinResult.metafieldDefinitionPin.userErrors.length > 0) {
            console.log(`    ⚠ Pin error: ${pinResult.metafieldDefinitionPin.userErrors.map(e => e.message).join(', ')}`);
          } else {
            console.log(`    ✓ Pinned at position ${pinResult.metafieldDefinitionPin.pinnedDefinition?.pinnedPosition}`);
            pinned++;
          }
        }
      } else if (existingDef.pinnedPosition) {
        console.log(`    Already pinned (pos ${existingDef.pinnedPosition})`);
      }
      skipped++;
      continue;
    }

    // Create new definition
    const input = {
      namespace: def.namespace,
      key: def.key,
      name: def.name,
      description: def.description,
      type: def.type,
      ownerType: 'PRODUCT',
      pin: def.pin
    };

    if (DRY_RUN) {
      console.log(`  CREATE: ${fullKey} (${def.name})${def.pin ? ' [PINNED]' : ''}`);
      created++;
      continue;
    }

    try {
      const result = await gql(CREATE_MUTATION, { definition: input });
      const errors = result.metafieldDefinitionCreate.userErrors;
      if (errors.length > 0) {
        console.log(`  ⚠ ${fullKey}: ${errors.map(e => e.message).join(', ')}`);
      } else {
        const d = result.metafieldDefinitionCreate.createdDefinition;
        console.log(`  ✓ Created: ${fullKey} (pinned: ${d.pinnedPosition || 'no'})`);
        created++;
      }
    } catch (err) {
      console.log(`  ✗ ${fullKey}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${created} created, ${pinned} pinned, ${skipped} already existed`);
}

run().catch(console.error);
