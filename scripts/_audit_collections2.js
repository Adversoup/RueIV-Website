require('dotenv').config();
const https = require('https');
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER = process.env.SHOPIFY_API_VERSION;

function gql(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: STORE,
      path: `/admin/api/${VER}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errors) { console.error('GQL errors:', JSON.stringify(json.errors)); reject(new Error('GQL')); return; }
          resolve(json.data);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end(body);
  });
}

async function main() {
  // 1. Check category tag distribution
  console.log('━━━ CATEGORY TAG DISTRIBUTION ━━━');
  const tags = ['category:furniture', 'category:lighting', 'category:textiles', 'category:fabric',
                'category:wallcovering', 'category:wallpaper', 'category:rugs', 'category:accessories'];
  
  for (const tag of tags) {
    const data = await gql(`{ productsCount(query: "tag:'${tag}'") { count } }`);
    console.log(`  ${tag.padEnd(30)} → ${data.productsCount.count} products`);
  }

  // 2. Check products that are in furniture but shouldn't be (lighting products)
  console.log('\n━━━ PRODUCTS TAGGED furniture BUT LOOK LIKE LIGHTING ━━━');
  const lightingInFurniture = await gql(`{
    products(first: 20, query: "tag:'category:furniture' AND (title:lamp OR title:light OR title:chandelier OR title:pendant OR title:sconce)") {
      edges {
        node {
          title vendor productType
          tags
        }
      }
    }
  }`);
  
  for (const e of lightingInFurniture.products.edges) {
    const p = e.node;
    const catTags = p.tags.filter(t => t.startsWith('category:'));
    console.log(`  ${p.title.substring(0, 45).padEnd(47)} vendor=${p.vendor.padEnd(15)} tags=[${catTags.join(', ')}]`);
  }

  // 3. Check how many products have MULTIPLE category tags
  console.log('\n━━━ MULTI-CATEGORY TAGGED PRODUCTS (sample) ━━━');
  const multi = await gql(`{
    products(first: 50, query: "tag:'category:furniture'") {
      edges {
        node {
          title vendor
          tags
        }
      }
    }
  }`);
  
  let multiCount = 0;
  for (const e of multi.products.edges) {
    const catTags = e.node.tags.filter(t => t.startsWith('category:'));
    if (catTags.length > 1) {
      multiCount++;
      console.log(`  ${e.node.title.substring(0, 40).padEnd(42)} → [${catTags.join(', ')}]`);
    }
  }
  console.log(`  Found ${multiCount} multi-category products in sample of 50`);

  // 4. What tags do Porta Romana products actually have?
  console.log('\n━━━ PORTA ROMANA PRODUCTS — TAG ANALYSIS ━━━');
  const pr = await gql(`{
    products(first: 20, query: "vendor:'Porta Romana'") {
      edges {
        node {
          title productType
          tags
        }
      }
    }
  }`);
  
  for (const e of pr.products.edges) {
    const catTags = e.node.tags.filter(t => t.startsWith('category:'));
    console.log(`  ${e.node.title.substring(0, 40).padEnd(42)} type=${(e.node.productType || 'none').padEnd(15)} cats=[${catTags.join(', ')}]`);
  }

  // 5. Total product count vs sum of category tags
  console.log('\n━━━ TOTAL PRODUCTS vs CATEGORY COVERAGE ━━━');
  const total = await gql(`{ productsCount { count } }`);
  const noCategory = await gql(`{
    productsCount(query: "NOT tag:'category:furniture' AND NOT tag:'category:lighting' AND NOT tag:'category:textiles' AND NOT tag:'category:fabric' AND NOT tag:'category:wallcovering' AND NOT tag:'category:rugs' AND NOT tag:'category:accessories'") { count }
  }`);
  console.log(`  Total products: ${total.productsCount.count}`);
  console.log(`  Without any category tag: ${noCategory.productsCount.count}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
