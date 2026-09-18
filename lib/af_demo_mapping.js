/**
 * af_demo_mapping.js
 * Shared Artistic Frame demo Hub → Shopify mapping options.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function loadDemoConfig() {
  const configPath = path.resolve(__dirname, '..', 'config', 'artistic_frame_demo.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function demoMapOptions(config = loadDemoConfig()) {
  const visibility = config.policy?.price_visibility || 'auth_only';
  return {
    priceVisibility: visibility,
    forcePriceHidden: visibility === 'hidden' || config.policy?.price_hidden === true,
    requireAuthoritativePrice: config.policy?.require_authoritative_price === true,
    productStatus: config.policy?.default_product_status,
  };
}

module.exports = {
  loadDemoConfig,
  demoMapOptions,
};
