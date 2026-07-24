/**
 * lib/shopify_images.js
 * ─────────────────────
 * Shopify Admin API helpers for the image normalization pipeline.
 *
 * Responsibilities:
 *   - Fetch product images from Shopify
 *   - Upload processed square images to Shopify Files
 *   - Write image.square metafield on products
 */

'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

// ─── Rate limiting ────────────────────────────────────────────────────────────
let availablePoints = 1000;
let lastRefillTime  = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gqlFetch(query, variables = {}) {
  const now = Date.now();
  const elapsed = (now - lastRefillTime) / 1000;
  availablePoints = Math.min(1000, availablePoints + elapsed * 50);
  lastRefillTime = now;

  if (availablePoints < 100) {
    const wait = Math.ceil((100 - availablePoints) / 50) * 1000;
    await sleep(wait);
    availablePoints = Math.min(1000, availablePoints + wait / 1000 * 50);
    lastRefillTime = Date.now();
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(GQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query, variables }),
    });

    if (resp.status === 429) {
      const retryAfter = parseFloat(resp.headers.get('Retry-After') || '2');
      await sleep(retryAfter * 1000);
      continue;
    }

    const json = await resp.json();
    const cost = json.extensions?.cost;
    if (cost) availablePoints = cost.throttleStatus?.currentlyAvailable ?? availablePoints;

    if (json.errors) {
      const errArray = Array.isArray(json.errors) ? json.errors : [json.errors];
      const isThrottled = errArray.some(e => (typeof e === 'string' ? e : e.message || '').includes('Throttled'));
      if (isThrottled && attempt < 3) { await sleep(2000); continue; }
      throw new Error(JSON.stringify(json.errors));
    }
    return json;
  }
  throw new Error('Max retries exceeded');
}

// ─── Fetch all products with their featured image ─────────────────────────────

/**
 * Fetch products from Shopify with their featured image URL, handle, and ID.
 *
 * @param {number} [limit] - Max products to fetch (null = all)
 * @returns {Promise<Array<{id: string, handle: string, title: string, featuredImageUrl: string|null}>>}
 */
async function fetchProductImages(limit) {
  const products = [];
  let cursor = null;

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      products(first: 50${afterClause}) {
        edges {
          cursor
          node {
            id
            handle
            title
            featuredImage { url }
            metafield(namespace: "image", key: "square") { value id }
          }
        }
        pageInfo { hasNextPage }
      }
    }`;

    const result = await gqlFetch(query);
    const edges = result.data.products.edges;
    for (const e of edges) {
      products.push({
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        featuredImageUrl: e.node.featuredImage?.url || null,
        existingSquareMetafield: e.node.metafield?.value || null,
        existingSquareMetafieldId: e.node.metafield?.id || null,
      });
      cursor = e.cursor;
    }
    if (!result.data.products.pageInfo.hasNextPage) break;
    if (limit && products.length >= limit) break;
    await sleep(200);
  }

  return limit ? products.slice(0, limit) : products;
}

// ─── Upload file to Shopify Files ─────────────────────────────────────────────

/**
 * Upload a local file to Shopify Files via staged upload.
 *
 * Steps:
 *   1. stagedUploadsCreate → get upload URL + parameters
 *   2. HTTP POST (multipart) to the staged URL
 *   3. fileCreate to register the file in Shopify
 *
 * @param {string} localPath - Absolute path to the file
 * @param {string} filename  - Desired filename in Shopify (e.g. "amelie-chair_sq_1200.webp")
 * @param {string} mimeType  - MIME type (e.g. "image/webp")
 * @returns {Promise<{fileId: string, url: string}|null>}
 */
async function uploadToShopifyFiles(localPath, filename, mimeType) {
  const fileSize = fs.statSync(localPath).size;

  // Step 1: Create staged upload
  const stageQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const stageResult = await gqlFetch(stageQuery, {
    input: [{
      filename,
      mimeType,
      httpMethod: 'POST',
      resource: 'FILE',
      fileSize: String(fileSize),
    }],
  });

  const targets = stageResult.data?.stagedUploadsCreate?.stagedTargets;
  const stageErrors = stageResult.data?.stagedUploadsCreate?.userErrors;
  if (stageErrors?.length > 0) {
    console.error('  Stage upload errors:', stageErrors);
    return null;
  }
  if (!targets || targets.length === 0) {
    console.error('  No staged upload target returned');
    return null;
  }

  const target = targets[0];

  // Step 2: Upload file via multipart POST
  const form = new FormData();
  for (const param of target.parameters) {
    form.append(param.name, param.value);
  }
  const fileBlob = new Blob([fs.readFileSync(localPath)], { type: mimeType });
  form.append('file', fileBlob, filename);

  const uploadResp = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    console.error('  Upload POST failed:', uploadResp.status, text.substring(0, 200));
    return null;
  }

  // Step 3: Register file in Shopify
  const fileCreateQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage {
            id
            image { url }
          }
          ... on GenericFile {
            id
            url
          }
        }
        userErrors { field message code }
      }
    }
  `;

  const fileResult = await gqlFetch(fileCreateQuery, {
    files: [{
      alt: `Square normalized product image: ${filename}`,
      contentType: mimeType === 'image/webp' ? 'IMAGE' : 'IMAGE',
      originalSource: target.resourceUrl,
    }],
  });

  const fileErrors = fileResult.data?.fileCreate?.userErrors;
  if (fileErrors?.length > 0) {
    console.error('  fileCreate errors:', fileErrors);
    return null;
  }

  const createdFile = fileResult.data?.fileCreate?.files?.[0];
  if (!createdFile) {
    console.error('  fileCreate returned no file');
    return null;
  }

  const fileUrl = createdFile.image?.url || createdFile.url || target.resourceUrl;
  return { fileId: createdFile.id, url: fileUrl };
}

// ─── Write image.square metafield ─────────────────────────────────────────────

/**
 * Set the image.square metafield on a product to reference a Shopify file.
 *
 * @param {string} productId - Shopify product GID
 * @param {string} fileGid   - Shopify file GID (gid://shopify/MediaImage/...)
 * @returns {Promise<string|null>} - Metafield GID or null on failure
 */
async function setSquareMetafield(productId, fileGid) {
  const query = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key namespace value }
        userErrors { field message }
      }
    }
  `;

  const result = await gqlFetch(query, {
    metafields: [{
      ownerId: productId,
      namespace: 'image',
      key: 'square',
      value: fileGid,
      type: 'file_reference',
    }],
  });

  const errors = result.data?.metafieldsSet?.userErrors;
  if (errors?.length > 0) {
    console.error('  Metafield errors:', errors);
    return null;
  }

  return result.data?.metafieldsSet?.metafields?.[0]?.id || null;
}

module.exports = {
  fetchProductImages,
  uploadToShopifyFiles,
  setSquareMetafield,
  gqlFetch,
};
