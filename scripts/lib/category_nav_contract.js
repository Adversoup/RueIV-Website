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
function planCategoryNavigation(menuDef, index) {
  const targets=DESTINATIONS[menuDef.handle];
  if (!targets) return {menu:menuDef,blocked:[]};
  const mapped=[];
  const blocked=[];
  for(const item of menuDef.items || []) {
    const handle=targets[item.title];
    const collection=usableCollection(index,handle);
    if (!collection) {
      blocked.push({menu:menuDef.handle,label:item.title,expectedHandle:handle||null,
                    reason:handle?'missing_or_unpopulated_collection':'unmapped_label'});
      continue;
    }
    mapped.push({title:item.title,type:'COLLECTION',resourceId:collection.id});
  }
  return {menu:{...menuDef,items:mapped},blocked};
}

module.exports={DESTINATIONS,ACTIVE_CATEGORIES,planCategoryNavigation,usableCollection};
