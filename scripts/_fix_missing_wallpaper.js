#!/usr/bin/env node
/**
 * Fix the missing wallpaper product "Récolte des Fleurs" (97881)
 * which has 0 media on Shopify due to URL encoding issue with accented chars.
 *
 * Steps:
 * 1. Find the product on Shopify
 * 2. Download images from source URLs
 * 3. Upload via staged upload (to avoid URL encoding issues)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const STORE   = process.env.SHOPIFY_STORE;
const TOKEN   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL     = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const REST    = `https://${STORE}/admin/api/${VERSION}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

// Source image URLs - using responsive/packshot endpoints that work (conversions return 403)
const SOURCE_IMAGES = [
  'https://edge.arte-international.com/media/96886958-ab97-4150-9b6e-0167e4c55029/responsives/LesTapisseries_Re%CC%81coltedesFleurs_97881_Roomshot_Web_LR___medium-two-thirds_1152_1728.jpg',
  'https://edge.arte-international.com/media/96886958-ab97-4150-9b6e-0167e4c55029/responsives/LesTapisseries_Re%CC%81coltedesFleurs_97881_Roomshot_Web_LR___medium-two-thirds_963_1445.jpg',
  'https://edge.arte-international.com/media/e8cae9cc-e523-4406-819a-e61ec57cdbb9/conversions/LesTapisseries_RecoltedesFleurs_97881_Packshot_Web_HR-thumb-square.jpg',
];

async function main() {
  // 1. Find product
  console.log('Finding product Récolte des Fleurs (97881)...');
  const { data } = await gql(`{
    products(first: 1, query: "sku:97881") {
      edges { node { id title handle } }
    }
  }`);
  const product = data?.products?.edges?.[0]?.node;
  if (!product) {
    console.error('Product not found!');
    process.exit(1);
  }
  console.log(`Found: ${product.title} (${product.id})`);

  // 2. Download images locally
  const tmpDir = path.join(__dirname, '..', 'tmp_wallpaper_crops');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const localFiles = [];
  for (let i = 0; i < SOURCE_IMAGES.length; i++) {
    const url = SOURCE_IMAGES[i];
    console.log(`Downloading image ${i + 1}...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`  FAILED: ${resp.status} ${resp.statusText}`);
      // Try alternate encoding
      const altUrl = url.replace('%C3%A9', 'e');
      console.log(`  Trying alternate URL without accent...`);
      const resp2 = await fetch(altUrl);
      if (!resp2.ok) {
        console.error(`  Also failed: ${resp2.status}`);
        continue;
      }
      const buf = Buffer.from(await resp2.arrayBuffer());
      const fname = `97881_image_${i + 1}.jpg`;
      const fpath = path.join(tmpDir, fname);
      fs.writeFileSync(fpath, buf);
      localFiles.push({ path: fpath, name: fname, size: buf.length });
      console.log(`  Saved: ${fname} (${(buf.length/1024).toFixed(0)} KB)`);
      continue;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const fname = `97881_image_${i + 1}.jpg`;
    const fpath = path.join(tmpDir, fname);
    fs.writeFileSync(fpath, buf);
    localFiles.push({ path: fpath, name: fname, size: buf.length });
    console.log(`  Saved: ${fname} (${(buf.length/1024).toFixed(0)} KB)`);
  }

  if (localFiles.length === 0) {
    console.error('No images downloaded!');
    process.exit(1);
  }

  // 3. Upload via staged uploads
  console.log('\nUploading to Shopify via staged uploads...');
  const mediaInputs = [];

  for (const file of localFiles) {
    // Create staged upload
    const stageResult = await gql(`
      mutation($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `, {
      input: [{
        filename: file.name,
        mimeType: 'image/jpeg',
        httpMethod: 'POST',
        resource: 'IMAGE',
        fileSize: String(file.size),
      }]
    });

    const target = stageResult?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      console.error('  Staged upload failed:', JSON.stringify(stageResult?.data?.stagedUploadsCreate?.userErrors));
      continue;
    }

    // POST to staged URL
    const formData = new FormData();
    for (const param of target.parameters) {
      formData.append(param.name, param.value);
    }
    formData.append('file', new Blob([fs.readFileSync(file.path)], { type: 'image/jpeg' }), file.name);

    const uploadResp = await fetch(target.url, { method: 'POST', body: formData });
    if (!uploadResp.ok) {
      console.error(`  Upload to staged URL failed: ${uploadResp.status}`);
      continue;
    }
    console.log(`  Staged: ${file.name} → ${target.resourceUrl}`);
    mediaInputs.push({
      mediaContentType: 'IMAGE',
      originalSource: target.resourceUrl,
    });
    await sleep(500);
  }

  if (mediaInputs.length === 0) {
    console.error('No images staged!');
    process.exit(1);
  }

  // 4. Attach media to product
  console.log('\nAttaching media to product...');
  const attachResult = await gql(`
    mutation($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id }
        mediaUserErrors { field message }
      }
    }
  `, {
    productId: product.id,
    media: mediaInputs,
  });

  const errors = attachResult?.data?.productCreateMedia?.mediaUserErrors || [];
  const attached = attachResult?.data?.productCreateMedia?.media || [];
  if (errors.length > 0) {
    console.error('Media errors:', errors);
  }
  console.log(`Attached ${attached.length} images to ${product.title}`);
  console.log('Done!');
}

main().catch(e => console.error(e));
