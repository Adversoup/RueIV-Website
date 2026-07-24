#!/usr/bin/env node
/**
 * Audit the current state of the Shopify store:
 * - Active theme
 * - Existing menus
 * - Existing collections
 * - Existing metafield definitions
 */
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver   = process.env.SHOPIFY_API_VERSION;

const GQL = `https://${store}/admin/api/${ver}/graphql.json`;
const REST = `https://${store}/admin/api/${ver}`;

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) console.error('GQL errors:', JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function rest(path) {
  const res = await fetch(`${REST}${path}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  return res.json();
}

async function main() {
  // 1. Themes
  console.log('\n=== THEMES ===');
  const themes = await rest('/themes.json');
  themes.themes.forEach(t => {
    const marker = t.role === 'main' ? ' ◀ ACTIVE' : '';
    console.log(`  ${t.id} | ${t.name} | ${t.role}${marker}`);
  });

  // 2. Menus
  console.log('\n=== MENUS ===');
  const menuData = await gql(`{
    menus(first: 50) {
      edges { node { id title handle items { title url items { title url } } } }
    }
  }`);
  if (menuData && menuData.menus) {
    menuData.menus.edges.forEach(e => {
      const m = e.node;
      console.log(`  ${m.handle} | "${m.title}" | ${m.items.length} top items`);
      m.items.forEach(i => {
        console.log(`    - ${i.title} → ${i.url || '(no url)'}`);
        if (i.items && i.items.length) {
          i.items.forEach(sub => console.log(`      · ${sub.title} → ${sub.url || '(no url)'}`));
        }
      });
    });
  }

  // 3. Collections (smart + custom)
  console.log('\n=== COLLECTIONS ===');
  const collData = await rest('/custom_collections.json?limit=250');
  const smartData = await rest('/smart_collections.json?limit=250');
  const allCollections = [
    ...(collData.custom_collections || []).map(c => ({ ...c, type: 'custom' })),
    ...(smartData.smart_collections || []).map(c => ({ ...c, type: 'smart' }))
  ].sort((a, b) => a.title.localeCompare(b.title));
  console.log(`  Total: ${allCollections.length} collections`);
  allCollections.forEach(c => {
    console.log(`  ${c.type.padEnd(6)} | ${c.handle.padEnd(40)} | ${c.title}`);
  });

  // 4. Metafield definitions for products
  console.log('\n=== PRODUCT METAFIELD DEFINITIONS ===');
  const mfData = await gql(`{
    metafieldDefinitions(first: 100, ownerType: PRODUCT) {
      edges { node { namespace key name type { name } } }
    }
  }`);
  if (mfData && mfData.metafieldDefinitions) {
    mfData.metafieldDefinitions.edges.forEach(e => {
      const d = e.node;
      console.log(`  ${d.namespace}.${d.key} | ${d.name} | ${d.type.name}`);
    });
  }

  // 5. Check what main-menu is connected to
  console.log('\n=== HEADER MENU CONNECTION ===');
  const themeId = themes.themes.find(t => t.role === 'main').id;
  const settingsRes = await rest(`/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`);
  if (settingsRes.asset) {
    const settings = JSON.parse(settingsRes.asset.value);
    const current = settings.current || settings.presets && Object.values(settings.presets)[0];
    if (current && current.sections && current.sections.header) {
      console.log('  Header section settings:', JSON.stringify(current.sections.header.settings, null, 2));
    } else {
      console.log('  (header settings not found in settings_data)');
    }
  }
}

main().catch(console.error);
