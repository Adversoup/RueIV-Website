#!/usr/bin/env node
/**
 * ingest_source146_af_cohort.js
 * @deprecated Use ingest_source152_af_cohort.js — Source#152 is the authoritative handoff.
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

console.warn('DEPRECATED: ingest_source146_af_cohort.js — forwarding to ingest_source152_af_cohort.js');

const result = spawnSync(process.execPath, [
  path.join(__dirname, 'ingest_source152_af_cohort.js'),
  ...process.argv.slice(2),
], { stdio: 'inherit' });

process.exit(result.status || 0);
