require('dotenv').config();
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const S = process.env.SHOPIFY_STORE;
const V = process.env.SHOPIFY_API_VERSION;

async function run() {
  const r = await fetch(`https://${S}/admin/api/${V}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
    body: JSON.stringify({ query: `{
      menu(handle: "main-menu") {
        id title handle
        items { title url type items { title url type items { title url } } }
      }
    }` })
  });
  const j = await r.json();
  if (j.errors) { console.log('Errors:', JSON.stringify(j.errors)); return; }
  const menu = j.data.menu;
  if (!menu) { console.log('No main-menu found'); return; }
  console.log('main-menu:', menu.title);
  for (const item of menu.items) {
    const ch = item.items ? item.items.length : 0;
    console.log('  ' + item.title + (ch > 0 ? ' -> ' + ch + ' children' : ''));
    if (item.items) {
      for (const c of item.items) {
        const gc = c.items ? c.items.length : 0;
        console.log('    ' + c.title + (gc > 0 ? ' -> ' + gc + ' grandchildren' : ''));
      }
    }
  }
}
run().catch(console.error);
