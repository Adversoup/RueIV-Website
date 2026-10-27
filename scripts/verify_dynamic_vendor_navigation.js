#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildVendorSpecs,
  buildDesignerHttpItems,
  handleize,
  normalizeVendorName,
} = require('./lib/vendor_navigation');
const {
  collectionForVendor,
  discoverSubBrandNames,
  planVendorNavigationSync,
  runFixtureDryRunProof,
  FIXTURE_VENDOR_NAMES,
  FIXTURE_COLLECTION_INDEX,
} = require('./fix_vendors');

const discovered = [
  'Arte',
  'Artistic Frame',
  'Zimmer + Rohde',
  'Porta Romana',
  '  Artistic   Frame  ',
  '',
];

const specs = buildVendorSpecs(discovered);
assert.deepStrictEqual(
  specs.map((x) => x.title),
  ['Arte', 'Artistic Frame', 'Porta Romana', 'Zimmer + Rohde']
);
assert.strictEqual(specs.find((x) => x.title === 'Artistic Frame').handle, 'artistic-frame');
assert.strictEqual(handleize('Zimmer + Rohde'), 'zimmer-rohde');
assert.strictEqual(normalizeVendorName('  Artistic   Frame '), 'Artistic Frame');

// Core invariant: output follows input. A vendor not present in discovery must
// not magically appear from a hardcoded menu list.
const withoutAf = buildVendorSpecs(['Arte', 'Porta Romana']);
assert.strictEqual(withoutAf.some((x) => x.title === 'Artistic Frame'), false);

const itemFactory = (title, path) => ({ title, url: `https://example.test${path}`, type: 'HTTP' });
const megaMenuItems = buildDesignerHttpItems(specs, itemFactory);
assert.strictEqual(
  megaMenuItems.some((item) => item.title === 'Artistic Frame' && item.url.includes('/collections/artistic-frame')),
  true
);

const artisticSpec = { title: 'Artistic Frame', vendor: 'Artistic Frame', handle: 'artistic-frame' };
assert.strictEqual(collectionForVendor(artisticSpec, FIXTURE_COLLECTION_INDEX), null);
assert.strictEqual(
  collectionForVendor({ title: 'Arte', vendor: 'Arte', handle: 'arte' }, FIXTURE_COLLECTION_INDEX).handle,
  'arte'
);

const plan = planVendorNavigationSync(FIXTURE_VENDOR_NAMES, FIXTURE_COLLECTION_INDEX, {
  storeHost: 'ruefour.myshopify.com',
});
assert.strictEqual(plan.collectionsToCreate.some((spec) => spec.title === 'Artistic Frame'), true);
assert.strictEqual(plan.designersChildren.some((item) => item.title === 'Artistic Frame'), true);
plan.designersChildren.forEach((item) => {
  if (item.type === 'COLLECTION') assert.ok(item.resourceId);
  if (item.type === 'HTTP') assert.ok(item.url);
});

// Regression: JAB's canonical handle exists but is empty; a numbered
// Shopify collection contains the actual product assortment.
const jab = { title: 'JAB', vendor: 'JAB', handle: 'jab' };
const jabEmpty = { id: 'gid://shopify/Collection/101', handle: 'jab', title: 'JAB', productCount: 0 };
const jabLive = { id: 'gid://shopify/Collection/172', handle: 'jab-172', title: 'JAB', productCount: 180 };
const jabIndex = {
  byHandle: new Map([['jab', jabEmpty], ['jab-172', jabLive]]),
  byTitle: new Map([['jab', jabLive]]),
};
assert.strictEqual(collectionForVendor(jab, jabIndex).handle, 'jab-172');
assert.strictEqual(
  planVendorNavigationSync(['JAB'], jabIndex, { storeHost: 'ruefour.myshopify.com' })
    .designersChildren.find((x) => x.title === 'JAB').resourceId,
  jabLive.id
);
const staleIndex = { byHandle: new Map([['jab', jabEmpty]]), byTitle: new Map([['jab', jabEmpty]]) };
const fallback = planVendorNavigationSync(['JAB'], staleIndex, { storeHost: 'ruefour.myshopify.com' });
assert.strictEqual(fallback.collectionsToCreate.length, 0);
assert.ok(fallback.designersChildren.find((x) => x.title === 'JAB').url.includes('/collections/vendors?q=JAB'));


const jabChivasso = { id:'gid://shopify/Collection/195', handle:'jab-chivasso', title:'JAB — Chivasso', productCount:44 };
const jabCarlucci = { id:'gid://shopify/Collection/196', handle:'jab-carlucci', title:'JAB — Carlucci', productCount:19 };
const ignoredEmpty = { id:'gid://shopify/Collection/197', handle:'jab-dead', title:'JAB — Dead', productCount:0 };
const hierarchyIndex = {
  byHandle:new Map([[jabEmpty.handle,jabEmpty],[jabLive.handle,jabLive],
                    [jabChivasso.handle,jabChivasso],[jabCarlucci.handle,jabCarlucci],
                    [ignoredEmpty.handle,ignoredEmpty]]),
  byTitle:new Map([['jab',jabEmpty],['jab — chivasso',jabChivasso],['jab — carlucci',jabCarlucci]])
};
assert.deepStrictEqual(
  discoverSubBrandNames(['JAB'],hierarchyIndex),
  ['JAB','Chivasso','Carlucci']
);
const expandedPlan=planVendorNavigationSync(['JAB'],hierarchyIndex,{storeHost:'ruefour.myshopify.com'});
assert.deepStrictEqual(
  expandedPlan.vendorSpecs.map(x=>x.title),
  ['Carlucci','Chivasso','JAB']
);
assert.strictEqual(expandedPlan.designersChildren.find(x=>x.title==='Chivasso').resourceId,jabChivasso.id);
assert.strictEqual(expandedPlan.designersChildren.find(x=>x.title==='Carlucci').resourceId,jabCarlucci.id);
assert.ok(!expandedPlan.designersChildren.some(x=>x.title==='Dead'));

runFixtureDryRunProof();

console.log('VERIFY OK — vendor navigation is data-driven and deterministic');
