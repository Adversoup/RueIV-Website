/**
 * shopify_admin.js
 * Minimal Shopify Admin GraphQL helpers for bounded demo sync scripts.
 */

'use strict';

require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = STORE ? `https://${STORE}/admin/api/${VERSION}/graphql.json` : null;

let availablePoints = 1000;
let lastRefillTime = Date.now();
const REFILL_RATE = 50;
const MIN_THRESHOLD = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasShopifyCredentials() {
  return Boolean(STORE && TOKEN);
}

async function gqlFetch(query, variables = {}, options = {}) {
  const dryRun = options.dryRun === true;
  if (dryRun || !hasShopifyCredentials()) {
    return { data: null, extensions: null, dryRun: true };
  }

  const now = Date.now();
  const elapsed = (now - lastRefillTime) / 1000;
  availablePoints = Math.min(1000, availablePoints + elapsed * REFILL_RATE);
  lastRefillTime = now;

  if (availablePoints < MIN_THRESHOLD) {
    const waitMs = ((MIN_THRESHOLD - availablePoints) / REFILL_RATE) * 1000 + 200;
    await sleep(waitMs);
    availablePoints = Math.min(1000, availablePoints + (waitMs / 1000) * REFILL_RATE);
  }

  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  if (json.extensions?.cost) {
    availablePoints = json.extensions.cost.throttleStatus.currentlyAvailable;
  }
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 500)}`);
  }
  return json;
}

async function findProductByHandle(handle, options = {}) {
  const query = `
    query findProduct($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            title
            handle
            vendor
            status
            tags
            descriptionHtml
            productType
            variants(first: 100) {
              edges { node { id sku price } }
            }
            metafields(first: 50) {
              edges { node { namespace key value type } }
            }
          }
        }
      }
    }
  `;
  const result = await gqlFetch(query, { query: `handle:${handle}` }, options);
  const edges = result?.data?.products?.edges || [];
  return edges.length > 0 ? edges[0].node : null;
}

async function findProductsBySkuVendor(sku, vendor, options = {}) {
  const query = `
    query findProducts($query: String!) {
      products(first: 5, query: $query) {
        edges {
          node {
            id
            title
            handle
            vendor
            status
            variants(first: 100) {
              edges { node { id sku } }
            }
          }
        }
      }
    }
  `;
  const q = `sku:${JSON.stringify(sku)} vendor:${JSON.stringify(vendor)}`;
  const result = await gqlFetch(query, { query: q }, options);
  return (result?.data?.products?.edges || []).map((e) => e.node);
}

async function getCollectionByHandle(handle, options = {}) {
  const query = `
    query collectionByHandle($handle: String!) {
      collectionByHandle(handle: $handle) {
        id
        handle
        title
        productsCount { count }
      }
    }
  `;
  const result = await gqlFetch(query, { handle }, options);
  return result?.data?.collectionByHandle || null;
}

module.exports = {
  STORE,
  VERSION,
  hasShopifyCredentials,
  gqlFetch,
  findProductByHandle,
  findProductsBySkuVendor,
  getCollectionByHandle,
  sleep,
};
