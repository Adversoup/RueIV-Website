require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE || 'ruefour.myshopify.com';
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API = '2026-04';
const gql = async (q) => {
  const r = await fetch(`https://${STORE}/admin/api/${API}/graphql.json`, {
    method:'POST',
    headers:{'Content-Type':'application/json','X-Shopify-Access-Token':TOKEN},
    body: JSON.stringify({query:q})
  });
  return r.json();
};
(async()=>{
  const pRes = await gql('{ pages(first:20) { edges { node { id title handle templateSuffix } } } }');
  console.log('=== PAGES ===');
  pRes.data.pages.edges.forEach(e => console.log(e.node.handle, '->', e.node.templateSuffix || '(default)', '|', e.node.title));

  // List all menus and their items
  const allMenus = await gql(`{
    menus(first: 10) {
      edges { node { id handle title items { title url type } } }
    }
  }`);
  console.log('\n=== ALL MENUS ===');
  if (allMenus.errors) {
    console.log('Errors:', JSON.stringify(allMenus.errors, null, 2).slice(0, 500));
  }
  if (allMenus.data && allMenus.data.menus) {
    for (const e of allMenus.data.menus.edges) {
      const m = e.node;
      console.log(`\n[${m.handle}] ${m.title} (${m.id})`);
      if (m.items) {
        m.items.forEach(i => console.log('  ', i.title, '->', i.url));
      }
    }
  } else {
    console.log('Raw:', JSON.stringify(allMenus, null, 2).slice(0, 800));
  }
})();
