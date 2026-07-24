#!/usr/bin/env node
/**
 * Introspect Modiva theme section schemas
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

async function main() {
  const sections = [
    'sections/collection-list.liquid',
    'sections/featured-collection.liquid',
    'sections/newsletter.liquid',
    'sections/image-with-text-overlay.liquid'
  ];
  
  for (const s of sections) {
    const content = await getAsset(s);
    if (!content) {
      console.log(`\n=== ${s} NOT FOUND ===`);
      continue;
    }
    
    // Extract schema
    const match = content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
    if (match) {
      try {
        const schema = JSON.parse(match[1]);
        console.log(`\n=== ${s} ===`);
        console.log(`Name: ${schema.name}`);
        if (schema.blocks) {
          schema.blocks.forEach(b => {
            console.log(`  Block type: "${b.type}" (${b.name || ''})`);
            if (b.settings) {
              b.settings.forEach(s => console.log(`    setting: ${s.id} (${s.type})`));
            }
          });
        }
        // Also show section settings names  
        if (schema.settings) {
          console.log('  Section settings:');
          schema.settings.forEach(s => {
            if (s.id) console.log(`    ${s.id} (${s.type})`);
          });
        }
      } catch (e) {
        console.log(`  Schema parse error: ${e.message}`);
      }
    }
  }
  
  // Also check current homepage for existing collection-list block types
  const idx = await getAsset('templates/index.json');
  if (idx) {
    const parsed = JSON.parse(idx);
    console.log('\n=== EXISTING HOMEPAGE collection-list block types ===');
    Object.entries(parsed.sections).forEach(([key, sec]) => {
      if (sec.blocks) {
        console.log(`Section "${key}" (${sec.type}):`);
        Object.entries(sec.blocks).forEach(([bk, bv]) => {
          console.log(`  Block "${bk}": type="${bv.type}", settings=${JSON.stringify(bv.settings)}`);
        });
      }
    });
  }
}

main().catch(console.error);
