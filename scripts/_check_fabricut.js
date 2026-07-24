#!/usr/bin/env node
require('dotenv').config();
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const S = process.env.SHOPIFY_STORE;
const V = process.env.SHOPIFY_API_VERSION;

async function gql(query) {
  const res = await fetch(`https://${S}/admin/api/${V}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
    body: JSON.stringify({ query }),
  });
  return (await res.json()).data;
}

async function main() {
  let cursor = null, hasNext = true;
  const results = [];

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      products(first: 50, query: "vendor:Fabricut"${after}) {
        edges {
          node { id title vendor featuredImage { url } images(first: 3) { edges { node { url } } } }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }`);
    for (const e of data.products.edges) {
      results.push({
        title: e.node.title,
        featured: e.node.featuredImage?.url ? 'YES' : 'NO',
        imageCount: e.node.images.edges.length,
        firstImageUrl: e.node.images.edges[0]?.node?.url || '—',
      });
      cursor = e.cursor;
    }
    hasNext = data.products.pageInfo.hasNextPage;
  }

  console.log(`Fabricut products: ${results.length}\n`);
  for (const r of results) {
    const s = r.featured === 'YES' ? '✓' : '✗';
    console.log(`${s} ${r.title.padEnd(45)} imgs:${r.imageCount}  ${r.featured === 'NO' ? '← NO IMAGE' : ''}`);
  }
  const noImg = results.filter(r => r.featured === 'NO');
  console.log(`\nNo featured image: ${noImg.length} / ${results.length}`);
}

main().catch(console.error);
