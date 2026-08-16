/**
 * Confirms the courier margin lands on live quotations only, and at the set rate.
 *
 * The distinction is the whole point: the indicative table already carries its
 * own margin, so marking that up as well would charge the customer twice for
 * one risk. Google and Lalamove are both stubbed, so this needs no keys and no
 * network.
 *
 * Run:  node server/test/courier-markup.test.mjs /tmp/markup-test.db [percent]
 */

process.env.DATABASE_FILE = process.argv[2] ?? '/tmp/hds-markup-test.db';
process.env.ADMIN_PASSWORD='x'; process.env.SESSION_SECRET='y';
process.env.GOOGLE_MAPS_API_KEY='fake';
process.env.LALAMOVE_API_KEY='k'; process.env.LALAMOVE_API_SECRET='s';
process.env.COURIER_QUOTE_MARKUP_PERCENT = process.argv[3] ?? '15';

const COURIER_PRICE = 200;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('maps.googleapis.com')) {
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({
      status: 'OK',
      results: [{ geometry: { location: { lat: 14.58, lng: 121.06 }, location_type: 'ROOFTOP' }, formatted_address: 'Somewhere, Pasig' }],
    })};
  }
  if (u.includes('lalamove') && u.includes('quotations')) {
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({
      data: { quotationId: 'Q1', priceBreakdown: { total: String(COURIER_PRICE) } },
    })};
  }
  return { ok: false, status: 404, statusText: 'NF', text: async () => '', json: async () => ({}) };
};

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { quoteDeliveryOptions } = await import(
  new URL(path.join(HERE, '..', 'dist', 'lib', 'delivery.js'), 'file://').href
);
// Explicit coordinates, so the distance is arithmetic rather than a guess and
// the fallback's price can be asserted exactly instead of approximately.
const DEST = { lat: 14.58, lng: 121.06 };
const address = {
  contactName: 'T', phone: '1', line1: '12 Real St',
  city: 'Pasig', province: 'Metro Manila', ...DEST,
};

/** The same haversine the delivery module uses, so the expected fee is derivable. */
function km(aLat, aLng, bLat, bLng) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const DISTANCE = km(14.5578, 121.1327, DEST.lat, DEST.lng);
const round2 = (n) => Math.round(n * 100) / 100;
const options = await quoteDeliveryOptions(1000, address);

// A second pass with Lalamove unreachable, to prove the indicative fallback is
// NOT marked up. That is the invariant the markup must respect: the fallback
// table already carries its own margin.
const liveFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes('lalamove')) throw new Error('unreachable');
  return liveFetch(url);
};
const fallbackOptions = await quoteDeliveryOptions(1000, address);
globalThis.fetch = liveFetch;

const pct = Number(process.env.COURIER_QUOTE_MARKUP_PERCENT);
const expected = Math.round(COURIER_PRICE * (1 + pct/100) * 100) / 100;
const moto = options.find(o => o.serviceCode === 'MOTORCYCLE');
const fallbackMoto = fallbackOptions.find(o => o.serviceCode === 'MOTORCYCLE');

let pass = 0, total = 0;
const check = (label, ok, detail='') => { total++; if (ok) pass++; console.log(`  ${ok?'ok  ':'FAIL'} ${label}${detail?'  — '+detail:''}`); };

check(`live Lalamove quote of ${COURIER_PRICE} is charged at ${expected} (+${pct}%)`,
  moto?.fee === expected, `got ${moto?.fee}`);
check('it is still marked as a live quote', moto?.isLiveQuote === true);
const expectedFallback = round2(60 + DISTANCE * 8);
check('an indicative fallback is NOT marked up — its table already has margin',
  fallbackMoto?.isLiveQuote === false && fallbackMoto?.fee === expectedFallback,
  `got ${fallbackMoto?.fee}, expected ${expectedFallback}`);
check('and marking it up would have been visible, so the check has teeth',
  round2(expectedFallback * 1.15) !== expectedFallback);
console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
