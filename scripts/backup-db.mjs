#!/usr/bin/env node
/**
 * Takes a verified, compressed snapshot of the database.
 *
 * WHY NOT `cp`. The database runs in WAL mode, which means a committed write
 * may live in `hds.db-wal` rather than in `hds.db` itself. Copying the one file
 * while the server is running therefore produces something that looks like a
 * database and is missing the most recent orders — the worst possible failure,
 * because it is only discovered when the backup is needed. This uses SQLite's
 * online backup API, which is safe against concurrent writes and folds the WAL
 * in as it goes.
 *
 * WHY IT VERIFIES. An unverified backup is a guess. Every snapshot is reopened,
 * integrity-checked and read from before it is kept, and a snapshot that fails
 * is deleted rather than left to be mistaken for a good one.
 *
 * Usage, from the project root:
 *   node scripts/backup-db.mjs
 *   node scripts/backup-db.mjs --keep-days 30 --keep-months 12
 *   node scripts/backup-db.mjs --list      # what is currently held
 *   node scripts/backup-db.mjs --dry-run   # show what would be pruned
 *
 * Environment:
 *   DATABASE_FILE   the live database (defaults to server/data/hds.db)
 *   BACKUP_DIR      where snapshots go (defaults to server/backups)
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE = process.env.DATABASE_FILE ?? path.join(ROOT, 'server', 'data', 'hds.db');
const DEST_DIR = process.env.BACKUP_DIR ?? path.join(ROOT, 'server', 'backups');

/** Every snapshot from the last this-many days is kept, whatever else applies. */
const KEEP_DAYS = numberFlag('--keep-days', 30);
/** Beyond that, the newest snapshot of each month is kept for this many months. */
const KEEP_MONTHS = numberFlag('--keep-months', 12);

const DRY_RUN = process.argv.includes('--dry-run');
const LIST_ONLY = process.argv.includes('--list');

function numberFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const PREFIX = 'hds-';
const SUFFIX = '.db.gz';

/** Sortable and filename-safe: 2026-08-16T09-30-00Z. */
const stamp = () => new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/* ------------------------------------------------------------------- listing */

/** Snapshots we hold, newest first. Anything not matching the pattern is left alone. */
function existingBackups() {
  if (!fs.existsSync(DEST_DIR)) return [];
  return fs
    .readdirSync(DEST_DIR)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => {
      const iso = name.slice(PREFIX.length, -SUFFIX.length).replace(/-(\d\d)-(\d\dZ)$/, ':$1:$2');
      const taken = new Date(iso);
      const full = path.join(DEST_DIR, name);
      return { name, path: full, taken, size: fs.statSync(full).size };
    })
    .filter((b) => !Number.isNaN(b.taken.getTime()))
    .sort((a, b) => b.taken - a.taken);
}

if (LIST_ONLY) {
  const held = existingBackups();
  if (held.length === 0) {
    console.info(`No backups in ${DEST_DIR}.`);
    process.exit(0);
  }
  console.info(`${held.length} backup(s) in ${DEST_DIR}:\n`);
  for (const b of held) {
    console.info(`  ${b.taken.toISOString().slice(0, 19).replace('T', ' ')}  ${mb(b.size).padStart(9)}  ${b.name}`);
  }
  const total = held.reduce((sum, b) => sum + b.size, 0);
  console.info(`\n  Oldest: ${held.at(-1).taken.toISOString().slice(0, 10)} · total ${mb(total)}`);
  process.exit(0);
}

/* ------------------------------------------------------------------ snapshot */

if (!fs.existsSync(SOURCE)) {
  console.error(`No database at ${SOURCE}.\nSet DATABASE_FILE if it lives elsewhere.`);
  process.exit(1);
}

// 0o700: snapshots contain customer names, emails, phone numbers and delivery
// addresses. They are no less sensitive than the live database.
fs.mkdirSync(DEST_DIR, { recursive: true, mode: 0o700 });

const finalPath = path.join(DEST_DIR, `${PREFIX}${stamp()}${SUFFIX}`);
const rawPath = `${finalPath}.tmp`;

let source;
try {
  source = new Database(SOURCE, { readonly: true, fileMustExist: true });
} catch (error) {
  console.error(`Could not open ${SOURCE}: ${error.message}`);
  process.exit(1);
}

console.info(`Backing up ${SOURCE}`);
try {
  await source.backup(rawPath);
} catch (error) {
  console.error(`Snapshot failed: ${error.message}`);
  fs.rmSync(rawPath, { force: true });
  process.exit(1);
}

/* -------------------------------------------------------------------- verify */

/**
 * A snapshot is only kept once it has proved it opens, passes SQLite's own
 * integrity check, and can be read from. Anything else is deleted here rather
 * than sitting in the directory looking like a backup.
 */
function verify(file) {
  const check = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const result = check.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`integrity check said: ${result}`);

    const counts = {};
    for (const table of ['orders', 'bookings', 'products', 'reviews', 'quotes']) {
      counts[table] = check.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    }
    return counts;
  } finally {
    check.close();
  }
}

let counts;
try {
  counts = verify(rawPath);
} catch (error) {
  console.error(`The snapshot is not usable, so it has been discarded: ${error.message}`);
  fs.rmSync(rawPath, { force: true });
  process.exit(1);
}
source.close();

/* ---------------------------------------------------------------- compress */

await pipeline(
  fs.createReadStream(rawPath),
  zlib.createGzip({ level: 9 }),
  fs.createWriteStream(finalPath, { mode: 0o600 }),
);
const rawSize = fs.statSync(rawPath).size;
fs.rmSync(rawPath, { force: true });

console.info(
  `Wrote ${path.basename(finalPath)} — ${mb(fs.statSync(finalPath).size)} compressed, ${mb(rawSize)} raw\n` +
    `  verified: ${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(', ')}`,
);

/* ------------------------------------------------------------------- prune */

/**
 * Keeps everything recent, then one snapshot a month going back.
 *
 * Two rules rather than a schedule, because a retention policy nobody can
 * recite is one nobody can rely on. The monthly tier matters more than it
 * looks: damage discovered late — a bad import, a mistaken deletion — needs a
 * copy from before it happened, which daily-only retention will have dropped.
 */
function prune() {
  const held = existingBackups();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const keep = new Set();
  const monthlyKept = new Map();

  for (const backup of held) {
    const ageDays = (now - backup.taken) / dayMs;
    if (ageDays <= KEEP_DAYS) {
      keep.add(backup.name);
      continue;
    }
    const monthsOld = ageDays / 30.44;
    if (monthsOld > KEEP_MONTHS) continue;

    // `held` is newest-first, so the first one seen for a month is the newest.
    const month = backup.taken.toISOString().slice(0, 7);
    if (!monthlyKept.has(month)) {
      monthlyKept.set(month, backup.name);
      keep.add(backup.name);
    }
  }

  const doomed = held.filter((b) => !keep.has(b.name));
  if (doomed.length === 0) {
    console.info(`Holding ${held.length} backup(s); nothing to prune.`);
    return;
  }

  for (const backup of doomed) {
    if (DRY_RUN) console.info(`  would remove ${backup.name}`);
    else fs.rmSync(backup.path, { force: true });
  }
  console.info(
    `${DRY_RUN ? 'Would remove' : 'Removed'} ${doomed.length} old backup(s); ` +
      `holding ${held.length - doomed.length}.`,
  );
}

prune();
