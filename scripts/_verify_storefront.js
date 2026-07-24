#!/usr/bin/env node
/**
 * Verify what the storefront renders by checking the theme-preview
 * Accesses the store using the password cookie approach
 */
require('dotenv').config();
const store   = process.env.SHOPIFY_STORE;
const token   = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const ver     = process.env.SHOPIFY_API_VERSION;

async function main() {
  const baseUrl = `https://${store}`;
  
  // First, submit password to get cookie
  console.log('Authenticating with store password...');
  const passRes = await fetch(`${baseUrl}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'password=niebow',
    redirect: 'manual'
  });
  
  const cookies = passRes.headers.getSetCookie();
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
  console.log('Status:', passRes.status);
  console.log('Cookies:', cookieStr ? 'Got session' : 'No cookies');
  
  // Now fetch homepage
  console.log('\nFetching homepage...');
  const homeRes = await fetch(baseUrl, {
    headers: { 'Cookie': cookieStr },
    redirect: 'follow'
  });
  const html = await homeRes.text();
  console.log(`Homepage: ${homeRes.status}, ${html.length} bytes`);
  
  // Check for key elements
  console.log('\n=== NAVIGATION CHECK ===');
  const navItems = ['Textiles', 'Wallcovering', 'Furniture', 'Lighting', 'Rugs', 'Accessories', 'The Vibe Studio'];
  for (const item of navItems) {
    console.log(`  ${html.includes(item) ? '✅' : '❌'} ${item}`);
  }
  
  console.log('\n=== MEGA MENU CHECK ===');
  console.log(`  ${html.includes('rv3-grid') ? '✅' : '⚠️ '} rv3-grid class present`);
  console.log(`  ${html.includes('rv3-featured') ? '✅' : '⚠️ '} rv3-featured class present`);
  console.log(`  ${html.includes('rueiv-mega-v3.css') ? '✅' : '❌'} mega v3 CSS loaded`);
  console.log(`  ${html.includes('RueivMegaV3') ? '✅' : '⚠️ '} Mega menu details elements`);
  console.log(`  ${html.includes('mega-menu-rueiv-v3') || html.includes('rv3-') ? '✅' : '⚠️ '} Mega menu markup`);
  
  console.log('\n=== HOMEPAGE SECTIONS CHECK ===');
  console.log(`  ${html.includes('Shop the Showroom') ? '✅' : '⚠️ '} "Shop the Showroom" heading`);
  console.log(`  ${html.includes('Quick Ship') ? '✅' : '⚠️ '} "Quick Ship" section`);
  console.log(`  ${html.includes('Featured Designers') ? '✅' : '⚠️ '} "Featured Designers" heading`);
  console.log(`  ${html.includes('The Vibe Studio') ? '✅' : '✅'} "The Vibe Studio" present`);
  console.log(`  ${html.includes('The Vibe List') ? '✅' : '⚠️ '} "The Vibe List" newsletter`);
  
  console.log('\n=== THEME FILES CHECK ===');
  console.log(`  ${html.includes('rueiv-global.css') ? '✅' : '⚠️ '} rueiv-global.css loaded`);
  console.log(`  ${html.includes('rueiv-fonts.css') ? '✅' : '⚠️ '} rueiv-fonts.css loaded`);
  console.log(`  ${html.includes('smart-filters.css') ? '✅' : '⚠️ '} smart-filters.css loaded`);
  
  // Extract and show the homepage section IDs
  const sectionIdPattern = /id="shopify-section-([^"]+)"/g;
  const sectionIds = [];
  let match;
  while ((match = sectionIdPattern.exec(html)) !== null) {
    sectionIds.push(match[1]);
  }
  console.log(`\n=== RENDERED SECTIONS (${sectionIds.length}) ===`);
  sectionIds.forEach((id, i) => {
    const isShowroom = id.startsWith('showroom_');
    console.log(`  ${i+1}. ${id}${isShowroom ? ' ← SHOWROOM' : ''}`);
  });
  
  // Check footer
  console.log('\n=== FOOTER CHECK ===');
  console.log(`  ${html.includes('footer-company') || html.includes('Company') ? '✅' : '⚠️ '} Company footer menu`);
  console.log(`  ${html.includes('footer-resources') || html.includes('Resources') ? '✅' : '⚠️ '} Resources footer menu`);
}

main().catch(err => console.error('ERROR:', err));
