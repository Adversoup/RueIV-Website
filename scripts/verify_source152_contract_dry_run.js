#!/usr/bin/env node
/**
 * verify_source152_contract_dry_run.js
 * Focused dry-run: real checked-in Source#152 handoff → ingest → preflight → sync → rollback.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const HANDOFF_DIR = path.join(ROOT, DEMO_CONFIG.handoff_dir || 'fixtures/artistic_frame_demo/source152_handoff');
const TARGET = DEMO_CONFIG.limits.target_products;

function run(cmd, args, label, env = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function main() {
  const outDir = path.join(ROOT, 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('=== Source#152 contract dry-run verification (real handoff) ===');
  console.log(`Handoff dir: ${HANDOFF_DIR}`);

  run(process.execPath, [
    path.join(__dirname, 'ingest_source152_af_cohort.js'),
    '--from', HANDOFF_DIR,
  ], 'ingest');

  run(process.execPath, [path.join(__dirname, 'artistic_frame_demo_preflight.js')], 'preflight');
  run(process.execPath, [path.join(__dirname, 'artistic_frame_demo_sync.js')], 'sync dry-run');
  run(process.execPath, [path.join(__dirname, 'artistic_frame_demo_rollback.js'), '--dry-run'], 'rollback dry-run');

  const preflight = JSON.parse(fs.readFileSync(path.join(outDir, 'artistic_frame_demo_preflight_report.json'), 'utf8'));
  const sync = JSON.parse(fs.readFileSync(path.join(outDir, 'artistic_frame_demo_sync_report.json'), 'utf8'));

  const report = {
    gate: 'ARTISTIC_FRAME_SOURCE152_CONTRACT_DRY_RUN_OK',
    generated_at: new Date().toISOString(),
    handoff_dir: HANDOFF_DIR,
    preflight_gate: preflight.gate,
    preflight_pass: preflight.summary?.preflight_pass === true,
    cohort_count: preflight.cohort?.count,
    hub_processed_media_ok: preflight.source152?.hub_processed_media_ok,
    authoritative_price_ok: preflight.source152?.authoritative_price_ok,
    media_accessibility: preflight.source152?.media_accessibility || null,
    sync_dry_run: sync.mode === 'dry_run' && sync.failed === 0,
    sync_created: sync.created,
    theme_price_visibility: preflight.source152?.theme_price_visibility,
    remaining_blockers: [],
  };

  if (preflight.source152?.media_accessibility && !preflight.source152.media_accessibility.live_sync_ready) {
    report.remaining_blockers.push(preflight.source152.media_accessibility.blocker);
  }
  if (!process.env.SHOPIFY_STORE || !process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    report.remaining_blockers.push('Missing SHOPIFY_STORE / SHOPIFY_ADMIN_ACCESS_TOKEN for live sync');
  }

  fs.writeFileSync(path.join(outDir, 'source152_contract_dry_run_report.json'), JSON.stringify(report, null, 2));

  if (!report.preflight_pass || !report.sync_dry_run) {
    console.error('CONTRACT DRY-RUN FAILED:', JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log('CONTRACT DRY-RUN OK');
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (err) {
  console.error('VERIFY FAILED:', err.message);
  process.exit(1);
}
