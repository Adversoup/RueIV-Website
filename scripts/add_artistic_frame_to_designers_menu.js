#!/usr/bin/env node
/**
 * add_artistic_frame_to_designers_menu.js
 *
 * Idempotently inserts "Artistic Frame" into the Designers submenu of main-menu
 * (alphabetically after Arte). Prefers collection handle `artistic-frame`,
 * falls back to `artistic-frame-demo` if that is the only AF collection present.
 *
 * Requires: SHOPIFY_STORE + SHOPIFY_ADMIN_ACCESS_TOKEN
 *
 * Usage:
 *   node scripts/add_artistic_frame_to_designers_menu.js           # apply
 *   node scripts/add_artistic_frame_to_designers_menu.js --dry-run  # print plan only
 */
require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER = process.env.SHOPIFY_API_VERSION || '2025-01';
const GQL = `https://${STORE}/admin/api/${VER}/graphql.json`;
const DRY_RUN = process.argv.includes('--dry-run');

const TITLE = 'Artistic Frame';
const PREFERRED_HANDLE = 'artistic-frame';
const FALLBACK_HANDLE = 'artistic-frame-demo';

async function gql(query, variables = {}) {
  if (!STORE || !TOKEN) {
    throw new Error('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_ACCESS_TOKEN');
  }
  const r = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await r.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

function cloneItem(item) {
  const cloned = { title: item.title, type: item.type };
  if (item.resourceId) cloned.resourceId = item.resourceId;
  else if (item.url) cloned.url = item.url;
  if (item.items?.length) cloned.items = item.items.map(cloneItem);
  return cloned;
}

function insertAlphabetically(items, newItem) {
  const without = items.filter(
    (i) => i.title.toLowerCase() !== newItem.title.toLowerCase()
  );
  const pinned = [];
  const sortable = [];
  for (const item of without) {
    if (/^all\b/i.test(item.title) || /^view all\b/i.test(item.title)) {
      pinned.push(item);
    } else {
      sortable.push(item);
    }
  }
  sortable.push(newItem);
  sortable.sort((a, b) =>
    a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
  );
  return [...pinned, ...sortable];
}

async function resolveCollection(handles) {
  for (const handle of handles) {
    const data = await gql(`{
      collectionByHandle(handle: ${JSON.stringify(handle)}) {
        id
        handle
        title
      }
    }`);
    if (data.collectionByHandle) return data.collectionByHandle;
  }
  return null;
}

async function main() {
  console.log('═══ Add Artistic Frame → Designers menu ═══');
  console.log(DRY_RUN ? '(dry-run)\n' : '');

  const collection = await resolveCollection([PREFERRED_HANDLE, FALLBACK_HANDLE]);
  if (!collection) {
    throw new Error(
      `Neither "${PREFERRED_HANDLE}" nor "${FALLBACK_HANDLE}" collection found. Create the vendor collection first.`
    );
  }
  console.log(`Collection: ${collection.title} (${collection.handle})`);

  const { menus } = await gql(`{
    menus(first: 50) {
      nodes {
        id handle title
        items {
          title type url resourceId
          items {
            title type url resourceId
            items { title type url resourceId }
          }
        }
      }
    }
  }`);

  const mainMenu = menus.nodes.find((m) => m.handle === 'main-menu');
  if (!mainMenu) throw new Error('main-menu not found');

  const designers = mainMenu.items.find((i) => i.title === 'Designers');
  if (!designers) throw new Error('Designers item not found on main-menu');

  const existing = (designers.items || []).map((i) => i.title);
  if (existing.some((t) => t.toLowerCase() === TITLE.toLowerCase())) {
    console.log('✓ Artistic Frame already present in Designers submenu:');
    existing.forEach((t) => console.log(`  · ${t}`));
    return;
  }

  const afItem = {
    title: TITLE,
    type: 'COLLECTION',
    resourceId: collection.id,
  };

  const newChildren = insertAlphabetically(
    (designers.items || []).map(cloneItem),
    afItem
  );

  console.log('Designers children after insert:');
  newChildren.forEach((c) => console.log(`  · ${c.title}`));

  if (DRY_RUN) {
    console.log('\nDry-run only — no menuUpdate performed.');
    return;
  }

  const newItems = mainMenu.items.map((item) => {
    if (item.title !== 'Designers') return cloneItem(item);
    const parent = cloneItem(item);
    parent.items = newChildren;
    return parent;
  });

  const result = await gql(
    `mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu {
          items {
            title
            items { title type }
          }
        }
        userErrors { field message }
      }
    }`,
    { id: mainMenu.id, title: mainMenu.title, items: newItems }
  );

  const errs = result.menuUpdate?.userErrors;
  if (errs?.length) {
    throw new Error(JSON.stringify(errs, null, 2));
  }

  const updated = result.menuUpdate.menu.items.find((i) => i.title === 'Designers');
  console.log('\n✓ Designers menu updated:');
  (updated?.items || []).forEach((c) => console.log(`  · ${c.title} [${c.type}]`));
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
