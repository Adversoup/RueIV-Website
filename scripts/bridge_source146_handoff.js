#!/usr/bin/env node
/**
 * bridge_source146_handoff.js
 * @deprecated Use bridge_source152_handoff.js — Source#152 is the authoritative handoff.
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

console.warn('DEPRECATED: bridge_source146_handoff.js — forwarding to bridge_source152_handoff.js');

const result = spawnSync(process.execPath, [
  path.join(__dirname, 'bridge_source152_handoff.js'),
  ...process.argv.slice(2),
], { stdio: 'inherit' });

process.exit(result.status || 0);
