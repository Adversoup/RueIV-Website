require('dotenv').config();
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API   = process.env.SHOPIFY_API_VERSION || '2026-04';
const GQL   = `https://${STORE}/admin/api/${API}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

const PAGES_TO_CREATE = [
  { handle: 'moodboards',          title: 'Moodboards',          template: 'moodboards' },
  { handle: 'sustainability',      title: 'Sustainability',      template: 'sustainability' },
  { handle: 'designer-spotlight',  title: 'Designer Spotlight',  template: 'designer-spotlight' },
];

async function main() {
  // Check existing pages
  for (const page of PAGES_TO_CREATE) {
    const existing = await gql(`{
      pages(first: 1, query: "handle:${page.handle}") {
        nodes { id title handle }
      }
    }`);

    if (existing.pages.nodes.length > 0) {
      console.log(`  ⏭  "${page.title}" already exists (${existing.pages.nodes[0].id})`);
      continue;
    }

    const result = await gql(`
      mutation pageCreate($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { id title handle }
          userErrors { field message }
        }
      }
    `, {
      page: {
        title: page.title,
        handle: page.handle,
        templateSuffix: page.template,
        isPublished: true
      }
    });

    if (result.pageCreate.userErrors.length) {
      console.error(`  ✗ "${page.title}":`, result.pageCreate.userErrors);
    } else {
      console.log(`  ✓ "${page.title}" created → ${result.pageCreate.page.id} (template: ${page.template})`);
    }
  }

  // Also verify about page has correct template
  const aboutPages = await gql(`{
    pages(first: 1, query: "handle:about") {
      nodes { id title handle templateSuffix }
    }
  }`);

  if (aboutPages.pages.nodes.length > 0) {
    const about = aboutPages.pages.nodes[0];
    if (about.templateSuffix !== 'about') {
      const upd = await gql(`
        mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page { id templateSuffix }
            userErrors { field message }
          }
        }
      `, { id: about.id, page: { templateSuffix: 'about' } });
      console.log(`  ↻ About page template updated to "about"`);
    } else {
      console.log(`  ✓ About page already has template "about"`);
    }
  } else {
    // Create about page if it doesn't exist
    const result = await gql(`
      mutation pageCreate($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { id title handle }
          userErrors { field message }
        }
      }
    `, {
      page: { title: 'About', handle: 'about', templateSuffix: 'about', isPublished: true }
    });
    console.log(`  ✓ About page created → ${result.pageCreate.page.id}`);
  }

  console.log('\nDone.');
}

main().catch(e => console.error(e));
