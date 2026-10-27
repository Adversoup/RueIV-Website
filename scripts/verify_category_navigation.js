#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {planCategoryNavigation}=require('./lib/category_nav_contract');
const index={byHandle:new Map([
 ['furniture',{handle:'furniture',id:'gid://shopify/Collection/1',productCount:77}],
 ['furniture-sofas',{handle:'furniture-sofas',id:'gid://shopify/Collection/2',productCount:12}],
 ['furniture-chairs',{handle:'furniture-chairs',id:'gid://shopify/Collection/3',productCount:0}],
 ['wallpaper',{handle:'wallpaper',id:'gid://shopify/Collection/4',productCount:64}],
 ['wallcovering-vinyl',{handle:'wallcovering-vinyl',id:'gid://shopify/Collection/5',productCount:19}]
])};
const furniture=planCategoryNavigation({
 handle:'furniture-type',title:'Furniture type',items:[
 {title:'All Furniture',type:'HTTP',url:'https://ruefour.myshopify.com/collections/furniture'},
 {title:'Sofas',type:'HTTP',url:'https://ruefour.myshopify.com/collections/furniture'},
 {title:'Chairs',type:'HTTP',url:'https://ruefour.myshopify.com/collections/furniture'},
 {title:'Daybeds',type:'HTTP',url:'https://ruefour.myshopify.com/collections/furniture'}
]},index);
assert.deepEqual(furniture.menu.items.map(x=>x.title),['All Furniture','Sofas']);
assert.equal(furniture.menu.items[1].resourceId,'gid://shopify/Collection/2');
assert.equal(furniture.blocked.length,2);
assert.ok(furniture.blocked.some(x=>x.label==='Chairs'&&x.reason==='missing_or_unpopulated_collection'));
const wallpaper=planCategoryNavigation({
 handle:'wallcovering-materials',items:[
  {title:'All Wallcovering'}, {title:'Vinyl'}, {title:'Murals'}
]},index);
assert.deepEqual(wallpaper.menu.items.map(x=>x.title),['All Wallcovering','Vinyl']);
assert.equal(wallpaper.menu.items[1].resourceId,'gid://shopify/Collection/5');
assert.equal(wallpaper.blocked[0].expectedHandle,'wallcovering-murals');
const other={handle:'vibe-menu',items:[{title:'Portfolio',url:'/pages/portfolio'}]};
assert.deepEqual(planCategoryNavigation(other,index),{menu:other,blocked:[]});
console.log('PASS category navigation: exact populated collections, broken aliases blocked');
