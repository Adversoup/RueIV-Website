#!/usr/bin/env node
require('dotenv').config();

const store = process.env.SHOPIFY_STORE;
const pw = process.env.SHOPIFY_STORE_PASSWORD;
const devThemeId = 156515532931;

async function check() {
  // 1. Get password page for CSRF token
  const pwRes = await fetch(`https://${store}/password`, { redirect: 'manual' });
  const pwHtml = await pwRes.text();
  const tokenMatch = pwHtml.match(/name="authenticity_token".*?value="([^"]+)"/);
  const token = tokenMatch ? tokenMatch[1] : '';
  const cookies = pwRes.headers.getSetCookie ? pwRes.headers.getSetCookie() : [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  // 2. POST the password
  const loginRes = await fetch(`https://${store}/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieStr,
    },
    body: `utf8=%E2%9C%93&authenticity_token=${encodeURIComponent(token)}&password=${encodeURIComponent(pw)}`,
    redirect: 'manual',
  });

  const loginCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
  const allCookies = [...cookies, ...loginCookies].map(c => c.split(';')[0]).join('; ');

  // 3. Fetch dev theme preview
  const homeRes = await fetch(`https://${store}/`, {
    headers: { Cookie: allCookies },
    redirect: 'follow',
  });
  const html = await homeRes.text();

  // Check if still on password page
  if (html.includes('password-content') || html.includes('Enter store password')) {
    console.log('WARNING: Still on password page');
    return;
  }

  // 4. Find mega-menu details element
  const megaStart = html.indexOf('is="details-mega"');
  if (megaStart < 0) {
    console.log('No details-mega element found');
    const shopIdx = html.indexOf('>Shop<');
    if (shopIdx >= 0) {
      console.log('=== Shop link context ===');
      console.log(html.substring(Math.max(0, shopIdx - 500), shopIdx + 2000));
    } else {
      console.log('No Shop link found either');
      const headerNavIdx = html.indexOf('header__navigation');
      if (headerNavIdx >= 0) {
        console.log('=== header__navigation context ===');
        console.log(html.substring(headerNavIdx, headerNavIdx + 3000));
      }
    }
    return;
  }

  // Get the full mega menu HTML
  const detailsStart = html.lastIndexOf('<details', megaStart);
  const detailsEnd = html.indexOf('</details>', megaStart);
  if (detailsStart >= 0 && detailsEnd >= 0) {
    const megaHtml = html.substring(detailsStart, detailsEnd + 10);
    console.log('=== MEGA MENU HTML (' + megaHtml.length + ' chars) ===');
    console.log(megaHtml.substring(0, 6000));
    if (megaHtml.length > 6000) console.log('... [truncated, total ' + megaHtml.length + ' chars]');
  }
}

check().catch(console.error);
