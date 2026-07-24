#!/usr/bin/env node
/**
 * create_pages.js — Create RueIV pages in Shopify Admin and assign templates.
 * Run: node scripts/create_pages.js
 */
require('dotenv/config');

const STORE  = process.env.SHOPIFY_STORE;
const TOKEN  = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_V  = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL    = `https://${STORE}/admin/api/${API_V}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

// Pages to create — handle → { title, body_html, template_suffix }
const PAGES = [
  {
    title: 'Our Brands',
    handle: 'brands',
    body_html: '<p>Explore the premium brands curated by Rue IV — from heritage mills to contemporary studios.</p>',
    template_suffix: 'brand',
  },
  {
    title: 'The Vibe Studio',
    handle: 'vibe-studio',
    body_html: '<p>Shop curated room scenes. Every vibe tells a story — find yours.</p>',
    template_suffix: 'vibe-studio',
  },
  {
    title: 'Events',
    handle: 'events',
    body_html: '<p>Design shows, trade days, and exclusive previews — join us.</p>',
    template_suffix: 'events',
  },
  {
    title: 'Portfolio',
    handle: 'portfolio',
    body_html: '<p>Browse completed design projects featuring Rue IV products.</p>',
    template_suffix: 'portfolio',
  },
  {
    title: 'The Vibe List',
    handle: 'newsletter',
    body_html: '<p>Join The Vibe List for exclusive access to new arrivals, events, and curated design guides.</p>',
    template_suffix: 'newsletter',
  },
  {
    title: 'Terms of Service',
    handle: 'terms',
    body_html: `<h2>Terms of Service</h2>
<p>These Terms of Service govern your use of the Rue IV website and purchase of products. By accessing or using our site, you agree to these terms.</p>
<h3>Orders &amp; Pricing</h3>
<p>All prices are in USD and subject to change. We reserve the right to cancel orders due to pricing errors or stock availability.</p>
<h3>Intellectual Property</h3>
<p>All content on this website is the property of Rue IV and may not be reproduced without permission.</p>
<h3>Limitation of Liability</h3>
<p>Rue IV shall not be liable for any indirect, incidental, or consequential damages arising from the use of our products or website.</p>
<p>For questions, contact us at hello@ruefour.com.</p>`,
    template_suffix: 'policies',
  },
  {
    title: 'Shipping Policy',
    handle: 'shipping-policy',
    body_html: `<h2>Shipping Policy</h2>
<h3>Processing Time</h3>
<p>Orders are processed within 2–5 business days. Custom and made-to-order items may require additional lead times, which will be communicated at checkout.</p>
<h3>Shipping Methods</h3>
<p>We offer standard and expedited shipping options. White-glove delivery is available for furniture orders.</p>
<h3>International Shipping</h3>
<p>We currently ship within the United States. International trade orders are handled on a case-by-case basis — please contact us.</p>
<h3>Tracking</h3>
<p>You will receive a tracking number via email once your order ships.</p>`,
    template_suffix: 'policies',
  },
  {
    title: 'Returns & Exchanges',
    handle: 'returns',
    body_html: `<h2>Returns &amp; Exchanges</h2>
<h3>Return Window</h3>
<p>We accept returns within 14 days of delivery for most items in original, unused condition.</p>
<h3>Non-Returnable Items</h3>
<p>Cut-to-order fabrics, custom wallpaper, and sale items are final sale.</p>
<h3>How to Return</h3>
<p>Contact us at hello@ruefour.com with your order number. We will provide a return authorization and shipping instructions.</p>
<h3>Refunds</h3>
<p>Refunds are processed within 5–7 business days after we receive the returned item.</p>`,
    template_suffix: 'policies',
  },
];

const CREATE_PAGE = `
  mutation pageCreate($page: PageCreateInput!) {
    pageCreate(page: $page) {
      page { id handle title }
      userErrors { field message }
    }
  }
`;

const UPDATE_TEMPLATE = `
  mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle templateSuffix }
      userErrors { field message }
    }
  }
`;

// Check existing pages
const LIST_PAGES = `
  query {
    pages(first: 100) {
      nodes { id handle title templateSuffix }
    }
  }
`;

async function main() {
  console.log('Fetching existing pages...');
  const existing = await gql(LIST_PAGES);
  const existingMap = new Map(existing.pages.nodes.map(p => [p.handle, p]));

  for (const page of PAGES) {
    const ex = existingMap.get(page.handle);
    if (ex) {
      console.log(`  ✓ Page "${page.title}" already exists (${ex.id}), updating template → ${page.template_suffix}`);
      const data = await gql(UPDATE_TEMPLATE, {
        id: ex.id,
        page: { templateSuffix: page.template_suffix },
      });
      const errs = data.pageUpdate?.userErrors;
      if (errs?.length) console.error('    errors:', errs);
      else console.log(`    → template set to "${page.template_suffix}"`);
      continue;
    }

    console.log(`  + Creating "${page.title}"...`);
    const data = await gql(CREATE_PAGE, {
      page: {
        title: page.title,
        handle: page.handle,
        body: page.body_html,
        templateSuffix: page.template_suffix,
        isPublished: true,
      },
    });
    const errs = data.pageCreate?.userErrors;
    if (errs?.length) {
      console.error(`    ✗ errors:`, errs);
    } else {
      console.log(`    → created ${data.pageCreate.page.id} (/${data.pageCreate.page.handle})`);
    }
  }

  // Also update existing About page template if it exists
  const aboutPage = existingMap.get('about');
  if (aboutPage && aboutPage.templateSuffix !== 'about') {
    console.log(`  Updating About page template → about`);
    await gql(UPDATE_TEMPLATE, { id: aboutPage.id, page: { templateSuffix: 'about' } });
  }

  // Also update existing Contact page template
  const contactPage = existingMap.get('contact');
  if (contactPage && contactPage.templateSuffix !== 'contact') {
    console.log(`  Updating Contact page template → contact`);
    await gql(UPDATE_TEMPLATE, { id: contactPage.id, page: { templateSuffix: 'contact' } });
  }

  console.log('\nDone. All pages created/updated.');
}

main().catch(err => { console.error(err); process.exit(1); });
