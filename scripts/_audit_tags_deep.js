require('dotenv').config();
const https = require('https');
const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const VER = process.env.SHOPIFY_API_VERSION;

function gql(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: STORE, path: `/admin/api/${VER}/graphql.json`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000
    }, res => { let d=''; res.on('data', c => d+=c); res.on('end', () => { try { const j=JSON.parse(d); if(j.errors){console.error(JSON.stringify(j.errors));reject(new Error('GQL'));return;} resolve(j.data); } catch(e){reject(e);} }); });
    req.on('error', reject); req.on('timeout', () => {req.destroy(); reject(new Error('timeout'));}); req.end(body);
  });
}

async function main() {
  // Collect ALL products with their tags, vendor, title
  const products = [];
  let cursor = null;
  
  for (let page = 0; page < 100; page++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{
      products(first: 100${after}) {
        edges {
          cursor
          node { id title vendor productType tags }
        }
        pageInfo { hasNextPage }
      }
    }`);
    
    for (const e of data.products.edges) {
      products.push(e.node);
      cursor = e.cursor;
    }
    
    process.stdout.write(`  Fetched ${products.length} products...\r`);
    if (!data.products.pageInfo.hasNextPage) break;
  }
  
  console.log(`\nTotal products fetched: ${products.length}\n`);

  // Analyze existing category tags
  const catMap = {};        // category → count
  const vendorCatMap = {};  // vendor → { category → count }
  const noCat = [];
  const multiCat = [];
  
  for (const p of products) {
    const cats = p.tags.filter(t => t.startsWith('category:'));
    
    for (const c of cats) {
      catMap[c] = (catMap[c] || 0) + 1;
    }
    
    if (cats.length === 0) noCat.push(p);
    if (cats.length > 1) multiCat.push(p);
    
    if (!vendorCatMap[p.vendor]) vendorCatMap[p.vendor] = {};
    for (const c of cats) {
      vendorCatMap[p.vendor][c] = (vendorCatMap[p.vendor][c] || 0) + 1;
    }
  }

  console.log('━━━ CATEGORY TAG COUNTS ━━━');
  for (const [cat, count] of Object.entries(catMap).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${cat.padEnd(30)} ${count}`);
  }
  
  console.log(`\n  No category tag: ${noCat.length}`);
  console.log(`  Multiple category tags: ${multiCat.length}`);

  console.log('\n━━━ VENDOR → CATEGORY BREAKDOWN ━━━');
  for (const [vendor, cats] of Object.entries(vendorCatMap).sort((a,b) => a[0].localeCompare(b[0]))) {
    const total = Object.values(cats).reduce((s,n) => s+n, 0);
    const catStr = Object.entries(cats).map(([c,n]) => `${c.replace('category:','')}=${n}`).join(', ');
    console.log(`  ${vendor.padEnd(22)} (${total} tags): ${catStr}`);
  }

  // Analyze existing sub-category tags
  console.log('\n━━━ ALL TAG PREFIXES ━━━');
  const tagPrefixes = {};
  for (const p of products) {
    for (const t of p.tags) {
      const prefix = t.includes(':') ? t.split(':')[0] + ':' : '(plain)';
      tagPrefixes[prefix] = (tagPrefixes[prefix] || 0) + 1;
    }
  }
  for (const [prefix, count] of Object.entries(tagPrefixes).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${prefix.padEnd(25)} ${count}`);
  }

  // Show sub-tags for furniture
  console.log('\n━━━ SUBCATEGORY TAGS (sub:*) ━━━');
  const subTags = {};
  for (const p of products) {
    for (const t of p.tags) {
      if (t.startsWith('sub:') || t.startsWith('subcategory:') || t.startsWith('type:')) {
        subTags[t] = (subTags[t] || 0) + 1;
      }
    }
  }
  for (const [tag, count] of Object.entries(subTags).sort((a,b) => b[1]-a[1]).slice(0, 30)) {
    console.log(`  ${tag.padEnd(40)} ${count}`);
  }

  // Porta Romana deep dive — what are the actual product types?
  console.log('\n━━━ PORTA ROMANA — TITLE KEYWORD ANALYSIS ━━━');
  const prProducts = products.filter(p => p.vendor === 'Porta Romana');
  const keywords = { lamp: 0, light: 0, chandelier: 0, pendant: 0, table: 0, mirror: 0, chair: 0, stool: 0, cabinet: 0, other: 0 };
  for (const p of prProducts) {
    const t = p.title.toLowerCase();
    if (t.includes('lamp')) keywords.lamp++;
    else if (t.includes('light') || t.includes('sconce') || t.includes('bulkhead')) keywords.light++;
    else if (t.includes('chandelier')) keywords.chandelier++;
    else if (t.includes('pendant')) keywords.pendant++;
    else if (t.includes('table')) keywords.table++;
    else if (t.includes('mirror')) keywords.mirror++;
    else if (t.includes('chair') || t.includes('stool') || t.includes('bench')) keywords.chair++;
    else if (t.includes('cabinet') || t.includes('console') || t.includes('sideboard')) keywords.cabinet++;
    else keywords.other++;
  }
  console.log(`  Total: ${prProducts.length}`);
  for (const [k, v] of Object.entries(keywords)) {
    if (v > 0) console.log(`    ${k.padEnd(15)} ${v}`);
  }

  // Verellen deep dive
  console.log('\n━━━ VERELLEN — TAG ANALYSIS (sample 30) ━━━');
  const vProducts = products.filter(p => p.vendor === 'Verellen').slice(0, 30);
  for (const p of vProducts) {
    const allTags = p.tags.join(', ');
    console.log(`  ${p.title.substring(0, 35).padEnd(37)} tags=[${allTags.substring(0, 80)}]`);
  }

  // Alexander Lamont deep dive
  console.log('\n━━━ ALEXANDER LAMONT — TAG ANALYSIS (sample 20) ━━━');
  const alProducts = products.filter(p => p.vendor === 'Alexander Lamont').slice(0, 20);
  for (const p of alProducts) {
    const allTags = p.tags.join(', ');
    console.log(`  ${p.title.substring(0, 35).padEnd(37)} tags=[${allTags.substring(0, 80)}]`);
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
