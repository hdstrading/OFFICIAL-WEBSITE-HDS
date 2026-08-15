#!/usr/bin/env node
/**
 * Compares your `.env` against `.env.example` and reports what is missing.
 *
 * `.env` is deliberately not tracked in git, so `git pull` brings new settings
 * into `.env.example` but never into the file the server actually reads. A
 * setting added by an update is therefore silently absent, and the feature it
 * controls silently stays off. This is how you find that out.
 *
 * Usage, from the project root:
 *   node scripts/check-env.mjs
 *   node scripts/check-env.mjs --append   # add the missing keys, blank
 */

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
const EXAMPLE_FILE = path.join(ROOT, '.env.example');

if (!existsSync(EXAMPLE_FILE)) {
  console.error('.env.example is missing. Are you in the project root?');
  process.exit(1);
}
if (!existsSync(ENV_FILE)) {
  console.error('No .env found. Create one first:\n\n  cp .env.example .env\n');
  process.exit(1);
}

/** Keys in file order, ignoring comments and blank lines. */
function keysOf(file) {
  const keys = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    // A commented-out setting is documentation, not configuration — a key that
    // only appears as `# FOO=` is optional and its absence is not a problem.
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (match) keys.push(match[1]);
  }
  return keys;
}

/** The example's value for a key, so defaults carry across on append. */
function exampleValues() {
  const values = new Map();
  for (const line of readFileSync(EXAMPLE_FILE, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

const exampleKeys = keysOf(EXAMPLE_FILE);
const envKeys = new Set(keysOf(ENV_FILE));

const missing = exampleKeys.filter((key) => !envKeys.has(key));
const duplicates = [...envKeys].filter(
  (key) => keysOf(ENV_FILE).filter((k) => k === key).length > 1,
);

if (duplicates.length) {
  console.warn(
    `Set more than once in .env — the last one wins, which may not be what you expect:\n` +
      duplicates.map((k) => `  ${k}`).join('\n') +
      '\n',
  );
}

if (missing.length === 0) {
  console.info('Your .env has every setting from .env.example.');
  process.exit(0);
}

console.info(`Missing from your .env (${missing.length}):\n`);
for (const key of missing) console.info(`  ${key}`);

if (process.argv.includes('--append')) {
  // Carry the example's defaults across, so only the secrets are left blank —
  // appending everything empty would switch off settings that have a sensible
  // default and make the operator retype them.
  const defaults = exampleValues();
  const block =
    `\n# --- Added by check-env on update. Blank ones need a value from you. ---\n` +
    missing.map((key) => `${key}=${defaults.get(key) ?? ''}`).join('\n') +
    '\n';
  appendFileSync(ENV_FILE, block);
  console.info(
    `\nAppended ${missing.length} setting(s) to .env, with defaults where there are any.\n` +
      'Open it and fill in the values, then restart:  systemctl restart hdstradingopc',
  );
} else {
  console.info(
    '\nThese are blank or absent, so whatever they control is switched off.\n' +
      'Add them with:\n\n  node scripts/check-env.mjs --append\n\n' +
      'then edit .env and restart the server.',
  );
}
