#!/usr/bin/env node
/**
 * Upload the square crop for product 97881 (Récolte des Fleurs)
 * and set it as the featured image.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL_URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const r = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

async function main() {
  const productId = 'gid://shopify/Product/8948258799747';
  const localPath = path.resolve(__dirname, '..', 'out', 'images', 'r-colte-des-fleurs-97881', 'r-colte-des-fleurs-97881_sq_1200.jpg');
  const filename = 'r-colte-des-fleurs-97881_sq_1200.jpg';
  const fileSize = fs.statSync(localPath).size;

  console.log('Uploading square crop for Récolte des Fleurs (97881)...');

  // 1. Stage upload
  const stageResult = await gql(`
    mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `, {
    input: [{ filename, mimeType: 'image/jpeg', httpMethod: 'POST', resource: 'PRODUCT_IMAGE', fileSize: String(fileSize) }]
  });

  const target = stageResult.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    console.error('Stage failed:', JSON.stringify(stageResult.data?.stagedUploadsCreate?.userErrors));
    process.exit(1);
  }

  // 2. Upload file
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([fs.readFileSync(localPath)], { type: 'image/jpeg' }), filename);

  const uploadResp = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadResp.ok) {
    console.error('Upload failed:', uploadResp.status);
    process.exit(1);
  }
  console.log('Staged at:', target.resourceUrl);

  // 3. Create product media
  const createResult = await gql(`
    mutation($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { ... on MediaImage { id } }
        mediaUserErrors { field message code }
      }
    }
  `, {
    productId,
    media: [{ alt: 'Récolte des Fleurs – square', mediaContentType: 'IMAGE', originalSource: target.resourceUrl }]
  });

  const newMedia = createResult.data?.productCreateMedia?.media?.[0];
  if (!newMedia) {
    console.error('Media create failed:', createResult.data?.productCreateMedia?.mediaUserErrors);
    process.exit(1);
  }
  console.log('New media ID:', newMedia.id);

  // 4. Wait for processing, then reorder
  await sleep(2000);
  
  // Get existing media IDs
  const prodResult = await gql(`{
    product(id: "${productId}") {
      media(first: 10) { edges { node { ... on MediaImage { id } } } }
    }
  }`);
  const allMediaIds = prodResult.data?.product?.media?.edges?.map(e => e.node.id) || [];
  console.log('All media IDs:', allMediaIds.length);

  // Reorder: new square image first
  const moves = allMediaIds
    .sort((a, b) => (a === newMedia.id ? -1 : b === newMedia.id ? 1 : 0))
    .map((id, i) => ({ id, newPosition: String(i) }));

  const reorderResult = await gql(`
    mutation($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) { userErrors { field message } }
    }
  `, { id: productId, moves });

  const reorderErrors = reorderResult.data?.productReorderMedia?.userErrors || [];
  if (reorderErrors.length) {
    console.error('Reorder errors:', reorderErrors);
  } else {
    console.log('SUCCESS: Square image set as featured image');
  }
}

main().catch(e => console.error(e));
