#!/usr/bin/env node
/**
 * Upload 3 hero images to Shopify Files, then update
 * the hero section in index.json with all 3 slides.
 */
require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;
const themeId = 156225110147;

const GQL = `https://${store}/admin/api/${ver}/graphql.json`;
const REST = `https://${store}/admin/api/${ver}`;

/* ── Helpers ─────────────────────────────────────────────────── */

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}

async function restPut(p, body) {
  const r = await fetch(`${REST}${p}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function restGet(p) {
  const r = await fetch(`${REST}${p}`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  return r.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Download external image to buffer ─────────────────────── */
async function downloadImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to download ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/* ── Upload image to Shopify Files via staged upload ───────── */
async function uploadToShopifyFiles(filename, buffer, mimeType) {
  console.log(`  → Staging upload for ${filename} (${(buffer.length / 1024).toFixed(0)} KB)...`);

  // Step 1: Create staged upload
  const stageRes = await gql(`
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
  `, {
    input: [{
      resource: 'FILE',
      filename,
      mimeType,
      fileSize: String(buffer.length),
      httpMethod: 'POST'
    }]
  });

  const target = stageRes.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    console.error('  ✗ Staged upload failed:', JSON.stringify(stageRes));
    return null;
  }

  // Step 2: Upload to staged URL using multipart form
  const form = new FormData();
  for (const p of target.parameters) {
    form.append(p.name, p.value);
  }
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const uploadRes = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    console.error(`  ✗ Upload to staged URL failed: ${uploadRes.status}`);
    return null;
  }
  console.log(`  ✓ Uploaded to staging`);

  // Step 3: Create file in Shopify
  const createRes = await gql(`
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id alt createdAt fileStatus }
        userErrors { field message }
      }
    }
  `, {
    files: [{
      alt: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      contentType: 'IMAGE',
      originalSource: target.resourceUrl
    }]
  });

  const file = createRes.data?.fileCreate?.files?.[0];
  if (!file) {
    console.error('  ✗ fileCreate failed:', JSON.stringify(createRes));
    return null;
  }

  console.log(`  ✓ File created: ${file.id} status=${file.fileStatus}`);
  return filename;
}

/* ── Wait for files to be READY ────────────────────────────── */
async function waitForFiles(filenames, maxWait = 60000) {
  console.log('\n  Waiting for files to process...');
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const res = await gql(`{
      files(first: 10, sortKey: CREATED_AT, reverse: true) {
        nodes {
          ... on MediaImage {
            id
            fileStatus
            image { url originalSrc }
            alt
          }
        }
      }
    }`);

    const files = res.data?.files?.nodes || [];
    const ready = files.filter(f => f.fileStatus === 'READY');
    const matching = ready.filter(f => {
      const src = f.image?.originalSrc || f.image?.url || '';
      return filenames.some(fn => src.includes(fn.replace(/\s/g, '_')));
    });

    if (matching.length >= filenames.length) {
      console.log(`  ✓ All ${filenames.length} files ready`);
      return matching;
    }

    const processing = files.filter(f => f.fileStatus === 'PROCESSING').length;
    console.log(`    ... ${ready.length} ready, ${processing} processing`);
    await sleep(3000);
  }

  console.log('  ⚠ Timeout waiting for files — continuing anyway');
  return [];
}

/* ══════════════════════════════════════════════════════════════
   STEP 1 — Upload images
   ══════════════════════════════════════════════════════════════ */

const IMAGES = [
  {
    name: 'rueiv-hero-arte-tapisseries.jpg',
    url: 'https://edge.arte-international.com/media/1f8eba04-9269-451c-b0c5-811da905703e/conversions/LesTapisseries_Bucolique_97850_Roomshot_Web_LR-fullscreen.jpg',
    local: null
  },
  {
    name: 'rueiv-hero-rosemary-hallgarten-ombre.jpg',
    url: 'https://www.rosemaryhallgarten.com/cdn/shop/files/OMBRE_BANCHA_SET_2_020web_81f8bd3e-de9b-49eb-a8ee-c9eaee58b82d.jpg?v=1771811159',
    local: null
  },
  {
    name: 'rueiv-hero-lola-outdoor-poufs.jpg',
    url: null,
    local: path.join(__dirname, '..', 'assets', 'Lola_Outdoor_Poufs_CMYK.jpg')
  }
];

async function uploadImages() {
  console.log('\n━━━ STEP 1: Upload hero images to Shopify Files ━━━');

  const uploaded = [];

  for (const img of IMAGES) {
    console.log(`\n  Processing: ${img.name}`);
    let buffer;
    if (img.url) {
      buffer = await downloadImage(img.url);
    } else {
      buffer = fs.readFileSync(img.local);
    }

    const result = await uploadToShopifyFiles(img.name, buffer, 'image/jpeg');
    uploaded.push(result);
    await sleep(1000);
  }

  return uploaded;
}

/* ══════════════════════════════════════════════════════════════
   STEP 2 — Update hero section in index.json
   ══════════════════════════════════════════════════════════════ */

async function updateHeroBlocks() {
  console.log('\n━━━ STEP 2: Update hero blocks in index.json ━━━');

  // Read current index.json
  const getRes = await restGet(
    `/themes/${themeId}/assets.json?asset[key]=templates/index.json`
  );
  if (!getRes.asset) {
    console.error('  ✗ Could not read index.json');
    return;
  }

  const data = JSON.parse(getRes.asset.value);
  const hero = data.sections?.rueiv_hero;
  if (!hero) {
    console.error('  ✗ rueiv_hero section not found in index.json');
    return;
  }

  // Build 3 slides with shopify://shop_images references
  hero.blocks = {
    slide_1: {
      type: 'slide',
      settings: {
        image: 'shopify://shop_images/rueiv-hero-arte-tapisseries.jpg',
        kicker: 'The Showroom',
        heading: 'Curated Design for Interior Professionals',
        description: 'Textiles. Wallcovering. Furniture. Lighting. Rugs. An editorial gateway to the showroom.',
        button_label: 'Explore Collections',
        button_url: '/collections'
      }
    },
    slide_2: {
      type: 'slide',
      settings: {
        image: 'shopify://shop_images/rueiv-hero-rosemary-hallgarten-ombre.jpg',
        kicker: 'Styled by: Alyce Taylor  Photographer: Chris Everard',
        heading: 'Where Texture Meets Light',
        description: '',
        button_label: 'Shop Textiles',
        button_url: '/collections/fabric'
      }
    },
    slide_3: {
      type: 'slide',
      settings: {
        image: 'shopify://shop_images/rueiv-hero-lola-outdoor-poufs.jpg',
        kicker: 'New Arrivals',
        heading: 'Outdoor Living, Reimagined',
        description: '',
        button_label: 'Shop Outdoor',
        button_url: '/collections/furniture'
      }
    }
  };
  hero.block_order = ['slide_1', 'slide_2', 'slide_3'];

  console.log('  → Writing 3 hero slides to index.json');

  const putRes = await restPut(`/themes/${themeId}/assets.json`, {
    asset: { key: 'templates/index.json', value: JSON.stringify(data, null, 2) }
  });

  if (putRes.asset) console.log('  ✓ index.json updated with 3 hero slides');
  else console.error('  ✗ Write failed:', JSON.stringify(putRes.errors || putRes));
}

/* ══════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════ */

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Hero Images — Upload & Configure 3 Slides          ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  await uploadImages();
  await waitForFiles(IMAGES.map(i => i.name));
  await updateHeroBlocks();

  console.log('\n✅ Hero configured with 3 rotating images!');
  console.log(`Preview: https://${store}/?preview_theme_id=${themeId}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
