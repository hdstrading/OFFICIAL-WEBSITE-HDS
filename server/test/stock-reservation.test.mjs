/**
 * Stock must be taken atomically, or not at all.
 *
 * This exists because the original check read the stock figure during pricing
 * and nothing ever wrote it back, so the same units sold repeatedly until the
 * next catalogue sync — to concurrent requests, and to sequential ones too.
 * Measured before the fix: six orders of two units each, against a stock of
 * three, all six accepted.
 *
 * Run:  node server/test/stock-reservation.test.mjs /tmp/stock-test.db
 */

process.env.DATABASE_FILE = process.argv[2] ?? '/tmp/hds-stock-test.db';
process.env.ADMIN_PASSWORD = 'x';
process.env.SESSION_SECRET = 'y';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${process.env.DATABASE_FILE}${suffix}`, { force: true });
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { products } = await import(new URL(path.join(HERE, '..', 'dist', 'db.js'), 'file://').href);

let pass = 0;
let total = 0;
const check = (label, ok, detail = '') => {
  total++;
  if (ok) pass++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

const ID = 'test-stock-item';
const OTHER = 'test-untracked-item';

function seed(available) {
  products.upsert({
    id: ID, name: 'Test Tin', sku: 'TEST-1', category: 'miscellaneous', subcategory: '',
    description: '', price: 100, unit: 'Tin', image: '', features: [], specs: {},
    isBulkEligible: false, minBulkQty: 1, isListed: true, stockTracked: true, stockAvailable: available,
  });
  products.setInventoryState(ID, true, true, available);
  products.upsert({
    id: OTHER, name: 'Untracked Service Item', sku: 'TEST-2', category: 'miscellaneous', subcategory: '',
    description: '', price: 50, unit: 'Unit', image: '', features: [], specs: {},
    isBulkEligible: false, minBulkQty: 1, isListed: true, stockTracked: false, stockAvailable: null,
  });
  products.setInventoryState(OTHER, true, false, null);
}
const stock = () => products.byId(ID).stockAvailable;

/* Sequential draining — the case that failed even without concurrency. */
seed(3);
const first = products.reserveStock([{ productId: ID, quantity: 2 }]);
check('the first order takes what it needs', first.ok === true);
check('and the figure actually moves', stock() === 1, `stock=${stock()}`);

const second = products.reserveStock([{ productId: ID, quantity: 2 }]);
check('a second order for more than is left is refused', second.ok === false);
check('the refusal says how many remain', second.ok === false && second.available === 1, `available=${second.available}`);
check('a refused order takes nothing', stock() === 1, `stock=${stock()}`);

const exact = products.reserveStock([{ productId: ID, quantity: 1 }]);
check('taking the last one exactly is allowed', exact.ok === true && stock() === 0, `stock=${stock()}`);
check('and the next order finds none', products.reserveStock([{ productId: ID, quantity: 1 }]).ok === false);

/* All-or-nothing across lines. */
seed(5);
const mixed = products.reserveStock([
  { productId: ID, quantity: 4 },
  { productId: OTHER, quantity: 1 },
]);
check('an untracked item alongside a tracked one is fine', mixed.ok === true, `stock=${stock()}`);

seed(5);
const partial = products.reserveStock([
  { productId: ID, quantity: 3 },
  { productId: ID, quantity: 3 },
]);
check('an order that cannot be filled completely reserves nothing', partial.ok === false && stock() === 5, `stock=${stock()}`);

/* Untracked items are not counted by the business, so they never run out. */
seed(0);
const untracked = products.reserveStock([{ productId: OTHER, quantity: 9999 }]);
check('an untracked item never runs out', untracked.ok === true);

/* A product the catalogue no longer has is somebody else's error to report. */
const missing = products.reserveStock([{ productId: 'no-such-product', quantity: 1 }]);
check('an unknown product does not throw here — pricing rejects it first', missing.ok === true);

console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
