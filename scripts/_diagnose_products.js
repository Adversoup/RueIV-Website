require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER = process.env.SHOPIFY_API_VERSION;

async function gql(query) {
  const r = await fetch(`https://${STORE}/admin/api/${VER}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query })
  });
  return (await r.json()).data;
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

  // 2. Check publication status of a sample of active products
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
    console.log(`    Status: ${p.status}`);
    const pubs = p.resourcePublicationsV2?.edges || [];
    if (pubs.length) {
      for (const pub of pubs) {
        console.log(`    Channel: ${pub.node.publication.name} — published: ${pub.node.isPublished}`);
      }
    } else {
      console.log(`    ⚠ NOT PUBLISHED to any sales channel`);
    }
  }

  // 3. Check publications (sales channels) available
  const pubs = await gql(`{
    publications(first: 20) {
      edges {
        node {
          id name
          supportsFuturePublishing
        }
      }
    }
  }`);
  console.log('\n━━━ Available Sales Channels ━━━');
  for (const edge of pubs.publications.edges) {
    console.log(`  ${edge.node.name} — ${edge.node.id}`);
  }

  // 4. Count products published to Online Store
  // Check how many active products are actually published
  const publishedCount = await gql(`{
    productsCount(query: "status:active AND published_status:published") { count }
    unpublishedCount: productsCount(query: "status:active AND published_status:unpublished") { count }
  }`);
  console.log('\n━━━ Publication Summary (Active Products) ━━━');
  console.log(`  Published:   ${publishedCount.productsCount.count}`);
  console.log(`  Unpublished: ${publishedCount.unpublishedCount.count}`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
