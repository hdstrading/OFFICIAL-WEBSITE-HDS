# Database backups

Everything the website knows lives in one SQLite file: every order, booking,
quote, review and discount code. Without a copy of it, a failed disk or a
mistaken delete is the end of the business's records.

This sets up a nightly verified snapshot, and — just as importantly — walks
through restoring one, because a backup nobody has ever restored is a hope
rather than a backup.

---

## Why not just copy the file

The database runs in WAL mode. A committed write may live in `hds.db-wal`
rather than in `hds.db` itself, so copying the one file while the site is
running gives you something that opens cleanly and is missing the most recent
orders. That is the worst kind of failure, because nothing looks wrong until
the day you need it.

Measured on a live server with one order placed and not yet checkpointed:

| Method | Orders captured |
| --- | --- |
| `cp hds.db backup.db` | 4 — **the new order was lost** |
| `scripts/backup-db.mjs` | 5 |

The script uses SQLite's online backup API, which is safe against concurrent
writes and folds the WAL in as it goes. The site does not need to be stopped.

---

## Install

On the website VPS, as root:

```
cd /var/www/hdstradingopc
git pull origin main

mkdir -p /var/backups/hdstradingopc
chown hds:hds /var/backups/hdstradingopc
chmod 700 /var/backups/hdstradingopc

cp deploy/hdstradingopc-backup.service /etc/systemd/system/
cp deploy/hdstradingopc-backup.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hdstradingopc-backup.timer
```

`chmod 700` matters: snapshots contain customer names, emails, phone numbers
and delivery addresses. They are no less sensitive than the live database.

Run it once by hand rather than waiting for the timer:

```
systemctl start hdstradingopc-backup
journalctl -u hdstradingopc-backup -n 20 --no-pager
```

You should see a line like:

```
Wrote hds-2026-08-16T02-15-00Z.db.gz — 0.12 MB compressed, 1.40 MB raw
  verified: 41 orders, 6 bookings, 12 products, 9 reviews, 3 quotes
```

Those counts are read back out of the snapshot itself, so they are evidence the
backup is readable — not just that a file was written.

Check the schedule took:

```
systemctl list-timers hdstradingopc-backup --no-pager
```

---

## What is kept

Every snapshot from the **last 30 days**, then the newest one from **each of
the last 12 months**. Two rules rather than a schedule, because a retention
policy nobody can recite is one nobody can rely on.

The monthly tier matters more than it looks. Damage found late — a bad import,
a mistaken deletion noticed weeks afterwards — needs a copy from *before* it
happened, and daily-only retention will have dropped it.

Adjust with `--keep-days` and `--keep-months` in the service file if you want a
different shape.

See what is held:

```
sudo -u hds BACKUP_DIR=/var/backups/hdstradingopc node scripts/backup-db.mjs --list
```

---

## Restoring

### Rehearse it now

Do this once, today, while nothing is wrong. It writes to a scratch file and
cannot touch the live database:

```
cd /var/www/hdstradingopc
sudo -u hds BACKUP_DIR=/var/backups/hdstradingopc \
  node scripts/restore-db.mjs --latest --to /tmp/rehearsal.db
```

It prints what the snapshot contains. If the counts look like your business,
your backups work.

### For real

```
systemctl stop hdstradingopc

cd /var/www/hdstradingopc
sudo -u hds BACKUP_DIR=/var/backups/hdstradingopc \
  node scripts/restore-db.mjs --latest

systemctl start hdstradingopc
```

To restore a specific night instead of the newest, pass its path in place of
`--latest`.

Two things the restore does on your behalf:

- **It refuses to overwrite a running database.** If `-wal` or `-shm` files are
  present it stops and tells you to stop the server first. Writing underneath a
  live process would corrupt both.
- **It sets the current database aside before replacing it**, as
  `hds.db.replaced-<timestamp>`. If the wrong snapshot has just been restored,
  the previous state is still on disk. Delete those once you are satisfied.

A snapshot that fails its integrity check is discarded and nothing is changed —
a corrupt backup must not become the live database, because that turns one loss
into two.

---

## The gap this does not close

**These snapshots sit on the same VPS as the database.** They protect against a
corrupt file, a bad deploy, or somebody deleting the wrong row. They do **not**
protect against losing the server itself.

Closing that means a copy somewhere else. The simplest version, run from your
own machine, needs nothing installed on the server:

```
rsync -avz --delete \
  root@217.154.118.223:/var/backups/hdstradingopc/ \
  ~/hds-backups/
```

Run it weekly and keep `~/hds-backups` somewhere that is itself backed up — a
laptop that syncs to iCloud or Google Drive is enough. An IONOS snapshot of the
whole VPS is another route, configured in their control panel.

Until one of those is in place, the honest statement is: the website survives
data damage, not server loss.

---

## What is deliberately not backed up

`.env` is not included. It holds the admin password, session secret, PayMongo
keys, SMTP password and the inventory integration key, and a nightly job
copying all of that around the disk creates more risk than it removes.

Every value in it is recoverable — the PayMongo keys from their dashboard, the
integration key by regenerating it in the inventory system, the passwords by
setting new ones. But recovering them takes an hour you will not want to spend
mid-incident, so **keep a copy of `.env` in your password manager** and update
it whenever a value changes.
