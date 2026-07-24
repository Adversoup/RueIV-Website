require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE || 'ruefour.myshopify.com';
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

(async () => {
  // Try custom collections first
  const r = await fetch(`https://${STORE}/admin/api/2024-01/custom_collections.json?handle=designers`, {
    headers: { 'X-Shopify-Access-Token': TOKEN }
  });
  const data = await r.json();
  
  if (data.custom_collections && data.custom_collections.length) {
    const id = data.custom_collections[0].id;
    console.log('Found custom_collection:', id);
    const r3 = await fetch(`https://${STORE}/admin/api/2024-01/custom_collections/${id}.json`, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_collection: { id, template_suffix: 'designers' } })
    });
    const d3 = await r3.json();
    console.log('Updated:', d3.custom_collection?.template_suffix);
    return;
  }

  // Try smart collections
  const r2 = await fetch(`https://${STORE}/admin/api/2024-01/smart_collections.json?handle=designers`, {
    headers: { 'X-Shopify-Access-Token': TOKEN }
  });
  const data2 = await r2.json();
  
  if (data2.smart_collections && data2.smart_collections.length) {
    const id = data2.smart_collections[0].id;
    console.log('Found smart_collection:', id);
    const r3 = await fetch(`https://${STORE}/admin/api/2024-01/smart_collections/${id}.json`, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ smart_collection: { id, template_suffix: 'designers' } })
    });
    const d3 = await r3.json();
    console.log('Updated:', d3.smart_collection?.template_suffix);
    return;
  }

  console.log('No designers collection found');
})();
