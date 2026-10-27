'use strict';

/**
 * Navigation destinations must be real, populated Shopify collections.
 * One top-level product_type is not a subcategory; never point a "Sofas" link
 * back to the unfiltered Furniture collection. No Shopify writes in this file.
 *
 * Navigation labels represent owner-approved storefront choices, not G0 SKUs.
 * Actual membership comes exclusively from canonical Hub taxonomy tags/
 * metafields delivered to Shopify and confirmed by live collection readback.
 */
const DESTINATIONS = Object.freeze({
  'textiles-quality': {
    'All Textiles':'fabric', 'Upholstery':'textiles-upholstery',
    'Drapery':'textiles-drapery', 'Sheers':'textiles-sheer',
    'Decorative':'textiles-decorative', 'Performance':'textiles-performance',
    'Outdoor':'textiles-outdoor',
  },
  'wallcovering-materials': {
    'All Wallcovering':'wallpaper', 'Wallpapers':'wallpaper',
    'Naturals':'wallcovering-naturals', 'Hand Painted':'wallcovering-hand-painted',
    'Vinyl':'wallcovering-vinyl', 'Murals':'wallcovering-murals',
    'Leather':'wallcovering-leather', 'Metallic':'wallcovering-metallic'
  },
  'wallcovering-design': {
    'All':'wallpaper', 'Textures':'wallcovering-textures',
    'Florals':'wallcovering-florals', 'Geometric':'wallcovering-geometric',
    'Animal/Skin':'wallcovering-animal'
  },
  'lighting-type': {
    'All Lighting':'lighting', 'Table Lamps':'lighting-table-lamps',
    'Floor Lamps':'lighting-floor-lamps', 'Wall Lights':'lighting-wall-lights',
    'Ceiling Lights':'lighting-ceiling-lights'
  },
  'furniture-type': {
    'All Furniture':'furniture', 'Sofas':'furniture-sofas',
    'Chairs':'furniture-chairs', 'Tables':'furniture-tables',
    'Beds':'furniture-beds', 'Ottomans':'furniture-ottomans',
    'Banquettes':'furniture-banquettes', 'Storage':'furniture-storage',
    'Daybeds':'furniture-daybeds'
  },
  'furniture-room': {
    'All Rooms':'furniture', 'Living Room':'living-room',
    'Dining Room':'dining-room', 'Bedroom':'bedroom', 'Office':'office'
  },
  'rugs-size': {
    'All Rugs':'rugs', "5' x 8'":'rugs-5x8',
    "6' x 9'":'rugs-6x9', "8' x 10'":'rugs-8x10',
    "9' x 12'":'rugs-9x12', 'Runners':'rugs-runners',
    'Custom':'rugs-custom'
  },
  'rugs-color': {
    'All':'rugs', 'Ivory':'rugs-ivory', 'Beige':'rugs-beige',
    'Grey':'rugs-grey', 'Blue':'rugs-blue',
    'Natural':'rugs-natural', 'Multi':'rugs-multi'
  },
  'rugs-quickship': {'Quick Ship Rugs':'rugs-quick-ship'},
});


// Optional native Shopify Search & Discovery navigation, only after an exact
// published-product readback confirms the Hub's canonical taxonomy value.
// Values are candidate Hub-normalized labels, not guessed from product titles.
const FACET_DESTINATIONS=Object.freeze({
  'textiles-quality':{
    'Upholstery':{root:'fabric',key:'application',tag:'application:upholstery'},
    'Drapery':{root:'fabric',key:'application',tag:'application:drapery'},
  },
  'wallcovering-materials':{
    'Vinyl':{root:'wallpaper',key:'material_type',tag:'material:vinyl'},
    'Leather':{root:'wallpaper',key:'material_type',tag:'material:leather'},
  },
  'wallcovering-design':{
    'Florals':{root:'wallpaper',key:'design',tag:'design:floral'},
    'Geometric':{root:'wallpaper',key:'design',tag:'design:geometric'},
  },
  'lighting-type':{
    'Table Lamps':{root:'lighting',key:'subcategory',tag:'subcat:table-lamp'},
    'Floor Lamps':{root:'lighting',key:'subcategory',tag:'subcat:floor-lamp'},
    'Wall Lights':{root:'lighting',key:'subcategory',tag:'subcat:wall-light'},
    'Ceiling Lights':{root:'lighting',key:'subcategory',tag:'subcat:ceiling-light'},
  },
  'furniture-type':{
    'Sofas':{root:'furniture',key:'subcategory',tag:'subcat:sofa'},
    'Chairs':{root:'furniture',key:'subcategory',tag:'subcat:chair'},
    'Tables':{root:'furniture',key:'subcategory',tag:'subcat:table'},
    'Beds':{root:'furniture',key:'subcategory',tag:'subcat:bed'},
    'Ottomans':{root:'furniture',key:'subcategory',tag:'subcat:ottoman'},
    'Daybeds':{root:'furniture',key:'subcategory',tag:'subcat:daybed'},
  },
  'furniture-room':{
    'Living Room':{root:'furniture',key:'room',tag:'room:living-room'},
    'Dining Room':{root:'furniture',key:'room',tag:'room:dining-room'},
    'Bedroom':{root:'furniture',key:'room',tag:'room:bedroom'},
    'Office':{root:'furniture',key:'room',tag:'room:office'},
  },
});

