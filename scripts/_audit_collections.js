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
  // 1. Check if "fabric" collection exists
  console.log('━━━ CHECKING "fabric" COLLECTION ━━━');
  const fabricData = await gql(`{
    collectionByHandle(handle: "fabric") {
      id title handle productsCount { count }
      ruleSet { appliedDisjunctively rules { column relation condition } }
      resourcePublicationsV2(first: 5) {
        edges { node { publication { name } isPublished } }
      }
    }
  }`);
  
  if (!fabricData.collectionByHandle) {
    console.log('  ⚠ Collection "fabric" DOES NOT EXIST!');
    
    // Check for similar handles
    const similar = await gql(`{
      collections(first: 20, query: "title:fabric OR title:textile") {
        edges { node { handle title productsCount { count } } }
      }
    }`);
    console.log('\n  Similar collections:');
    for (const e of similar.collections.edges) {
      console.log(`    ${e.node.handle} — "${e.node.title}" (${e.node.productsCount.count} products)`);
    }
  } else {
    const c = fabricData.collectionByHandle;
    console.log(`  Found: ${c.handle} — "${c.title}" (${c.productsCount.count} products)`);
    console.log(`  Rules:`, JSON.stringify(c.ruleSet, null, 2));
    const pubs = c.resourcePublicationsV2?.edges || [];
    for (const p of pubs) console.log(`  Channel: ${p.node.publication.name} — published: ${p.node.isPublished}`);
  }

  // 2. Check "furniture" collection rules & sample products
  console.log('\n━━━ CHECKING "furniture" COLLECTION ━━━');
  const furnitureData = await gql(`{
    collectionByHandle(handle: "furniture") {
      id title handle productsCount { count }
      ruleSet { appliedDisjunctively rules { column relation condition } }
    }
  }`);

  if (!furnitureData.collectionByHandle) {
    console.log('  ⚠ Collection "furniture" DOES NOT EXIST!');
  } else {
    const c = furnitureData.collectionByHandle;
    console.log(`  Found: ${c.handle} — "${c.title}" (${c.productsCount.count} products)`);
    console.log(`  Rules:`, JSON.stringify(c.ruleSet, null, 2));
    
    // Sample products to see what's actually in there
    const products = await gql(`{
      collectionByHandle(handle: "furniture") {
        products(first: 20) {
          edges {
            node {
              title vendor productType
              tags
            }
          }
        }
      }
    }`);
    
    console.log('\n  Sample products in furniture collection:');
    const typeCounts = {};
    const vendorCounts = {};
    for (const e of products.collectionByHandle.products.edges) {
      const p = e.node;
      typeCounts[p.productType || '(no type)'] = (typeCounts[p.productType || '(no type)'] || 0) + 1;
      vendorCounts[p.vendor] = (vendorCounts[p.vendor] || 0) + 1;
      console.log(`    ${p.title.substring(0, 40).padEnd(42)} vendor=${p.vendor.padEnd(15)} type=${p.productType || '(none)'}`);
    }
  }

  // 3. Check key collections status
  console.log('\n━━━ KEY COLLECTION STATUS ━━━');
  const handles = ['fabric', 'textiles', 'wallpaper', 'wallcovering', 'lighting', 'furniture', 'rugs', 'accessories'];
  for (const h of handles) {
    const data = await gql(`{
      collectionByHandle(handle: "${h}") {
        id title handle productsCount { count }
        ruleSet { appliedDisjunctively rules { column relation condition } }
      }
    }`);
    if (data.collectionByHandle) {
      const c = data.collectionByHandle;
      const rules = c.ruleSet?.rules?.map(r => `${r.column} ${r.relation} "${r.condition}"`).join(', ') || 'manual/no rules';
      console.log(`  ✓ ${h.padEnd(15)} → "${c.title}" — ${c.productsCount.count} products — rules: ${rules}`);
    } else {
      console.log(`  ✗ ${h.padEnd(15)} → DOES NOT EXIST`);
    }
  }

  // 4. Check product_type distribution
  console.log('\n━━━ PRODUCT TYPE DISTRIBUTION (sample) ━━━');
  const types = await gql(`{
    p1: products(first: 100, query: "product_type:Fabric") { edges { node { id } } }
    p2: products(first: 100, query: "product_type:Furniture") { edges { node { id } } }
    p3: products(first: 100, query: "product_type:Lighting") { edges { node { id } } }
    p4: products(first: 100, query: "product_type:Wallpaper") { edges { node { id } } }
    p5: products(first: 100, query: "product_type:Textile") { edges { node { id } } }
    p6: products(first: 100, query: "product_type:Textiles") { edges { node { id } } }
  }`);
  console.log(`  product_type=Fabric:    ${types.p1.edges.length}+`);
  console.log(`  product_type=Furniture:  ${types.p2.edges.length}+`);
  console.log(`  product_type=Lighting:   ${types.p3.edges.length}+`);
  console.log(`  product_type=Wallpaper:  ${types.p4.edges.length}+`);
  console.log(`  product_type=Textile:    ${types.p5.edges.length}+`);
  console.log(`  product_type=Textiles:   ${types.p6.edges.length}+`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
