#!/usr/bin/env node
/**
 * Restores the database from a snapshot.
 *
 * This exists because a backup nobody has ever restored is a hope, not a
 * backup. Run it against a scratch copy once, now, while nothing is wrong —
 * the day you need it is the worst possible day to discover the procedure.
 *
 * WHAT IT REFUSES TO DO. It will not overwrite a live database while the
 * server is running, and it will not overwrite anything without first taking a
 * copy of what is there. Restoring the wrong snapshot over good data is a
 * bigger disaster than the one being recovered from.
 *
 * Usage, from the project root:
 *   node scripts/restore-db.mjs --latest --to /tmp/check.db   # rehearse, safely
 *   node scripts/restore-db.mjs --latest                      # restore for real
 *   node scripts/restore-db.mjs server/backups/hds-2026-08-16T02-00-00Z.db.gz
 *
 * Restoring for real:
 *   sudo systemctl stop hdstradingopc
 *   sudo -u hds node scripts/restore-db.mjs --latest
 *   sudo systemctl start hdstradingopc
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.env.DATABASE_FILE ?? path.join(ROOT, 'server', 'data', 'hds.db');
const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(ROOT, 'server', 'backups');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

const target = flag('--to') ?? LIVE;
const positional = args.find((a) => !a.startsWith('--') && a !== target);

/* ------------------------------------------------------- choose a snapshot */

function newestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => n.startsWith('hds-') && n.endsWith('.db.gz'))
    .sort();
  return files.length ? path.join(BACKUP_DIR, files.at(-1)) : null;
}

const source = args.includes('--latest') ? newestBackup() : positional;

if (!source) {
  console.error(
    'Which snapshot? Pass a path, or --latest to take the newest.\n' +
      `Looked in ${BACKUP_DIR}. List what is held with:\n\n` +
      '  node scripts/backup-db.mjs --list\n',
  );
  process.exit(1);
}
if (!fs.existsSync(source)) {
  console.error(`No such snapshot: ${source}`);
  process.exit(1);
}

/* ------------------------------------------------- refuse to clobber a live DB */

// The WAL and shared-memory files only exist while a connection is open. Their
// presence alongside the target means something is very likely still running,
// and writing underneath it would corrupt both the file and that process.
const looksInUse = ['-wal', '-shm'].some((ext) => fs.existsSync(`${target}${ext}`));
if (looksInUse && !args.includes('--force')) {
  console.error(
    `${target} appears to be in use — a -wal or -shm file is present.\n\n` +
      'Stop the server first:\n\n' +
      '  sudo systemctl stop hdstradingopc\n\n' +
      'then run this again. Use --force only if you are certain nothing is running.',
  );
  process.exit(1);
}

/* ------------------------------------------------------------- decompress */

const staging = `${target}.restoring`;
console.info(`Restoring from ${path.basename(source)}`);

await pipeline(
  fs.createReadStream(source),
  zlib.createGunzip(),
  fs.createWriteStream(staging, { mode: 0o600 }),
);

/* ---------------------------------------------------------------- verify */

// Checked before it replaces anything: a corrupt snapshot must not become the
// live database, and finding that out afterwards means two losses instead of one.
let summary;
try {
  const db = new Database(staging, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`integrity check said: ${integrity}`);
    summary = ['orders', 'bookings', 'products', 'reviews', 'quotes']
      .map((t) => `${db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n} ${t}`)
      .join(', ');
  } finally {
    db.close();
  }
} catch (error) {
  fs.rmSync(staging, { force: true });
  console.error(`That snapshot is not usable, so nothing was changed: ${error.message}`);
  process.exit(1);
}

console.info(`  snapshot contains: ${summary}`);

/* ------------------------------------------------------------- swap it in */

// Whatever is currently there is set aside first, under a timestamp. If the
// wrong snapshot has just been restored, the previous state is still on disk.
if (fs.existsSync(target)) {
  const aside = `${target}.replaced-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.renameSync(target, aside);
  console.info(`  previous database kept at ${path.basename(aside)}`);
}
// Stale WAL files from the old database would be applied on top of the restored
// one, silently reintroducing exactly the writes being rolled back.
for (const ext of ['-wal', '-shm']) fs.rmSync(`${target}${ext}`, { force: true });

fs.renameSync(staging, target);

console.info(
  `\nRestored to ${target}.\n` +
    (target === LIVE
      ? 'Start the server:  sudo systemctl start hdstradingopc\n'
      : 'This was a rehearsal — the live database was not touched.\n'),
);