const NATIVE_METAFIELDS=Object.freeze({
  application:'filter.p.m.taxonomy.application',
  material_type:'filter.p.m.taxonomy.material_type',
  design:'filter.p.m.taxonomy.design',
  subcategory:'filter.p.m.taxonomy.subcategory',
  room:'filter.p.m.taxonomy.room',
});
const CANONICAL_PRODUCT_TYPES=Object.freeze({
  fabric:'Textiles',wallpaper:'Wallcovering',furniture:'Furniture',
  lighting:'Lighting',rugs:'Rugs',accessories:'Accessories',
});

function facetCandidates(menuDef,index) {
  const targets=DESTINATIONS[menuDef.handle]||{};
  const falls=FACET_DESTINATIONS[menuDef.handle]||{};
  return (menuDef.items||[]).flatMap(item=>{
    const candidate=falls[item.title];
    if (!candidate || usableCollection(index,targets[item.title])) return [];
    if (!usableCollection(index,candidate.root)) return [];
    return [{menu:menuDef.handle,label:item.title,...candidate}];
  });
}

function verifyFacetProduct(candidate,product) {
  if (!product || product.status!=='ACTIVE' || !product.publishedAt ||
      product.productType!==CANONICAL_PRODUCT_TYPES[candidate.root]) return null;
  if (!(product.tags||[]).includes(candidate.tag)) return null;
  const field=product.taxonomyValue;
  if (!field || !['single_line_text_field','list.single_line_text_field'].includes(field.type)) return null;
  let vals;
  try { vals=field.type==='list.single_line_text_field'?JSON.parse(field.value):[field.value]; }
  catch { return null; }
  if (!Array.isArray(vals)) return null;
  const slug=(value)=>String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const matches=vals.filter(value=>typeof value==='string' && slug(value)===candidate.tag.split(':').slice(1).join(':'));
  return matches.length===1?matches[0]:null;
}

function buildVerifiedFacetLink(candidate,value,storeHost) {
  if (!/^[a-z0-9.-]+$/.test(String(storeHost||'')) || !NATIVE_METAFIELDS[candidate.key] ||
      !CANONICAL_PRODUCT_TYPES[candidate.root] || !value) return null;
  return {title:candidate.label,type:'HTTP',url:
    'https://'+storeHost+'/collections/'+candidate.root+
    '?'+NATIVE_METAFIELDS[candidate.key]+'='+encodeURIComponent(value)};
}

const ACTIVE_CATEGORIES = new Set(['fabric','wallpaper','furniture','lighting','rugs','accessories']);

function usableCollection(index,handle) {
  if (!handle || !index?.byHandle) return null;
  const value=index.byHandle.get(handle);
  return value && Number(value.productCount || 0)>0 && value.id ? value : null;
}

/**
 * Produce a fail-closed menu: no fake deep links, no empty collections.
 * Missing curated taxonomy collection -> visible BLOCKED plan entry, not an
 * "All Furniture" alias masquerading as a subcategory.
 */
function planCategoryNavigation(menuDef, index, options={}) {
  const proof=options.facetProofs||{};
  const storeHost=options.storeHost||'';
  const targets=DESTINATIONS[menuDef.handle];
  if (!targets) return {menu:menuDef,blocked:[]};
  const mapped=[];
  const blocked=[];
  for(const item of menuDef.items || []) {
    const handle=targets[item.title];
    const collection=usableCollection(index,handle);
    if (!collection) {
      const candidate=(FACET_DESTINATIONS[menuDef.handle]||{})[item.title];
      const key=menuDef.handle+'/'+item.title;
      const nativeLink=candidate && buildVerifiedFacetLink(
        {...candidate,label:item.title},proof[key],storeHost
      );
      if (nativeLink && usableCollection(index,candidate.root)) {
        mapped.push(nativeLink);
        continue;
      }
      blocked.push({menu:menuDef.handle,label:item.title,expectedHandle:handle||null,
                    reason:handle?'no_populated_collection_or_verified_taxonomy':'unmapped_label'});
      continue;
    }
    mapped.push({title:item.title,type:'COLLECTION',resourceId:collection.id});
  }
  return {menu:{...menuDef,items:mapped},blocked};
}

module.exports={DESTINATIONS,FACET_DESTINATIONS,ACTIVE_CATEGORIES,planCategoryNavigation,usableCollection,facetCandidates,verifyFacetProduct,buildVerifiedFacetLink};
