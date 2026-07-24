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
    }, res => { let d=''; res.on('data', c => d+=c); res.on('end', () => { try { const j=JSON.parse(d); resolve(j.data); } catch(e){reject(e);} }); });
    req.on('error', reject); req.on('timeout', () => {req.destroy(); reject(new Error('timeout'));}); req.end(body);
  });
}

async function main() {
  const all = {};
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const data = await gql(`{ collections(first: 250${after}) { edges { cursor node { id handle title productsCount { count } ruleSet { rules { column relation condition } } } } pageInfo { hasNextPage } } }`);
    for (const e of data.collections.edges) {
      all[e.node.handle] = { id: e.node.id, title: e.node.title, count: e.node.productsCount.count, rules: e.node.ruleSet?.rules || [] };
      cursor = e.cursor;
    }
    if (!data.collections.pageInfo.hasNextPage) break;
  }

  console.log(`Total existing: ${Object.keys(all).length}\n`);

  // Desired handles
  const desired = [
    'textiles','textiles-upholstery','textiles-drapery','textiles-sheers','textiles-decorative','textiles-leather','textiles-outdoor',
    'wallcovering','wallcovering-wallpapers','wallcovering-hand-painted','wallcovering-murals','wallcovering-naturals','wallcovering-leather','wallcovering-metallic','wallcovering-textures','wallcovering-florals','wallcovering-geometric','wallcovering-animal-skin','wallcovering-vinyl',
    'lighting','lighting-ceiling-lights','lighting-pendants','lighting-flush-mounts','lighting-wall-lights','lighting-table-lamps','lighting-floor-lamps','lighting-portable-lamps','lighting-bathroom-lighting','lighting-lampshades','lighting-outdoor','lighting-quick-ship',
    'furniture','furniture-living-room','furniture-dining-room','furniture-bedroom','furniture-office','furniture-seating','furniture-sofas','furniture-sectionals','furniture-occasional-chairs','furniture-dining-chairs','furniture-stools','furniture-benches-ottomans','furniture-beds','furniture-tables','furniture-dining-tables','furniture-coffee-tables','furniture-side-tables','furniture-bedside-tables','furniture-consoles','furniture-desks','furniture-casegoods','furniture-cabinets','furniture-sideboards','furniture-floor-display','furniture-quick-ship',
    'rugs','rugs-quick-ship',
    'accessories','accessories-cushions','accessories-mirrors','accessories-objects','accessories-throws',
    'designers','alexander-lamont','altura','area-environments','arte','c-c-milano','casamance','chase-erwin','clarence-house','de-le-cuona','elitis','ferrick-mason','george-spencer','hartmann-forbes','innovations','j-samuel','jab','jean-monro','jennifer-shorto','liberty-of-london','marika-meyer','mark-phillips','mj-atelier','olivia-barry','paola-melendez-casa','porta-romana','powell-bonnell','rosemary-hallgarten','the-vale-london','tomlinson-companies','verellen','victoria-larson','zimmer-rohde',
    'quick-ship'
  ];

  const exists = [];
  const missing = [];
  for (const h of desired) {
    if (all[h]) exists.push(h);
    else missing.push(h);
  }

  console.log('━━━ EXISTING (will keep) ━━━');
  for (const h of exists) {
    const c = all[h];
    console.log(`  ✓ ${h.padEnd(30)} "${c.title}" (${c.count} products)`);
  }

  console.log(`\n━━━ MISSING (need to create: ${missing.length}) ━━━`);
  for (const h of missing) {
    console.log(`  ✗ ${h}`);
  }

  // Check old handles that might be replaced
  const oldHandles = ['fabric', 'fabric-upholstery', 'fabric-drapery', 'fabric-sheer', 'fabric-decorative', 'fabric-leather',
    'wallpaper', 'ceiling-light', 'pendant', 'flush-mount', 'wall-light', 'table-lamp', 'floor-lamp',
    'outdoor-lighting', 'outdoor', 'cc-milano', 'fabricut', 'zr'];
  
  console.log('\n━━━ OLD HANDLES (potential cleanup) ━━━');
  for (const h of oldHandles) {
    if (all[h]) {
      console.log(`  ⚠ ${h.padEnd(25)} "${all[h].title}" (${all[h].count} products) — may need removal/update`);
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
