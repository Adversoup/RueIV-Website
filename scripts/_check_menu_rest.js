require('dotenv').config();
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const S = process.env.SHOPIFY_STORE;
const V = process.env.SHOPIFY_API_VERSION;

async function run() {
  // Use REST to fetch menus (no navigation scope needed for REST)
  const url = `https://${S}/admin/api/${V}`;
  
  // Try REST menus.json first
  let res = await fetch(`${url}/menus.json`, {
    headers: { 'X-Shopify-Access-Token': T }
  });
  console.log('REST menus.json status:', res.status);
  
  if (res.status === 200) {
    const data = await res.json();
    console.log('Found', data.menus.length, 'menus:');
    for (const m of data.menus) {
      console.log(`\n  Menu: "${m.title}" (handle: ${m.handle}, id: ${m.id})`);
      for (const link of (m.links || [])) {
        console.log(`    - ${link.title} → ${link.url || link.subject_type}`);
        for (const child of (link.links || [])) {
          console.log(`      - ${child.title} → ${child.url || child.subject_type}`);
          for (const gc of (child.links || [])) {
            console.log(`        - ${gc.title} → ${gc.url || gc.subject_type}`);
          }
        }
      }
    }
  } else {
    console.log('REST menus not accessible, trying storefront...');
    const text = await res.text();
    console.log('Response:', text.slice(0, 300));
  }
}
run().catch(console.error);
