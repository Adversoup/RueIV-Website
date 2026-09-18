/**
 * af_demo_paths.js
 * Shared fixture/out directory resolution (supports isolated dry-run via env).
 */

'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function fixtureDir() {
  return process.env.AF_DEMO_FIXTURE_DIR || path.join(ROOT, 'fixtures', 'artistic_frame_demo');
}

function outDir() {
  return process.env.AF_DEMO_OUT_DIR || path.join(ROOT, 'out');
}

module.exports = {
  ROOT,
  fixtureDir,
  outDir,
};
