#!/usr/bin/env node
/**
 * audit_live_storefront.js — Read-only P0 live storefront audit.
 *
 * Compares live Shopify Admin state against repo main for:
 * - Published theme + key asset drift (price resolver, product template, designers nav)
 * - Jackson 2997S price / override.price_hidden / publications
 * - Designers menu children vs discovered vendors
 * - Search & Discovery filters on a sample collection
 *
 * Usage:
 *   node scripts/audit_live_storefront.js
 *   node scripts/audit_live_storefront.js --sku 2997S
 *   node scripts/audit_live_storefront.js --email levent@adversoup.com
 *
 * No mutations. Safe for diagnosis.
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildVendorSpecs } = require('./lib/vendor_navigation');

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL = `https://${STORE}/admin/api/${VER}/graphql.json`;
const REST = `https://${STORE}/admin/api/${VER}`;
const REPO_THEME_ID = 156225110147;

const args = process.argv.slice(2);
const SKU = getArg('--sku') || '2997S';
const CUSTOMER_EMAIL = getArg('--email') || '';

function getArg(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function requireCredentials() {
  if (!STORE || !TOKEN) {
    throw new Error('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_ACCESS_TOKEN');
  }
}

async function gql(query, variables = {}) {
  requireCredentials();
  const response = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function rest(pathname) {
  requireCredentials();
  const response = await fetch(`${REST}${pathname}`, {
    headers: { 'X-Shopify-Access-Token': TOKEN },
  });
  return response.json();
}

function sha256(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex').slice(0, 16);
}

function readRepoFile(relPath) {
  const full = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function parseProductJsonBlockOrder(jsonText) {
  try {
    const cleaned = jsonText.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
    const parsed = JSON.parse(cleaned);
    const main = parsed.sections?.main;
    return {
      hasPriceBlock: Boolean(main?.blocks?.price),
      blockOrder: main?.block_order || [],
      priceInOrder: (main?.block_order || []).includes('price'),
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function auditThemes() {
  console.log('\n=== 1. LIVE THEME DRIFT ===');
  const { themes } = await rest('/themes.json');
  const active = themes.find((t) => t.role === 'main');
  console.log(`Active theme: ${active?.id} | ${active?.name} | role=${active?.role}`);
  console.log(`Repo expected theme ID: ${REPO_THEME_ID}`);
  console.log(active?.id === REPO_THEME_ID ? '  ✓ Theme ID matches repo scripts' : '  ⚠ Theme ID differs from repo scripts');

  const keys = [
    'snippets/rueiv-price-resolver.liquid',
    'snippets/price.liquid',
    'templates/product.json',
    'templates/collection.designers.json',
    'sections/rueiv-designers-grid.liquid',
    'snippets/card-product.liquid',
    'snippets/smart-filters.liquid',
  ];

  const drift = [];
  for (const key of keys) {
    const res = await rest(`/themes/${active.id}/assets.json?asset[key]=${encodeURIComponent(key)}`);
    const live = res.asset?.value ?? null;
    const repo = readRepoFile(`theme/${key}`);
    const liveHash = live ? sha256(live) : null;
    const repoHash = repo ? sha256(repo) : null;
    const match = liveHash && repoHash && liveHash === repoHash;
    console.log(`  ${key}: live=${live ? 'yes' : 'MISSING'} repo=${repo ? 'yes' : 'MISSING'} ${match ? 'MATCH' : 'DRIFT'}`);
    if (!match) {
      drift.push({ key, liveHash, repoHash, liveLen: live?.length || 0, repoLen: repo?.length || 0 });
    }
  }

  if (drift.length) {
    console.log('\n  Drift summary:');
    drift.forEach((d) => console.log(`    - ${d.key} (live ${d.liveLen} chars, repo ${d.repoLen} chars)`));
  }

  const liveProductJson = (await rest(`/themes/${active.id}/assets.json?asset[key]=templates/product.json`)).asset?.value;
  const repoProductJson = readRepoFile('theme/templates/product.json');
  const liveOrder = parseProductJsonBlockOrder(liveProductJson || '');
  const repoOrder = parseProductJsonBlockOrder(repoProductJson || '');
  console.log('\n  product.json price block:');
  console.log(`    live: defined=${liveOrder.hasPriceBlock} in block_order=${liveOrder.priceInOrder}`);
  console.log(`    repo: defined=${repoOrder.hasPriceBlock} in block_order=${repoOrder.priceInOrder}`);
  if (!liveOrder.priceInOrder) {
    console.log('  ⚠ ROOT CAUSE CANDIDATE: price block excluded from live block_order — PDP will not render price UI');
  }

  return { activeThemeId: active?.id, drift, liveOrder, repoOrder };
}

async function auditJacksonProduct() {
  console.log(`\n=== 2. PRICE — Jackson / SKU ${SKU} ===`);
  const search = `sku:${JSON.stringify(SKU).slice(1, -1)}`;
  const data = await gql(
    `query ProductBySku($query: String!) {
      products(first: 5, query: $query) {
        edges {
          node {
            id handle title vendor status
            templateSuffix
            priceHidden: metafield(namespace: "override", key: "price_hidden") { value type }
            variants(first: 10) {
              edges {
                node { id sku price compareAtPrice availableForSale }
              }
            }
            resourcePublications(first: 20) {
              edges { node { publication { id name } isPublished } }
            }
          }
        }
      }
    }`,
    { query: search }
  );

  const products = data.products.edges.map((e) => e.node);
  if (!products.length) {
    console.log(`  ⚠ No product found for sku:${SKU}`);
    return null;
  }

  const product = products[0];
  const variant = product.variants.edges[0]?.node;
  console.log(`  Product: ${product.title} (${product.handle})`);
  console.log(`  Vendor: ${product.vendor} | Status: ${product.status}`);
  console.log(`  Template suffix: ${product.templateSuffix || '(default product.json)'}`);
  console.log(`  override.price_hidden: ${product.priceHidden?.value ?? '(unset)'}`);
  console.log(`  Variant SKU: ${variant?.sku} | Price: ${variant?.price} (${Number(variant?.price || 0) / 100})`);

  const hiddenMeta = product.priceHidden?.value;
  const hidden =
    hiddenMeta === true ||
    hiddenMeta === 'true' ||
    hiddenMeta === 1 ||
    hiddenMeta === '1' ||
    !variant?.price ||
    Number(variant.price) === 0;

  console.log(`  Theme rueiv-price-resolver would hide price: ${hidden}`);
  console.log('  Note: even when resolver shows price, PDP hides it if product.json block_order omits "price"');

  const pubs = product.resourcePublications?.edges || [];
  if (pubs.length) {
    console.log('  Publications:');
    pubs.forEach(({ node }) => {
      console.log(`    - ${node.publication.name}: ${node.isPublished ? 'published' : 'not published'}`);
    });
  }

  return { product, variant, hidden };
}

async function auditCustomerAccess() {
  if (!CUSTOMER_EMAIL) return null;
  console.log(`\n=== 2b. CUSTOMER ACCESS — ${CUSTOMER_EMAIL} ===`);
  const data = await gql(
    `query CustomerByEmail($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            state
            tags
            metafield(namespace: "rueiv", key: "price_access") { value }
          }
        }
      }
    }`,
    { query: `email:${CUSTOMER_EMAIL}` }
  );

  const customer = data.customers.edges[0]?.node;
  if (!customer) {
    console.log('  ⚠ Customer not found in storefront customer records');
    console.log('  Note: Shopify Admin staff login does NOT populate Liquid `customer` on storefront');
    return null;
  }

  const tags = customer.tags || [];
  const hasTradeTag = tags.some((t) =>
    ['trade', 'trade-approved', 'price-visible', 'approved'].includes(String(t).toLowerCase())
  );
  console.log(`  Found: id=${customer.id} state=${customer.state}`);
  console.log(`  Tags: ${tags.length ? tags.join(', ') : '(none)'}`);
  console.log(`  rueiv.price_access metafield: ${customer.metafield?.value ?? '(unset)'}`);
  console.log(`  Would pass proposed trade price gate: ${hasTradeTag || customer.metafield?.value === 'approved'}`);
  return { customer, hasTradeTag };
}

async function auditDesignersMenu() {
  console.log('\n=== 3. DESIGNERS MENU ===');
  const vendorNames = [];
  let cursor = null;
  for (let page = 0; page < 250; page++) {
    const data = await gql(
      `query VendorCensus($after: String) {
        products(first: 250, after: $after) {
          edges { cursor node { vendor } }
          pageInfo { hasNextPage }
        }
      }`,
      { after: cursor }
    );
    const edges = data.products.edges || [];
    edges.forEach((e) => {
      if (e.node.vendor?.trim()) vendorNames.push(e.node.vendor);
    });
    if (!data.products.pageInfo.hasNextPage || !edges.length) break;
    cursor = edges[edges.length - 1].cursor;
  }

  const vendorSpecs = buildVendorSpecs(vendorNames);
  const discovered = vendorSpecs.map((v) => v.title);
  const hasArtisticFrame = discovered.includes('Artistic Frame');
  console.log(`  Discovered vendors from product.vendor: ${discovered.length}`);
  console.log(`  Artistic Frame in product census: ${hasArtisticFrame ? 'YES' : 'NO'}`);

  const artisticColl = await gql(`{
    collectionByHandle(handle: "artistic-frame") { id title handle productsCount { count } }
  }`);
  const designersColl = await gql(`{
    collectionByHandle(handle: "designers") { id title handle productsCount { count } }
  }`);
  const af = artisticColl.collectionByHandle;
  console.log(`  artistic-frame collection: ${af ? 'EXISTS' : 'MISSING'}`);
  if (af) {
    console.log(`    products: ${af.productsCount?.count ?? '?'}`);
  }
  if (designersColl.collectionByHandle) {
    console.log(`  designers index collection products: ${designersColl.collectionByHandle.productsCount?.count ?? '?'}`);
  }

  const { menus } = await gql(`{
    menus(first: 20) {
      nodes {
        handle title
        items {
          title type url resourceId
          items { title type url resourceId }
        }
      }
    }
  }`);

  const mainMenu = menus.nodes.find((m) => m.handle === 'main-menu');
  const designers = mainMenu?.items?.find((i) => i.title === 'Designers');
  const menuChildren = (designers?.items || []).map((i) => i.title);
  console.log(`  main-menu → Designers children (${menuChildren.length}):`);
  menuChildren.forEach((title) => console.log(`    - ${title}`));

  const menuHasAF = menuChildren.includes('Artistic Frame');
  console.log(`  Artistic Frame in live Designers menu: ${menuHasAF ? 'YES' : 'NO'}`);
  if (hasArtisticFrame && !menuHasAF) {
    console.log('  ⚠ ROOT CAUSE: fix_vendors.js menu sync not applied (or stale menu)');
  }

  const missingFromMenu = discovered.filter((v) => !menuChildren.includes(v) && v !== 'All Designers');
  if (missingFromMenu.length) {
    console.log(`  Vendors discovered but missing from menu (${missingFromMenu.length}): ${missingFromMenu.join(', ')}`);
  }

  return { discovered, menuChildren, hasArtisticFrame, menuHasAF };
}

async function auditFilters() {
  console.log('\n=== 4. SEARCH & DISCOVERY FILTERS ===');
  const handles = ['fabric', 'furniture', 'designers'];
  for (const handle of handles) {
    const data = await gql(
      `query CollectionFilters($handle: String!) {
        collectionByHandle(handle: $handle) {
          title
          products(first: 1) {
            filters { id label type values { label count } }
          }
        }
      }`,
      { handle }
    );
    const collection = data.collectionByHandle;
    if (!collection) {
      console.log(`  /collections/${handle}: not found`);
      continue;
    }
    const filters = collection.products?.filters || [];
    console.log(`  /collections/${handle} (${collection.title}): ${filters.length} filters`);
    filters.forEach((f) => {
      const preview = f.values.slice(0, 5).map((v) => v.label).join(', ');
      console.log(`    - ${f.label} (${f.type}, ${f.values.length} values)${preview ? `: ${preview}${f.values.length > 5 ? '…' : ''}` : ''}`);
    });
    const designer = filters.find((f) => f.label.toLowerCase() === 'designer');
    if (!designer) {
      console.log('    ⚠ Designer filter missing — configure Search & Discovery (product.vendor)');
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║ RueIV P0 Live Storefront Audit (read-only)              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Store: ${STORE || '(unset)'} | API: ${VER}`);

  await auditThemes();
  await auditJacksonProduct();
  await auditCustomerAccess();
  await auditDesignersMenu();
  await auditFilters();

  console.log('\n=== AUDIT COMPLETE — no mutations performed ===');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal:', error.message || error);
    process.exit(1);
  });
}

module.exports = { auditThemes, auditJacksonProduct, auditDesignersMenu, auditFilters };
