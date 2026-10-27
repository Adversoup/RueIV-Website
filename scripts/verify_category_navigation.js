#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {planCategoryNavigation,facetCandidates,verifyFacetProduct}=require('./lib/category_nav_contract');
const index={byHandle:new Map([
 ['furniture',{handle:'furniture',id:'gid://shopify/Collection/1',productCount:77}],
 ['furniture-sofas',{handle:'furniture-sofas',id:'gid://shopify/Collection/2',productCount:12}],
 ['furniture-chairs',{handle:'furniture-chairs',id:'gid://shopify/Collection/3',productCount:0}],
 ['wallcovering',{handle:'wallcovering',id:'gid://shopify/Collection/4',productCount:64}],
 ['wallcovering-vinyl',{handle:'wallcovering-vinyl',id:'gid://shopify/Collection/5',productCount:19}]
])};
const furniture=planCategoryNavigation({
 handle:'furniture-type',title:'Furniture type',items:[
 {title:'All Furniture',type:'HTTP',url:'https://ruefour.myshopify.com/collections/furniture'},
 {title:'Sofas',type:'HTTP',url:'https://ruefour.myshopify.com/collections/furniture'},
 {title:'Chairs',type:'HTTP',url:'https://ruefour.myshopify.com/collections/furniture'},
 {title:'Daybeds',type:'HTTP',url:'https://ruefour.myshopify.com/collections/furniture'}
]},index);
assert.deepEqual(furniture.menu.items.map(x=>x.title),['All Furniture','Sofas','Chairs','Daybeds']);
assert.equal(furniture.menu.items[1].url,'https://ruefour.myshopify.com/collections/furniture');
assert.equal(furniture.blocked.length,2);
assert.ok(furniture.blocked.some(x=>x.label==='Chairs'&&x.reason==='no_populated_collection_or_verified_taxonomy'));
const populatedIndex={byHandle:new Map([
 ['furniture',{handle:'furniture',id:'gid://shopify/Collection/1',productCount:77}],
 ['furniture-sofas',{handle:'furniture-sofas',id:'gid://shopify/Collection/2',productCount:12}],
 ['furniture-chairs',{handle:'furniture-chairs',id:'gid://shopify/Collection/3',productCount:12}],
 ['furniture-daybeds',{handle:'furniture-daybeds',id:'gid://shopify/Collection/6',productCount:4}],
])};
const populated=planCategoryNavigation({handle:'furniture-type',items:[
 {title:'All Furniture'}, {title:'Sofas'}, {title:'Chairs'}, {title:'Daybeds'}
]},populatedIndex);
assert.equal(populated.blocked.length,0);
assert.deepEqual(populated.menu.items.map(x=>x.title),['All Furniture','Sofas','Chairs','Daybeds']);
assert.equal(populated.menu.items[2].resourceId,'gid://shopify/Collection/3');
const wallpaper=planCategoryNavigation({
 handle:'wallcovering-materials',items:[
  {title:'All Wallcovering'}, {title:'Vinyl'}, {title:'Murals'}
]},index);
assert.deepEqual(wallpaper.menu.items.map(x=>x.title),['All Wallcovering','Vinyl','Murals']);
assert.equal(wallpaper.menu.items[1].title,'Vinyl');
assert.equal(wallpaper.blocked[0].expectedHandle,'wallcovering-murals');
const other={handle:'vibe-menu',items:[{title:'Portfolio',url:'/pages/portfolio'}]};
assert.deepEqual(planCategoryNavigation(other,index),{menu:other,blocked:[]});

const singleton={byHandle:new Map([
  ['furniture',{handle:'furniture',id:'gid://shopify/Collection/99',productCount:30}],
  ['wallcovering',{handle:'wallcovering',id:'gid://shopify/Collection/98',productCount:40}]
])};
const menu={handle:'furniture-type',items:[{title:'All Furniture'},{title:'Sofas'},{title:'Beds'}]};
const [sofas]=facetCandidates(menu,singleton);
assert.deepEqual({label:sofas.label,key:sofas.key,tag:sofas.tag},
                 {label:'Sofas',key:'subcategory',tag:'subcat:sofa'});
const verifiedProduct={
  productType:'Furniture',status:'ACTIVE',publishedAt:'2026-10-01T00:00:00Z',
  tags:['category:furniture','subcat:sofa'],
  collections:{nodes:[{handle:'furniture'}]},
  taxonomyValue:{type:'single_line_text_field',value:'Sofa'}
};
assert.equal(verifyFacetProduct(sofas,verifiedProduct),'Sofa');
assert.equal(verifyFacetProduct(sofas,{...verifiedProduct,collections:{nodes:[{handle:'lighting'}]}}),null);
assert.equal(verifyFacetProduct(sofas,{...verifiedProduct,productType:'Lighting'}),null);
assert.equal(verifyFacetProduct(sofas,{...verifiedProduct,publishedAt:'2099-01-01T00:00:00Z'}),null);
assert.equal(verifyFacetProduct(sofas,{...verifiedProduct,tags:['category:furniture']}),null);
const filtered=planCategoryNavigation(menu,singleton,{
  facetProofs:{'furniture-type/Sofas':'Sofa'},storeHost:'ruefour.myshopify.com'
});
assert.equal(filtered.menu.items[1].type,undefined);
assert.equal(filtered.menu.items[1].title,'Sofas');
assert.equal(filtered.blocked.length,1);
assert.equal(filtered.blocked[0].label,'Beds');
const wallMenu={handle:'wallcovering-materials',items:[{title:'All Wallcovering'},{title:'Wallpapers'}]};
const wall=planCategoryNavigation(wallMenu,singleton);
assert.deepEqual(wall.menu.items.map(x=>x.title),['All Wallcovering','Wallpapers']);
assert.equal(wall.blocked[0].label,'Wallpapers');

console.log('PASS category navigation: exact populated collections, broken aliases blocked');
