#!/usr/bin/env node
/**
 * verify_source152_contract_dry_run.js
 * Focused dry-run: synthetic 50-product Source#152 handoff → ingest → preflight → sync.
 * Uses isolated temp dirs — does not mutate committed fixtures.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const REQUIRED_GATE = DEMO_CONFIG.upstream.required_gate;
const SMOKE_SKU = DEMO_CONFIG.cohort?.smoke_sku || '2505A';
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

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function buildSyntheticHandoff() {
  const products = [];
  for (let i = 0; i < TARGET; i++) {
    const sku = i === 0 ? SMOKE_SKU : `DRY${String(i).padStart(3, '0')}A`;
    products.push({
      sku,
      title: `Artistic Frame dry-run product ${sku}`,
      canonical_vendor: 'Artistic Frame',
      category: 'furniture',
      status: 'APPROVED',
      price: String(1200 + i),
      price_authority: 'trade',
      media_handoff_mode: 'hub_processed_media_sync_ready',
      media_status: 'sync_ready',
      hub_processed_images: [`https://hub-processed.rueiv.local/artistic-frame/${sku}/primary.jpg`],
      primary_image_source_url: `https://www.artisticframe.com/public/img/items/3/${sku}_lineage.jpg`,
      description_html: `<p>Dry-run contract verification for ${sku}.</p>`,
      brand: { tier: 'partner', collection_handle: 'artistic-frame' },
    });
  }

  const exportDoc = {
    gate: REQUIRED_GATE,
    media_handoff_mode: 'hub_processed_media_sync_ready',
    media_status: 'sync_ready',
    products,
  };

  const manifest = {
    gate: REQUIRED_GATE,
    media_handoff_mode: 'hub_processed_media_sync_ready',
    manifest: {
      selected_records: TARGET,
      media_handoff_mode: 'hub_processed_media_sync_ready',
    },
  };

  return { manifest, exportDoc };
}

function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'af-source152-verify-'));
  const handoffDir = path.join(tmpRoot, 'handoff');
  const fixtureDir = path.join(tmpRoot, 'fixtures', 'artistic_frame_demo');
  const outDir = path.join(tmpRoot, 'out');

  fs.mkdirSync(handoffDir, { recursive: true });
  copyDir(path.join(ROOT, 'fixtures', 'artistic_frame_demo'), fixtureDir);

  const { manifest, exportDoc } = buildSyntheticHandoff();
  fs.writeFileSync(path.join(handoffDir, 'artistic_frame_showcase_cohort_manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(handoffDir, 'artistic_frame_shopify_export_payload.json'), JSON.stringify(exportDoc, null, 2));

  const manifestFp = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const exportFp = crypto.createHash('sha256').update(JSON.stringify(exportDoc)).digest('hex');

  const env = {
    AF_DEMO_FIXTURE_DIR: fixtureDir,
    AF_DEMO_OUT_DIR: outDir,
  };

  console.log('=== Source#152 contract dry-run verification (isolated) ===');

  run(process.execPath, [
    path.join(__dirname, 'ingest_source152_af_cohort.js'),
    '--from', handoffDir,
    '--manifest-fingerprint', manifestFp,
    '--export-fingerprint', exportFp,
    '--skip-gate-check',
  ], 'ingest', env);

  run(process.execPath, [path.join(__dirname, 'artistic_frame_demo_preflight.js')], 'preflight', env);
  run(process.execPath, [path.join(__dirname, 'artistic_frame_demo_sync.js')], 'sync dry-run', env);

  const preflight = JSON.parse(fs.readFileSync(path.join(outDir, 'artistic_frame_demo_preflight_report.json'), 'utf8'));
  const sync = JSON.parse(fs.readFileSync(path.join(outDir, 'artistic_frame_demo_sync_report.json'), 'utf8'));

  const report = {
    gate: 'ARTISTIC_FRAME_SOURCE152_CONTRACT_DRY_RUN_OK',
    generated_at: new Date().toISOString(),
    preflight_gate: preflight.gate,
    preflight_pass: preflight.summary?.preflight_pass === true,
    cohort_count: preflight.cohort?.count,
    hub_processed_media_ok: preflight.source152?.hub_processed_media_ok,
    authoritative_price_ok: preflight.source152?.authoritative_price_ok,
    sync_dry_run: sync.mode === 'dry_run' && sync.failed === 0,
    sync_created: sync.created,
    theme_price_visibility: preflight.source152?.theme_price_visibility,
    temp_dir: tmpRoot,
  };

  fs.writeFileSync(path.join(ROOT, 'out', 'source152_contract_dry_run_report.json'), JSON.stringify(report, null, 2));

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
