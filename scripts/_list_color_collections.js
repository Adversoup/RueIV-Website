require('dotenv').config();
const S=process.env.SHOPIFY_STORE, T=process.env.SHOPIFY_ADMIN_ACCESS_TOKEN, V=process.env.SHOPIFY_API_VERSION;
async function run() {
  let cursor=null, hasNext=true, cols=[];
  while(hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const r = await fetch(`https://${S}/admin/api/${V}/graphql.json`, {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Shopify-Access-Token':T},
      body: JSON.stringify({query:`{collections(first:100${after}){edges{node{id handle title productsCount{count}}cursor}pageInfo{hasNextPage}}}`})
    });
    const j = await r.json();
    for (const e of j.data.collections.edges) {
      cols.push({handle:e.node.handle, title:e.node.title, count:e.node.productsCount?.count||0});
      cursor = e.cursor;
    }
    hasNext = j.data.collections.pageInfo.hasNextPage;
  }
  const endUses = ['upholstery','drapery','multipurpose','performance','bedding','decorative','sheer'];
  const cats = ['fabric','wallpaper','furniture','lighting'];
  for (const cat of cats) {
    const cc = cols.filter(c => c.handle.startsWith(cat+'-') && !endUses.some(eu => c.handle === cat+'-'+eu));
    if (cc.length) {
      console.log(`\n${cat.toUpperCase()}:`);
      cc.forEach(c => console.log(`  ${c.handle.padEnd(30)} ${c.title.padEnd(25)} (${c.count} products)`));
    }
  }
}
run();
