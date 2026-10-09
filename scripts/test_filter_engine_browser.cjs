/* Local cross-repository integration. Requires playwright; uses synthetic cards. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { Liquid } = require('liquidjs');

async function main() {
  let backend;
  if (process.env.FILTER_TEST_SOURCE) {
    backend = spawn(process.env.FILTER_TEST_PYTHON || 'python', ['-m', 'uvicorn', 'tests.filter_engine_fixture_server:app', '--host', '127.0.0.1', '--port', '9362', '--log-level', 'warning'], { cwd: process.env.FILTER_TEST_SOURCE, env: process.env, stdio: 'inherit' });
    process.on('exit', () => backend.kill());
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { const r = await fetch('http://127.0.0.1:9362/storefront/v1/filter'); if (r.ok) { ready = true; break; } } catch { /* Wait for fixture startup. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Python API fixture did not start');
  }
  const api = process.env.FILTER_TEST_API_URL || 'http://127.0.0.1:9362/storefront/v1/filter';
  const root = path.resolve(__dirname, '..');
  const engine = new Liquid();
  engine.registerFilter('asset_url', name => `/assets/${name}`);
  engine.registerFilter('stylesheet_tag', url => `<link rel="stylesheet" href="${url}">`);
  const source = fs.readFileSync(path.join(root, 'theme/sections/rueiv-filter-engine.liquid'), 'utf8').replace(/{% schema %}[\s\S]*?{% endschema %}/, '');
  const html = await engine.parseAndRender(source, {
    section: { settings: { enabled: true, endpoint: api } },
    collection: { handle: 'textiles', title: 'Textiles' }, routes: { root_url: '/' }
  });
  const cards = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1:9361');
    if (url.pathname.startsWith('/assets/')) {
      const name = path.basename(url.pathname);
      response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/css');
      response.end(fs.readFileSync(path.join(root, 'theme/assets', name))); return;
    }
    if (url.pathname.startsWith('/products/')) {
      const handle = url.pathname.split('/').pop();
      cards.push({ handle, view: url.searchParams.get('view'), preview: url.searchParams.get('preview_theme_id'), cookie: request.headers.cookie || '' });
      response.setHeader('Content-Type', 'text/html');
      // Synthetic native card: proves session forwarding, not Shopify price-policy correctness.
      response.end(`<div data-rueiv-card="${handle}"><a href="/products/${handle}">${handle}</a>${request.headers.cookie?.includes('trade=yes') ? '<span data-fixture-price>$100</span>' : ''}</div>`); return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><body>${html}<div id="shopify-section-main-collection-product-grid">Standard collection</div></body></html>`);
  });
  await new Promise(resolve => server.listen(9361, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.FILTER_TEST_BROWSER_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:9361/collections/textiles?view=rueiv-filter&preview_theme_id=preview-fixture');
    await page.getByRole('status').filter({ hasText: '40,001 products' }).waitFor();
    assert.equal(await page.locator('[data-grid] [data-rueiv-card]').count(), 24);
    assert.equal(await page.locator('[data-fixture-price]').count(), 0);
    assert.equal(await page.locator('#shopify-section-main-collection-product-grid').isVisible(), false);
    assert.ok(cards.every(card => card.view === 'rueiv-filter-card' && card.preview === 'preview-fixture'));
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.locator('[data-page]').filter({ hasText: 'Page 2 of 1667' }).waitFor();
    assert.equal(await page.locator('[data-grid] [data-rueiv-card]').first().getAttribute('data-rueiv-card'), 'product-000024');
    await page.locator('summary').filter({ hasText: 'Color Family' }).click();
    await page.getByLabel('Blue (20000)', { exact: true }).check();
    await page.getByRole('status').filter({ hasText: '20,000 products' }).waitFor();
    assert.ok(new URL(page.url()).searchParams.getAll('rf.color_family').includes('Blue'));
    await page.goBack();
    await page.getByRole('status').filter({ hasText: '40,001 products' }).waitFor();
    await page.getByLabel('Search this collection', { exact: true }).fill('No matching product');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '0 products' }).waitFor();
    assert.equal(await page.locator('[data-grid] [data-rueiv-card]').count(), 0);
    await context.addCookies([{ name: 'trade', value: 'yes', url: 'http://127.0.0.1:9361' }]);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('status').filter({ hasText: '40,001 products' }).waitFor();
    assert.equal(await page.locator('[data-fixture-price]').count(), 24);
    assert.ok(cards.slice(-24).every(card => card.cookie.includes('trade=yes')));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('[data-grid]').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.route('**/storefront/v1/filter?**', route => route.fulfill({ status: 503, body: '{}' }));
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'temporarily unavailable' }).waitFor();
    assert.equal(await page.locator('#shopify-section-main-collection-product-grid').isVisible(), true);
    assert.equal(await page.locator('[data-grid]').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('PASS: real API + rendered Liquid section + browser: 40,001 products, pagination, facets, history, zero results, session forwarding, preview context, mobile, outage fallback.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); backend?.kill(); }
}
main().catch(error => { console.error(error); process.exit(1); });
