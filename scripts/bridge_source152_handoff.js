#!/usr/bin/env node
/**
 * bridge_source152_handoff.js
 * Fetch merged Source#152 handoff from RueIV-Source into
 * fixtures/artistic_frame_demo/source152_handoff/, then run ingest.
 *
 * Usage:
 *   node scripts/bridge_source152_handoff.js
 *   node scripts/bridge_source152_handoff.js --ref main --skip-ingest
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  HUB_PROCESSED_MEDIA_MODE,
  RAW_MEDIA_HANDOFF_MODE,
  validateSource152Provenance,
} = require('../lib/af_demo_handoff');

const ROOT = path.resolve(__dirname, '..');
const DEMO_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'artistic_frame_demo.json'), 'utf8'));
const HANDOFF_DIR = path.join(ROOT, DEMO_CONFIG.handoff_dir || 'fixtures/artistic_frame_demo/source152_handoff');
const OUT_DIR = path.join(ROOT, 'out');

const SOURCE_REPO = DEMO_CONFIG.upstream.source_repo || 'Adversoup/RueIV-Source';
const SOURCE_REF = process.env.SOURCE152_REF || DEMO_CONFIG.upstream.source_ref || 'main';
const PAYLOAD_PATH = DEMO_CONFIG.upstream.source_paths?.payload
  || 'docs/ai/readiness/issue-146/artistic_frame_demo_enriched_payload.json';
const MANIFEST_PATH = DEMO_CONFIG.upstream.source_paths?.manifest
  || 'docs/ai/readiness/issue-146/artistic_frame_demo_cohort_50_manifest.json';
const TARGET_PRODUCTS = DEMO_CONFIG.limits?.target_products || 50;

const LOCAL_MANIFEST_NAME = 'artistic_frame_demo_cohort_manifest.json';
const LOCAL_PAYLOAD_NAME = 'artistic_frame_demo_enriched_payload.json';

function parseArgs() {
  const args = process.argv.slice(2);
  let ref = SOURCE_REF;
  let skipIngest = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ref' && args[i + 1]) {
      ref = args[i + 1];
      i++;
    } else if (args[i] === '--skip-ingest') {
      skipIngest = true;
    }
  }
  return { ref, skipIngest };
}

function ghApiRaw(repo, filePath, ref) {
  const result = spawnSync('gh', [
    'api',
    `repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
    '--jq', '.content',
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`GitHub API fetch failed for ${filePath}@${ref}: ${err.split('\n')[0]}`);
  }

  const b64 = (result.stdout || '').replace(/\s/g, '');
  if (!b64) throw new Error(`Empty content for ${filePath}`);
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function writeReport(report) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const reportPath = path.join(OUT_DIR, 'source152_bridge_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

function main() {
  const { ref, skipIngest } = parseArgs();
  const report = {
    gate: 'ARTISTIC_FRAME_SOURCE152_BRIDGE',
    generated_at: new Date().toISOString(),
    source_repo: SOURCE_REPO,
    source_ref: ref,
    payload_path: PAYLOAD_PATH,
    manifest_path: MANIFEST_PATH,
    expected_manifest_fingerprint: DEMO_CONFIG.upstream.manifest_fingerprint,
    expected_payload_fingerprint: DEMO_CONFIG.upstream.payload_fingerprint,
    handoff_dir: HANDOFF_DIR,
    status: 'pending',
    blockers: [],
  };

  try {
    console.log(`Bridging Source#152 from ${SOURCE_REPO}@${ref}…`);
    const manifest = ghApiRaw(SOURCE_REPO, MANIFEST_PATH, ref);
    const payload = ghApiRaw(SOURCE_REPO, PAYLOAD_PATH, ref);

    const provenance = validateSource152Provenance(manifest, payload, DEMO_CONFIG);
    report.provenance = provenance;
    if (!provenance.ok) {
      throw new Error(`Provenance validation failed:\n- ${provenance.issues.join('\n- ')}`);
    }

    report.product_count = payload.product_count || manifest.cohort_size || null;
    if (report.product_count != null && report.product_count !== TARGET_PRODUCTS) {
      throw new Error(`Cohort product_count must be ${TARGET_PRODUCTS}: manifest/payload reports ${report.product_count}`);
    }

    report.media_handoff_mode = payload.media_handoff_mode || manifest.media_handoff_mode || null;
    if (report.media_handoff_mode === RAW_MEDIA_HANDOFF_MODE) {
      throw new Error(
        `Raw ${RAW_MEDIA_HANDOFF_MODE} handoff rejected — Source#152 must provide Hub-processed sync-ready media`
      );
    }
    if (report.media_handoff_mode && report.media_handoff_mode !== HUB_PROCESSED_MEDIA_MODE) {
      throw new Error(`Unexpected media_handoff_mode ${report.media_handoff_mode} — expected ${HUB_PROCESSED_MEDIA_MODE}`);
    }

    if (!fs.existsSync(HANDOFF_DIR)) fs.mkdirSync(HANDOFF_DIR, { recursive: true });
    fs.writeFileSync(path.join(HANDOFF_DIR, LOCAL_MANIFEST_NAME), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(HANDOFF_DIR, LOCAL_PAYLOAD_NAME), JSON.stringify(payload, null, 2));

    report.bridged_files = [LOCAL_MANIFEST_NAME, LOCAL_PAYLOAD_NAME];
    report.manifest_fingerprint = provenance.fingerprints.manifest_fingerprint_sha256;
    report.payload_fingerprint = provenance.fingerprints.payload_fingerprint_sha256;
    report.status = 'bridged';

    console.log(`Bridged to ${HANDOFF_DIR}`);
    console.log(`Manifest fingerprint: ${report.manifest_fingerprint}`);
    console.log(`Payload fingerprint: ${report.payload_fingerprint}`);

    if (!skipIngest) {
      const ingest = spawnSync(process.execPath, [
        path.join(__dirname, 'ingest_source152_af_cohort.js'),
        '--from', HANDOFF_DIR,
      ], { stdio: 'inherit', cwd: ROOT });
      if (ingest.status !== 0) {
        report.status = 'ingest_failed';
        throw new Error('Ingest failed after bridge — see output above');
      }
      report.status = 'ingested';
      report.next = ['npm run af-demo:preflight', 'npm run af-demo:sync'];
    }
  } catch (err) {
    report.status = report.status === 'pending' ? 'blocked' : report.status;
    report.blockers.push(err.message);
    const reportPath = writeReport(report);
    console.error('BRIDGE FAILED:', err.message);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }

  const reportPath = writeReport(report);
  console.log(`Bridge report: ${reportPath}`);
}

main();
