#!/usr/bin/env node
'use strict';

const path = require('path');
const { themeCheckRun } = require('@shopify/theme-check-node');

async function main() {
  const root = process.cwd();
  const configPath = path.join(root, '.theme-check.yml');
  const { offenses } = await themeCheckRun(root, configPath);
  const errors = offenses.filter((offense) => offense.severity === 0);

  if (errors.length) {
    for (const offense of errors) {
      console.error(`${offense.check}: ${offense.message} (${offense.uri}:${offense.start_line})`);
    }
    process.exit(1);
  }

  console.log(`Theme check passed (${offenses.length} non-error offenses)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
