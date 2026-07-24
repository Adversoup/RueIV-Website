require('dotenv').config();
const S = process.env.SHOPIFY_STORE;
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const V = process.env.SHOPIFY_API_VERSION;

async function run() {
  const query = `{
    collection(handle: "fabric") {
      title
      products(first: 1) {
        filters {
          id label type
          values { id label count }
        }
      }
    }
  }`;

  const res = await fetch(`https://${S}/admin/api/${V}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
    body: JSON.stringify({ query }),
  });
  const j = await res.json();
  const filters = j.data?.collection?.products?.filters || [];
  console.log(`Filters on Fabric collection: ${filters.length}\n`);
  filters.forEach(f => {
    console.log(`${f.label} (${f.type}, ${f.id})`);
    f.values.slice(0, 15).forEach(v => console.log(`  ${v.label} (${v.count})`));
    if (f.values.length > 15) console.log(`  ... +${f.values.length - 15} more`);
    console.log('');
  });
}
run().catch(console.error);
