#!/usr/bin/env node
/**
 * Validate homepage v3 rendering on storefront
 */
const store = 'ruefour.myshopify.com';
const pw = 'niebow';

async function check() {
  // Get password cookie
  const r1 = await fetch('https://' + store + '/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'password=' + pw,
    redirect: 'manual'
  });
  const cookies = r1.headers.getSetCookie?.() || [];
  const cookie = cookies.join('; ');

  // Fetch homepage
  const r2 = await fetch('https://' + store + '/', {
    headers: { 'Cookie': cookie }
  });
  const html = await r2.text();

  // Check for sections
  const sections = [
    'rueiv-hero', 'rueiv-gateway', 'rueiv-vibe',
    'rueiv-trending', 'rueiv-arrivals', 'rueiv-ready',
    'rueiv-testimonials', 'rueiv-events', 'rueiv-newsletter', 'rueiv-banner'
  ];

  console.log('Page length:', html.length);
  console.log('Has rueiv-homepage.css:', html.includes('rueiv-homepage.css'));

  for (const s of sections) {
    const found = html.includes(s);
    console.log(found ? '  ✓' : '  ✗', s);
  }

  if (html.includes('password-page') || html.includes('Enter store using password')) {
    console.log('\n⚠ Still on password page — cookie auth may have failed');
  }
}

check().catch(e => console.error(e));
