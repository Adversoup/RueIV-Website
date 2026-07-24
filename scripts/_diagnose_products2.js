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
  // 1. Count by status
  const counts = await gql(`{
    total: productsCount { count }
    active: productsCount(query: "status:active") { count }
    draft: productsCount(query: "status:draft") { count }
    archived: productsCount(query: "status:archived") { count }
  }`);
  console.log('━━━ Product Status Counts ━━━');
  console.log(`  Total:    ${counts.total.count}`);
  console.log(`  Active:   ${counts.active.count}`);
  console.log(`  Draft:    ${counts.draft.count}`);
  console.log(`  Archived: ${counts.archived.count}`);

  // 2. List available publications (sales channels)
  const pubs = await gql(`{
    publications(first: 20) {
      edges {
        node { id name }
      }
    }
  }`);
  console.log('\n━━━ Available Sales Channels ━━━');
  for (const edge of pubs.publications.edges) {
    console.log(`  ${edge.node.name} — ${edge.node.id}`);
  }

  // 3. Check a sample of active products for publication
  const sample = await gql(`{
    products(first: 5, query: "status:active") {
      edges {
        node {
          id title status
          resourcePublicationsV2(first: 10) {
            edges {
              node {
                publication { name id }
                isPublished
              }
            }
          }
        }
      }
    }
  }`);

  console.log('\n━━━ Sample Active Products — Publication Status ━━━');
  for (const edge of sample.products.edges) {
    const p = edge.node;
    console.log(`\n  ${p.title}`);
    const rpubs = p.resourcePublicationsV2?.edges || [];
    if (rpubs.length) {
      for (const pub of rpubs) {
        console.log(`    Channel: ${pub.node.publication.name} — published: ${pub.node.isPublished}`);
      }
    } else {
      console.log(`    ⚠ NOT PUBLISHED to any sales channel`);
    }
  }

  // 4. Count published vs unpublished
  const pubCount = await gql(`{
    published: productsCount(query: "status:active AND published_status:published") { count }
    unpublished: productsCount(query: "status:active AND published_status:unpublished") { count }
  }`);
  console.log('\n━━━ Publication Summary ━━━');
  console.log(`  Published to Online Store:   ${pubCount.published.count}`);
  console.log(`  NOT published (hidden):      ${pubCount.unpublished.count}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
