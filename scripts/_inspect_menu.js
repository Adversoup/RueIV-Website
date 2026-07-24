require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER = process.env.SHOPIFY_API_VERSION;

async function main() {
  const r = await fetch(`https://${STORE}/admin/api/${VER}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query: `{
      menus(first: 10) {
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
    }` })
  });
  const data = await r.json();
  const menu = data.data.menus.nodes.find(m => m.handle === 'main-menu');
  if (!menu) { console.log('No main-menu found'); return; }
  console.log(`Main menu: ${menu.id} — ${menu.items.length} top-level items\n`);
  for (const item of menu.items) {
    console.log(`L1: ${item.title}  [${item.type}]  url=${item.url || ''} rid=${item.resourceId || ''}`);
    for (const c of (item.items || [])) {
      console.log(`  L2: ${c.title}  [${c.type}]  url=${c.url || ''} rid=${c.resourceId || ''}`);
      for (const d of (c.items || [])) {
        console.log(`    L3: ${d.title}  [${d.type}]  url=${d.url || ''} rid=${d.resourceId || ''}`);
      }
    }
  }
}
main();
