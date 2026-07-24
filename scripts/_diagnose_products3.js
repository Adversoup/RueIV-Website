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

function storeGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: STORE,
      path,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeout: 30000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: data.substring(0, 500) }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function main() {
  // 1. Check top collections with product counts
  console.log('━━━ Collections with Product Counts ━━━');
  let cursor = null;
  const collections = [];
  for (let i = 0; i < 5; i++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      collections(first: 50${after}) {
        edges {
          cursor
          node {
            handle title productsCount { count }
            resourcePublicationsV2(first: 5) {
              edges { node { publication { name } isPublished } }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }`);
    for (const edge of data.collections.edges) {
      const c = edge.node;
      const published = (c.resourcePublicationsV2?.edges || []).some(
        p => p.node.publication.name === 'Online Store' && p.node.isPublished
      );
      collections.push({ handle: c.handle, title: c.title, count: c.productsCount.count, published });
      cursor = edge.cursor;
    }
    if (!data.collections.pageInfo.hasNextPage) break;
  }

  // Sort and show
  const empty = collections.filter(c => c.count === 0);
  const unpub = collections.filter(c => !c.published);
  const withProducts = collections.filter(c => c.count > 0);

  withProducts.sort((a, b) => b.count - a.count);
  console.log(`\nTotal collections: ${collections.length}`);
  console.log(`With products: ${withProducts.length}`);
  console.log(`Empty: ${empty.length}`);
  console.log(`Not published to Online Store: ${unpub.length}`);

  console.log('\n  Top collections by product count:');
  for (const c of withProducts.slice(0, 15)) {
    console.log(`    ${c.handle.padEnd(30)} ${String(c.count).padStart(5)} products  published=${c.published}`);
  }

  if (unpub.length > 0) {
    console.log('\n  ⚠ Unpublished collections:');
    for (const c of unpub.slice(0, 20)) {
      console.log(`    ${c.handle} (${c.count} products)`);
    }
  }

  // 2. Try storefront access to a collection
  console.log('\n━━━ Storefront Collection Check ━━━');
  const testHandle = withProducts[0]?.handle || 'lighting';
  try {
    const result = await storeGet(`/collections/${testHandle}/products.json?limit=3`);
    console.log(`  /collections/${testHandle}/products.json → status ${result.status}`);
    if (result.data?.products) {
      console.log(`  Returns ${result.data.products.length} products`);
      for (const p of result.data.products) {
        console.log(`    - ${p.title}`);
      }
    } else {
      console.log(`  Response:`, typeof result.data === 'string' ? result.data.substring(0, 300) : JSON.stringify(result.data).substring(0, 300));
    }
  } catch(e) {
    console.log(`  Error: ${e.message}`);
  }

  // 3. Check theme template assignments
  console.log('\n━━━ Theme Check ━━━');
  const themes = await gql(`{
    themes(first: 5, roles: [MAIN]) {
      nodes {
        id name role
        files(filenames: ["templates/collection.json", "templates/product.json", "templates/index.json"], first: 5) {
          nodes {
            filename
          }
        }
      }
    }
  }`);
  for (const t of themes.themes.nodes) {
    console.log(`  Theme: ${t.name} (${t.role})`);
    console.log(`  Template files:`, t.files.nodes.map(f => f.filename).join(', ') || 'none found');
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
