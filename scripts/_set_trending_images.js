#!/usr/bin/env node
'use strict';
require('dotenv').config();
const S = process.env.SHOPIFY_STORE;
const T = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const gql = async (q) => {
  const r = await fetch(`https://${S}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
    body: JSON.stringify({ query: q }),
  });
  return r.json();
};

(async () => {
  // Get varied product images
  for (const type of ['Lighting', 'Furniture', 'Textile', 'Wallpaper']) {
    const { data } = await gql(`{ products(first: 2, query: "product_type:${type}") { edges { node { title handle featuredMedia { ... on MediaImage { image { url } } } } } } }`);
    for (const e of (data?.products?.edges || [])) {
      const p = e.node;
      console.log(`${type.padEnd(12)} ${p.handle.padEnd(40)} ${(p.featuredMedia?.image?.url || 'NO IMAGE').substring(0, 90)}`);
    }
  }

  // Set collection images
  const pairs = [
    ['444645671043', 'new-arrivals'],
    ['444645638275', 'trending-now'],
  ];

  // Use a lighting product for new-arrivals and furniture for trending
  const { data: d1 } = await gql('{ products(first: 1, query: "product_type:Lighting") { edges { node { featuredMedia { ... on MediaImage { image { url } } } } } } }');
  const { data: d2 } = await gql('{ products(first: 1, query: "product_type:Furniture") { edges { node { featuredMedia { ... on MediaImage { image { url } } } } } } }');

  const urls = [
    d1?.products?.edges?.[0]?.node?.featuredMedia?.image?.url,
    d2?.products?.edges?.[0]?.node?.featuredMedia?.image?.url,
  ];

  for (let i = 0; i < pairs.length; i++) {
    const [id, handle] = pairs[i];
    const imgUrl = urls[i];
    if (!imgUrl) { console.log(`${handle}: no image URL`); continue; }

    const resp = await fetch(`https://${S}/admin/api/2024-10/smart_collections/${id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': T },
      body: JSON.stringify({ smart_collection: { id: parseInt(id), image: { src: imgUrl } } }),
    });
    console.log(`${handle}: ${resp.ok ? 'OK' : 'FAIL ' + resp.status}`);
  }
})();
