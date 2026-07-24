#!/usr/bin/env node
/**
 * One-time OAuth helper – starts a local server, redirects to Shopify,
 * exchanges the auth code for an offline access token, and saves it to .env
 *
 * Usage:  node scripts/auth.js
 * Then open http://localhost:3000/auth in your browser.
 */

const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { URL } = require('url');

/* ── Config ─────────────────────────────────────────────── */
const STORE        = process.env.SHOPIFY_STORE || 'ruefour.myshopify.com';
const API_KEY      = process.env.SHOPIFY_API_KEY;
const API_SECRET   = process.env.SHOPIFY_API_SECRET;
const SCOPES       = 'read_products,write_products,read_publications,write_publications,read_online_store_navigation,write_online_store_navigation,write_files,read_files,read_themes,write_themes,read_content,write_content';
const REDIRECT_URI = 'http://localhost:3300/auth/callback';
const PORT         = 3300;
const ENV_PATH     = path.resolve(__dirname, '..', '.env');

const nonce = crypto.randomBytes(16).toString('hex');

/* ── Helpers ────────────────────────────────────────────── */
function postJSON(hostname, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      { hostname, path: urlPath, method: 'POST',
        headers: { 'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try   { resolve(JSON.parse(buf)); }
          catch { reject(new Error(`Bad JSON: ${buf}`)); }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function upsertEnv(key, value) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) content = fs.readFileSync(ENV_PATH, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, `${key}=${value}`);
  } else {
    content += `${content.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, content);
}

/* ── Server ─────────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  /* Step 1 – redirect to Shopify OAuth consent screen */
  if (u.pathname === '/auth') {
    const authURL =
      `https://${STORE}/admin/oauth/authorize` +
      `?client_id=${API_KEY}` +
      `&scope=${SCOPES}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${nonce}`;   // offline token (no per-user = permanent)

    res.writeHead(302, { Location: authURL });
    return res.end();
  }

  /* Step 2 – exchange code for token */
  if (u.pathname === '/auth/callback') {
    const code  = u.searchParams.get('code');
    const state = u.searchParams.get('state');

    if (state !== nonce) {
      res.writeHead(403);
      return res.end('State mismatch – possible CSRF');
    }

    try {
      const json = await postJSON(STORE, '/admin/oauth/access_token', {
        client_id: API_KEY,
        client_secret: API_SECRET,
        code,
      });

      if (!json.access_token) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('No access_token in response:\n' + JSON.stringify(json, null, 2));
      }

      /* Save to .env */
      upsertEnv('SHOPIFY_STORE', STORE);
      upsertEnv('SHOPIFY_TOKEN', json.access_token);
      upsertEnv('SHOPIFY_ADMIN_ACCESS_TOKEN', json.access_token);
      upsertEnv('SHOPIFY_API_VERSION', '2026-04');

      console.log('\n✅  Access token saved to .env');
      console.log(`   Scope: ${json.scope}`);
      console.log('   You can now close this server (Ctrl-C) and run the import.\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        `<h1>&#9989; Authorised!</h1>` +
        `<p>Access token written to <code>.env</code></p>` +
        `<p>Scope: <code>${json.scope}</code></p>` +
        `<p>You can close this tab and press <kbd>Ctrl-C</kbd> in the terminal.</p>`
      );

      setTimeout(() => process.exit(0), 500);
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Token exchange failed: ' + err.message);
    }
    return;
  }

  /* Landing page */
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    `<h1>RueIV Importer &mdash; Shopify Auth</h1>` +
    `<p><a href="/auth">Click here to authorise the app on <strong>${STORE}</strong></a></p>`
  );
});

server.listen(PORT, () => {
  console.log(`\n🔐  Auth server running at http://localhost:${PORT}`);
  console.log(`👉  Open http://localhost:${PORT}/auth in your browser to start OAuth\n`);
});
