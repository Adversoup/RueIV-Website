#!/usr/bin/env node
require('dotenv').config();
const store = process.env.SHOPIFY_STORE;

async function main() {
  // Authenticate
  const passRes = await fetch(`https://${store}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'password=niebow',
    redirect: 'manual'
  });
  const cookies = passRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');

  const homeRes = await fetch(`https://${store}`, {
    headers: { 'Cookie': cookies },
    redirect: 'follow'
  });
  const html = await homeRes.text();

  // Extract each showroom section's actual HTML content
  const sections = ['showroom_categories', 'showroom_quickship', 'showroom_designers', 'showroom_vibe', 'showroom_newsletter'];
  
  for (const sec of sections) {
    const pattern = new RegExp(`id="shopify-section-[^"]*${sec}"[^>]*>([\\s\\S]*?)(?=<\\/div>\\s*<div[^>]*id="shopify-section-)`, 'i');
    // Simpler approach: find the section div and grab content
    const startTag = `${sec}`;
    const idx = html.indexOf(startTag);
    if (idx === -1) {
      console.log(`\n=== ${sec} === NOT FOUND IN HTML`);
      continue;
    }
    
    // Get 2000 chars after the section ID
    const snippet = html.substring(idx - 50, idx + 2000);
    // Clean up - show just meaningful content
    const textOnly = snippet.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
    console.log(`\n=== ${sec} ===`);
    console.log(`Text content: ${textOnly || '(EMPTY)'}`);
    
    // Check if section has actual visible content
    const sectionHtml = html.substring(idx - 50, idx + 3000);
    const hasImages = sectionHtml.includes('<img') || sectionHtml.includes('image_url');
    const hasLinks = (sectionHtml.match(/<a\s/g) || []).length;
    const hasHeading = sectionHtml.includes('<h1') || sectionHtml.includes('<h2') || sectionHtml.includes('<h3');
    console.log(`Has images: ${hasImages}, Links: ${hasLinks}, Has heading: ${hasHeading}`);
    
    // Show raw HTML (first 1000 chars)
    console.log(`Raw HTML (first 800):`, sectionHtml.substring(0, 800));
  }
  
  // Also check: is the image_with_text_overlay section rendering?
  console.log('\n\n=== CHECKING EXISTING SECTION: image_with_text_overlay_QaCmnT ===');
  const eIdx = html.indexOf('image_with_text_overlay_QaCmnT');
  if (eIdx >= 0) {
    const esnippet = html.substring(eIdx - 50, eIdx + 1000);
    const etext = esnippet.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
    console.log(`Text: ${etext}`);
  } else {
    console.log('NOT FOUND');
  }
}
main().catch(console.error);
